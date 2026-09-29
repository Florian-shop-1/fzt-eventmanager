"use server";

/**
 * Die Belege eines Monats ans Steuerbüro schicken, je Firma getrennt.
 *
 * Drei Firmen, drei Empfänger, drei Sendungen (Florian, 29.09.2026):
 * das Theater an das Steuerbüro Buschow, die True Talent GmbH an das
 * Steuerbüro Katja Butz, und die Magic-Expert GbR an Werner, der ihre
 * Bücher selbst macht. Eine Mail enthält immer nur eine Firma.
 *
 * Verschickt wird auf Knopfdruck, nicht von allein. Und erst wenn die
 * Mail draußen ist, wird die Sendung vermerkt.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { mailVerschicken } from "@/lib/mail/versand";
import { euro, summen } from "@/lib/bewirtung/db";
import {
  gesellschaftKurz,
  gesellschaftName,
  istGesellschaft,
  type Gesellschaft,
} from "@/lib/bewirtung/gesellschaft";
import { belegeDerFirma, fotosZu, monatLesen } from "@/lib/bewirtung/monat";
import { belegeMonatsPdf } from "@/lib/bewirtung/pdf-monat";
import { empfaengerSpeichern, empfaengerVon, sendungMerken } from "@/lib/bewirtung/steuerbuero";

const UMBRUCH = String.fromCharCode(10);
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) throw new Error("Nur für die Buchhaltung.");
  return b!;
}

function zurueck(jahr: number, meldung: string): never {
  revalidatePath("/bewirtung");
  redirect(`/bewirtung?jahr=${jahr}&meldung=${encodeURIComponent(meldung)}`);
}

/** Wer die Belege einer Firma bekommt. */
export async function empfaengerAendern(f: FormData): Promise<void> {
  await zugang();
  const g = String(f.get("gesellschaft") ?? "");
  if (!istGesellschaft(g)) throw new Error("Unbekannte Firma.");
  const jahr = Number(f.get("jahr")) || new Date().getFullYear();

  const email = String(f.get("email") ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    zurueck(jahr, "Das sieht nicht nach einer Mailadresse aus. Bitte noch einmal prüfen.");
  }

  await empfaengerSpeichern(g as Gesellschaft, {
    name: String(f.get("name") ?? ""),
    email,
    kopieAn: String(f.get("kopieAn") ?? ""),
  });
  zurueck(jahr, `Gespeichert für die ${gesellschaftName(g)}.`);
}

