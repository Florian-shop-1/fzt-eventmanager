/**
 * Eine Mail ans Lohnbüro, wenn beides da ist.
 *
 * "bitte mach es in Zukunft so, dass die Mail an Werner und Buschow erst
 * ausgelöst wird, wenn Personalbogen und Arbeitsvertrag ausgefüllt sind.
 * Sie kriegt also eine Mail mit zwei Anhängen, du wartest, bis beides da
 * ist" (Florian, 15.10.2026).
 *
 * Vorher ging der Personalbogen sofort beim Absenden hinaus und der
 * Vertrag gar nicht. Frau Buschow bekam also die halbe Akte und musste
 * den Rest anmahnen. Jetzt wartet der Eventmanager, bis Bogen und
 * unterschriebener Vertrag vorliegen, und schickt beides zusammen.
 *
 * Angestoßen wird das an drei Stellen, und zwar jedes Mal: nach dem
 * Personalbogen, nach der Unterschrift unter den Vertrag und beim
 * Nachtragen durchs Büro. Welche davon zuerst kommt, ist egal; erst wenn
 * beides vorliegt, geht etwas hinaus. Verschickt wird je Vertrag nur
 * einmal (arbeitsvertrag.lohnbuero_am), ein neuer Vertrag löst später
 * eine neue Mail aus.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";
import { vertragLesen } from "@/lib/db/arbeitsvertrag";
import { bogenVon } from "@/lib/db/personalbogen";
import { bogenDateiname, bogenPdf } from "./bogen-pdf";
import { vertragDateiname, vertragPdf } from "./vertrag-pdf";
import { ARTNAME } from "./arbeitsvertrag";

interface Anhang {
  name: string;
  typ: string;
  base64: string;
}

/** Empfänger aus den Lohneinstellungen, mit den bekannten Adressen als Rückfall. */
async function empfaenger(): Promise<string[]> {
  const z = (await db()`
    select steuerbuero, kopie_an from lohn_einstellung where id = 1
  `.catch(() => [])) as Array<{ steuerbuero: string | null; kopie_an: string | null }>;

  const liste = [z[0]?.steuerbuero, z[0]?.kopie_an]
    .map((a) => String(a ?? "").trim())
    .filter(Boolean);

  return liste.length > 0 ? liste : ["sabinebuschow@aol.com", "w.zimmer@florianzimmer.com"];
}

/**
 * Eine hochgeladene Datei aus den Personalunterlagen, falls es sie gibt.
 *
 * Für die Zeit vor dem Eventmanager: Papierverträge und die Bögen, die
 * nur als Mail ans Lohnbüro gingen und jetzt eingescannt im Ordner
 * liegen.
 */
async function ausDenUnterlagen(benutzerId: string, art: "bogen" | "vertrag"): Promise<Anhang | null> {
  const z = (await db()`
    select dateiname, typ, inhalt from personal_datei
     where benutzer_id = ${benutzerId}::uuid and art = ${art}
     order by hochgeladen_am desc limit 1
  `.catch(() => [])) as Array<{ dateiname: string; typ: string; inhalt: Buffer }>;

  const d = z[0];
  if (!d?.inhalt) return null;
  return {
    name: String(d.dateiname || `${art}.pdf`),
    typ: String(d.typ || "application/pdf"),
    base64: Buffer.from(d.inhalt).toString("base64"),
  };
}

export interface Paketstand {
  /** Verschickt worden? */
  verschickt: boolean;
  /** Warum nicht, in einem Satz fürs Protokoll. */
  grund: string;
  an?: string[];
}

/**
 * Prüft für eine Person, ob das Paket vollständig ist, und schickt es.
 *
 * Fehlt etwas, passiert nichts und niemand wird benachrichtigt: Das ist
 * der Normalfall zwischen Personalbogen und Unterschrift.
 */
