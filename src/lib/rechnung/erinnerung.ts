/**
 * Die freundliche Erinnerung an eine offene Rechnung.
 *
 * "nach ablauf der 14 Tage eine freundliche erinnerung an den kunden
 * senden :-)" (Florian, 01.10.2026). Freundlich ist dabei wörtlich zu
 * nehmen: Die meisten haben es schlicht vergessen, und wer beim ersten
 * Mal angefahren wird, bucht beim nächsten Mal woanders.
 *
 * Erinnert wird nur, wenn alles dafür spricht: Die Rechnung ist raus, die
 * Frist ist um, es ist noch nichts angekommen, und die letzte Erinnerung
 * ist mindestens eine Woche her. Nach der dritten hört das Programm auf;
 * dann ist es eine Sache fürs Telefon, nicht für die Automatik.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { merken, rechnungLesen, type Rechnung } from "./db";
import { rechnungsPdfEvent } from "./pdf-event";
import { rechnungsDateiname, rechnungsPdfDaten } from "./pdfdaten";

const UMBRUCH = String.fromCharCode(10);

/** Mehr als drei Erinnerungen schickt niemand mehr automatisch. */
export const HOECHSTENS = 3;

/** So viele Tage zwischen zwei Erinnerungen. */
export const ABSTAND_TAGE = 7;

const euro = (c: number) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
const datum = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/**
 * Der Text. Die erste Erinnerung geht davon aus, dass es untergegangen
 * ist; erst die dritte wird deutlicher, bleibt aber höflich.
 */
export function erinnerungsText(r: Rechnung, nummer: number): { betreff: string; text: string } {
  /*
    Eine Firma hat keinen Vornamen.

    "Hallo Musterfirma" liest sich wie ein Serienbrief, der schiefging.
    Steht hinter dem Namen eine Rechtsform, gruessen wir ohne Namen.
  */
  const firma = /\b(gmbh|ug|ag|kg|ohg|e\. ?v\.?|mbh|gbr|ltd|inc|co\.)\b/i.test(r.kunde);
  const anrede = r.kunde && !firma ? `Hallo ${r.kunde.split(" ")[0]},` : "Hallo,";
  const offen = euro(r.offenCent);

  const mitte =
    nummer <= 1
      ? [
          `vermutlich ist es im Alltag untergegangen, das kennen wir gut: Unsere Rechnung ${r.nummer} vom ${datum(r.rechnungsdatum)} über ${euro(r.betragCent)} Euro war bis zum ${datum(r.faelligAm)} fällig, und bei uns ist noch nichts angekommen.`,
          "",
          `Offen sind ${offen} Euro. Die Rechnung hängt noch einmal an.`,
        ]
      : nummer === 2
        ? [
            `wir möchten noch einmal freundlich an unsere Rechnung ${r.nummer} vom ${datum(r.rechnungsdatum)} erinnern. Sie war am ${datum(r.faelligAm)} fällig, offen sind ${offen} Euro.`,
            "",
            "Falls die Rechnung nicht angekommen ist oder etwas nicht stimmt, sagt uns bitte kurz Bescheid, dann klären wir das gleich.",
          ]
        : [
            `unsere Rechnung ${r.nummer} vom ${datum(r.rechnungsdatum)} ist weiterhin offen, inzwischen seit ${r.tageUeberfaellig} Tagen. Offen sind ${offen} Euro.`,
            "",
            "Bitte überweist den Betrag in den nächsten Tagen oder meldet euch bei uns, damit wir gemeinsam eine Lösung finden.",
          ];

  return {
    betreff: `Erinnerung: Rechnung ${r.nummer} vom Florian Zimmer Theater`,
    text: [
      anrede,
      "",
      ...mitte,
      "",
      "Hat sich das mit eurer Überweisung überschnitten? Dann ist dieses Schreiben hinfällig, und wir danken euch.",
      "",
      "Herzliche Grüße",
      "Florian Zimmer Theater",
    ].join(UMBRUCH),
  };
}

/** Eine Erinnerung verschicken, mit der Rechnung im Anhang. */
export async function erinnerungVerschicken(rechnungId: string, wer: string): Promise<string> {
  const r = await rechnungLesen(rechnungId);
  if (!r) throw new Error("Diese Rechnung gibt es nicht.");
  if (!r.kundeEmail) throw new Error("Für diesen Kunden ist keine Mailadresse hinterlegt.");

  const { betreff, text } = erinnerungsText(r, r.erinnerungen + 1);

  const anhaenge = [];
  const daten = await rechnungsPdfDaten(rechnungId).catch(() => null);
  if (daten) {
    const pdf = await rechnungsPdfEvent(daten);
    anhaenge.push({
      name: rechnungsDateiname(daten.nummer),
      typ: "application/pdf",
      base64: pdf.toString("base64"),
    });
  }

  await mailVerschicken({ an: r.kundeEmail, betreff, text, anhaenge });

  await db()`
    update rechnung set erinnert_am = now(), erinnerungen = erinnerungen + 1, geaendert_am = now()
     where id = ${rechnungId}
  `;
  await merken({
    rechnungId,
    art: "erinnerung",
    text: `${r.erinnerungen + 1}. Erinnerung an ${r.kundeEmail} verschickt`,
    wer,
  });

  return r.kundeEmail;
}

/**
 * Der tägliche Lauf: Wer ist dran?
 *
 * Storniertes, Bezahltes und noch nicht Verschicktes bleibt außen vor,
 * ebenso alles ohne Mailadresse. Eine Rechnung, die nie beim Kunden war,
 * zu mahnen wäre peinlich.
 */
export async function faelligeErinnerungen(): Promise<string[]> {
  const z = (await db()`
    select r.id
      from rechnung r
     where r.storniert_am is null
       and r.bezahlt_am is null
       and r.versendet_am is not null
       and r.kunde_email <> ''
       and r.faellig_am < current_date
       and r.erinnerungen < ${HOECHSTENS}
       and (r.erinnert_am is null or r.erinnert_am < now() - ${`${ABSTAND_TAGE} days`}::interval)
       and r.betrag_cent > coalesce(
             (select sum(z.betrag_cent) from rechnung_zahlung z where z.rechnung_id = r.id), 0)
     order by r.faellig_am
     limit 50
  `.catch(() => [])) as Array<{ id: string }>;

  const gemacht: string[] = [];
  for (const r of z) {
    try {
      const an = await erinnerungVerschicken(String(r.id), "Automatik");
      gemacht.push(`Erinnerung an ${an}`);
    } catch (f) {
      console.error("[rechnung] Erinnerung nicht verschickt:", f);
    }
  }
  return gemacht;
}