/** Einen Monat einer Firma verschicken, mit PDF und Tabelle im Anhang. */
export async function monatSchicken(f: FormData): Promise<void> {
  const b = await zugang();

  const g = String(f.get("gesellschaft") ?? "");
  if (!istGesellschaft(g)) throw new Error("Unbekannte Firma.");
  const m = String(f.get("monat") ?? "");
  const mo = monatLesen(m);
  if (!mo) throw new Error("Monat fehlt.");

  const firma = gesellschaftName(g);
  const monatName = `${MONATE[mo.monat - 1]} ${mo.jahr}`;
  const e = await empfaengerVon(g as Gesellschaft);

  if (!e.email) {
    zurueck(mo.jahr, `Für die ${firma} fehlt noch die Mailadresse. Bitte unten eintragen.`);
  }

  const belege = await belegeDerFirma(mo.jahr, mo.monat, g as Gesellschaft);
  if (belege.length === 0) {
    zurueck(mo.jahr, `Für die ${firma} gibt es im ${monatName} keine Belege. Es wurde nichts verschickt.`);
  }

  const pdf = await belegeMonatsPdf({
    gesellschaft: g as Gesellschaft,
    monatName,
    belege,
    fotos: await fotosZu(belege),
  });

  const bew = summen(belege, "bewirtung", g as Gesellschaft);
  const eink = summen(belege, "einkauf", g as Gesellschaft);
  const fertig = belege.filter((x) => x.status === "fertig");
  const summeCent = fertig.reduce((n, x) => n + (x.bruttoCent ?? 0) + x.trinkgeldCent, 0);

  /*
    Die Anrede: Werner bekommt die Belege der Magic-Expert GbR selbst,
    und ihn siezt man nicht. Die beiden Steuerbüros schon.
  */
  const anWerner = g === "magic-expert";
  const text = [
    anWerner ? `Hallo ${e.name.split(" ")[0] || "Werner"},` : "Guten Tag,",
    "",
    `anbei die Belege der ${firma} für ${monatName}.`,
    "",
    `- ${eink.anzahl} Einkäufe, ${euro(eink.bruttoCent)} brutto, davon ${euro(eink.vorsteuerCent)} Vorsteuer`,
    `- ${bew.anzahl} Bewirtungen, ${euro(bew.bruttoCent + bew.trinkgeldCent)} inklusive Trinkgeld,` +
      ` davon ${euro(bew.abziehbarCent)} abziehbar`,
    "",
    "Im PDF steht vorne die Aufstellung, dahinter je Beleg eine Seite mit allen Angaben",
    "und dem Foto. Die Tabelle im zweiten Anhang enthält dieselben Belege zum Einlesen.",
    "",
    anWerner ? "Melde dich, wenn etwas fehlt." : "Bei Rückfragen melden wir uns gerne.",
    "",
    anWerner ? "Viele Grüße" : "Herzliche Grüße",
    b.name ?? "Florian Zimmer",
  ].join(UMBRUCH);

  const kurz = gesellschaftKurz(g).replace(/[^A-Za-z0-9-]/g, "");
  const csv = await tabelle(belege, firma);

  await mailVerschicken({
    an: e.email,
    blindkopie: e.kopieAn || undefined,
    betreff: `Belege ${monatName} - ${firma}`,
    text,
    anhaenge: [
      { name: `belege-${kurz}-${m}.pdf`, typ: "application/pdf", base64: pdf.toString("base64") },
      { name: `belege-${kurz}-${m}.csv`, typ: "text/csv", base64: Buffer.from(csv, "utf8").toString("base64") },
    ],
  });

  await sendungMerken({
    gesellschaft: g as Gesellschaft,
    monat: m,
    von: b.name ?? b.email,
    an: e.email,
    anzahl: fertig.length,
    summeCent,
  });

  zurueck(mo.jahr, `Die Belege der ${firma} für ${monatName} sind an ${e.email} verschickt.`);
}

/**
 * Dieselbe Tabelle wie beim Herunterladen, hier für den Anhang.
 *
 * Bewusst noch einmal aufgebaut statt die Route aufzurufen: Ein
 * Serveraufruf auf die eigene Anwendung würde einen zweiten Anmeldeweg
 * brauchen und könnte an der Vorschau scheitern.
 */
async function tabelle(belege: Awaited<ReturnType<typeof belegeDerFirma>>, firma: string): Promise<string> {
  const betrag = (c: number | null) => ((c ?? 0) / 100).toFixed(2).replace(".", ",");
  const feld = (s: string) => `"${s.replace(/"/g, '""').replace(/\r?\n/g, ", ")}"`;

  const kopf = [
    "Gesellschaft", "Beleg-Nr.", "Art", "Kategorie", "Datum", "Geschäft", "Anschrift", "Anlass bzw. Zweck",
    "Teilnehmer", "Brutto", "USt 7 %", "USt 19 %", "Netto", "Trinkgeld", "Abziehbar", "Nicht abziehbar",
    "Bezahlt", "Privat ausgelegt", "Zahlart laut Beleg", "Status", "Storno-Grund", "SHA-256 Foto",
  ];

  const zeilen = belege.map((b) => {
    const netto = (b.bruttoCent ?? 0) - b.mwst7Cent - b.mwst19Cent + b.trinkgeldCent;
    const abziehbar = b.art === "bewirtung" ? Math.round(netto * 0.7) : netto;
    return [
      feld(firma), feld(b.nummer ?? ""),
      b.art === "einkauf" ? "Einkauf" : "Bewirtung", feld(b.kategorie),
      b.datum?.split("-").reverse().join(".") ?? "", feld(b.restaurant), feld(b.anschrift),
      feld(b.art === "einkauf" ? b.zweck : b.anlass), feld(b.teilnehmer), betrag(b.bruttoCent),
      betrag(b.mwst7Cent), betrag(b.mwst19Cent), betrag(netto - b.trinkgeldCent), betrag(b.trinkgeldCent),
      betrag(abziehbar), betrag(netto - abziehbar), b.zahlweg === "bar" ? "bar" : "Karte",
      b.privatAusgelegt ? "ja" : "nein", feld(b.zahlart), b.status, feld(b.stornoGrund ?? ""), b.fotoHash,
    ].join(";");
  });

  return "﻿" + [kopf.join(";"), ...zeilen].join("\r\n");
}