export async function lohnbueroPaket(benutzerId: string): Promise<Paketstand> {
  // Der Vertrag, der gilt: unterschrieben, nicht zurückgezogen, nicht abgelöst.
  const v = (await db()`
    select id from arbeitsvertrag
     where benutzer_id = ${benutzerId}::uuid
       and unterschrieben_am is not null
       and zurueckgezogen_am is null
       and abgeloest_am is null
       and lohnbuero_am is null
     order by unterschrieben_am desc limit 1
  `.catch(() => [])) as Array<{ id: string }>;

  if (!v[0]) return { verschickt: false, grund: "Kein unterschriebener Vertrag offen." };

  const vertrag = await vertragLesen(v[0].id);
  if (!vertrag) return { verschickt: false, grund: "Vertrag nicht lesbar." };

  // Der Personalbogen: entweder die Angaben im Haus oder der Scan im Ordner.
  const bogen = await bogenVon(benutzerId);
  const bogenAnhang: Anhang | null = bogen
    ? {
        name: bogenDateiname(bogen.name),
        typ: "application/pdf",
        base64: (
          await bogenPdf({
            name: bogen.name,
            daten: bogen.daten,
            quelle: bogen.quelle,
            erfasstAm: bogen.erfasstAm,
          })
        ).toString("base64"),
      }
    : await ausDenUnterlagen(benutzerId, "bogen");

  if (!bogenAnhang) {
    return { verschickt: false, grund: "Personalbogen fehlt noch." };
  }

  // Der Vertrag als PDF, bei Papierverträgen der Scan.
  const vertragAnhang: Anhang | null = vertrag.vertragstext
    ? {
        name: vertragDateiname(vertrag),
        typ: "application/pdf",
        base64: (await vertragPdf(vertrag)).toString("base64"),
      }
    : await ausDenUnterlagen(benutzerId, "vertrag");

  if (!vertragAnhang) {
    return { verschickt: false, grund: "Vom Vertrag liegt keine Fassung zum Verschicken vor." };
  }

  const an = await empfaenger();
  const lohn =
    vertrag.stundenlohnCent !== null
      ? `${(vertrag.stundenlohnCent / 100).toFixed(2).replace(".", ",")} Euro je Stunde`
      : vertrag.festgehaltCent !== null
        ? `${(vertrag.festgehaltCent / 100).toFixed(2).replace(".", ",")} Euro im Monat`
        : "siehe Vertrag";

  const de = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");

  const zeilen = [
    "Hallo zusammen,",
    "",
    `anbei die Unterlagen von ${vertrag.name} zur Anmeldung.`,
    "",
    `Beschäftigungsart: ${ARTNAME[vertrag.art] ?? vertrag.art}`,
    `Tätigkeit: ${vertrag.taetigkeit || vertrag.position || "siehe Vertrag"}`,
    `Beginn: ${de(vertrag.beginn)}${vertrag.ende ? `, befristet bis ${de(vertrag.ende)}` : ""}`,
    `Vergütung: ${lohn}`,
    `Unterschrieben am: ${de(vertrag.unterschriebenAm)}`,
    "",
    "Im Anhang der Personalbogen und der unterschriebene Arbeitsvertrag.",
    "",
    "Herzliche Grüße",
    "Florian Zimmer Theater",
  ];

  const text = zeilen.join(String.fromCharCode(10));
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1b19">${zeilen
    .map((z) => (z === "" ? "<p style=\"margin:0 0 10px\"></p>" : `<p style="margin:0 0 6px">${z}</p>`))
    .join("")}</div>`;

  await mailVerschicken({
    an,
    absender: postfachPersonal(),
    antwortAn: antwortPersonal(),
    betreff: `Anmeldung ${vertrag.name}: Personalbogen und Arbeitsvertrag`,
    text,
    html,
    anhaenge: [bogenAnhang, vertragAnhang],
  });

  await db()`update arbeitsvertrag set lohnbuero_am = now() where id = ${vertrag.id}`;

  return { verschickt: true, grund: "Verschickt.", an };
}

/**
 * Wie oben, aber ohne dass ein Fehler den Aufrufer stört.
 *
 * Gedacht für die Stellen, an denen der Mitarbeiter etwas abgeschickt
 * hat: Dass die Mail ans Lohnbüro klemmt, darf ihm nicht seinen Vorgang
 * verderben. Im Protokoll steht es trotzdem.
 */
export async function lohnbueroPaketStill(benutzerId: string): Promise<void> {
  try {
    const stand = await lohnbueroPaket(benutzerId);
    if (stand.verschickt) console.log("[lohnbuero] Paket verschickt an", stand.an?.join(", "));
  } catch (e) {
    console.error("[lohnbuero] Paket nicht verschickt:", e);
  }
}
