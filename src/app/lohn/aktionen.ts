"use server";

/**
 * Freigeben und verschicken der Stundenmeldung.
 *
 * Werner bestätigt zuerst, erst danach lässt sich die Mail an das
 * Steuerbüro abschicken. Beide Schritte sind bewusst getrennt, solange
 * wir testen (Florian, 29.09.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfZeitenAendern } from "@/lib/auth/sitzung";
import { angebotsAbsender } from "@/lib/angebot/pdfdaten";
import { mailVerschicken } from "@/lib/mail/versand";
import { alsStunden, zeitenImZeitraum } from "@/lib/lohn/auswertung";
import { dateiname, protokollListe, summenListe } from "@/lib/lohn/liste";
import {
  bestaetigen,
  einstellungLesen,
  einstellungSpeichern,
  freigabeZuruecknehmen,
  meldungLesen,
  versandMerken,
} from "@/lib/lohn/meldung";
import { lohnPdf } from "@/lib/lohn/pdf";
import { istZeitraumSchluessel, laufenderZeitraum, zeitraumVon } from "@/lib/lohn/zeitraum";

const UMBRUCH = String.fromCharCode(10);
const datumDe = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

async function verlangeBuero() {
  const b = await angemeldeterBenutzer();
  if (!darfZeitenAendern(b)) {
    throw new Error("Die Stundenmeldung dürfen nur Werner, Kevin und Florian bearbeiten.");
  }
  return b!;
}

function zeitraumAus(f: FormData) {
  const roh = String(f.get("zeitraum") ?? "");
  return istZeitraumSchluessel(roh) ? zeitraumVon(roh) : laufenderZeitraum();
}

function zurueck(schluessel: string, meldung: string): never {
  revalidatePath("/lohn");
  redirect(`/lohn?zeitraum=${schluessel}&meldung=${encodeURIComponent(meldung)}`);
}

/** Werner gibt die Stunden frei. */
export async function freigeben(f: FormData): Promise<void> {
  const b = await verlangeBuero();
  const z = zeitraumAus(f);
  await bestaetigen(z.schluessel, b.name ?? b.email);
  zurueck(z.schluessel, `${z.name} ist freigegeben. Jetzt lässt sich die Meldung verschicken.`);
}

/** Die Freigabe wieder zurücknehmen, solange nichts draußen ist. */
export async function freigabeLoesen(f: FormData): Promise<void> {
  await verlangeBuero();
  const z = zeitraumAus(f);
  await freigabeZuruecknehmen(z.schluessel);
  zurueck(z.schluessel, `Die Freigabe für ${z.name} ist zurückgenommen.`);
}

/** Die Adresse des Steuerbüros. */
export async function adresseSpeichern(f: FormData): Promise<void> {
  await verlangeBuero();
  const z = zeitraumAus(f);
  const adresse = String(f.get("steuerbuero") ?? "").trim().slice(0, 200);
  if (adresse && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
    zurueck(z.schluessel, "Das sieht nicht nach einer Mailadresse aus. Bitte noch einmal prüfen.");
  }
  await einstellungSpeichern({
    steuerbuero: adresse,
    steuerbueroName: String(f.get("steuerbueroName") ?? "").trim().slice(0, 120),
    kopieAn: String(f.get("kopieAn") ?? "").trim().slice(0, 200),
  });
  zurueck(z.schluessel, "Gespeichert.");
}

/**
 * Die Meldung ans Steuerbüro schicken.
 *
 * Erst wenn die Mail wirklich draußen ist, wird der Versand vermerkt.
 * Andersherum stünde "verschickt" auch dann da, wenn nie etwas ankam.
 */
export async function anSteuerbueroSchicken(f: FormData): Promise<void> {
  const b = await verlangeBuero();
  const z = zeitraumAus(f);

  const meldung = await meldungLesen(z.schluessel);
  if (!meldung.bestaetigtAm) {
    zurueck(z.schluessel, "Bitte zuerst freigeben. Ohne Freigabe geht nichts hinaus.");
  }

  const e = await einstellungLesen();
  if (!e.steuerbuero) {
    zurueck(z.schluessel, "Es fehlt die Mailadresse des Steuerbüros. Bitte unten eintragen.");
  }

  const leute = await zeitenImZeitraum(z);
  if (leute.length === 0) {
    zurueck(z.schluessel, "Für diesen Zeitraum gibt es keine Stunden. Es wurde nichts verschickt.");
  }

  const pdf = await lohnPdf({
    zeitraum: z,
    leute,
    absender: await angebotsAbsender(),
    bestaetigtVon: meldung.bestaetigtVon,
  });

  const summe = leute.reduce((s, p) => s + p.arbeitMinuten, 0);
  const zeilen = leute.map((p) => {
    const dazu = [
      p.urlaubstage ? `${p.urlaubstage} Urlaubstage` : "",
      p.kranktage ? `${p.kranktage} Kranktage` : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `- ${p.name}: ${alsStunden(p.arbeitMinuten)} Stunden${dazu ? ` (${dazu})` : ""}`;
  });

  const text = [
    "Guten Tag Frau Buschow,",
    "",
    `anbei die Arbeitszeiten vom ${datumDe(z.von)} bis ${datumDe(z.bis)}.`,
    "",
    ...zeilen,
    "",
    `Zusammen ${alsStunden(summe)} Stunden für ${leute.length} Mitarbeiter.`,
    "",
    "Im Anhang liegen die Übersicht als PDF sowie zwei Tabellen: die Liste mit den",
    "Summen je Mitarbeiter und das Protokoll mit den einzelnen Tagen.",
    "",
    "Bei Rückfragen melden Sie sich gerne.",
    "",
    "Herzliche Grüße",
    b.name ?? "Florian Zimmer Theater",
    "Florian Zimmer Theater",
  ].join(UMBRUCH);

  await mailVerschicken({
    an: e.steuerbuero,
    blindkopie: e.kopieAn || undefined,
    betreff: `Arbeitszeiten ${datumDe(z.von)} bis ${datumDe(z.bis)} - Florian Zimmer Theater`,
    text,
    anhaenge: [
      { name: dateiname(z, "Meldung", "pdf"), typ: "application/pdf", base64: pdf.toString("base64") },
      {
        name: dateiname(z, "Liste", "csv"),
        typ: "text/csv",
        base64: Buffer.from(summenListe(z, leute), "utf8").toString("base64"),
      },
      {
        name: dateiname(z, "Protokoll", "csv"),
        typ: "text/csv",
        base64: Buffer.from(protokollListe(z, leute), "utf8").toString("base64"),
      },
    ],
  });

  await versandMerken(z, e.steuerbuero, leute);
  zurueck(z.schluessel, `Die Meldung für ${z.name} ist an ${e.steuerbuero} verschickt.`);
}
