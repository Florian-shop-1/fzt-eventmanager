/**
 * Aus einem Angebot wird eine Rechnung.
 *
 * Der Ablauf, wie Florian ihn am 25.09.2026 beschrieben hat: Man wird
 * sich einig, die Rechnung geht raus mit der Bitte, innerhalb von sieben
 * Tagen zu zahlen. Der Termin ist reserviert, fest gebucht ist er mit
 * dem Geldeingang.
 *
 * Deshalb werden die Positionen aus dem Angebot übernommen, nicht neu
 * eingegeben: Was der Kunde zugesagt hat, muss auf der Rechnung stehen,
 * Wort für Wort und Cent für Cent. Optionale Positionen fallen weg, die
 * hat er ja gerade nicht genommen.
 */

import { db } from "@/lib/db/client";
import { holeAngebot } from "@/lib/angebot/lesen";
import { angebotssumme } from "@/lib/angebot/erstellen";
import { angebotsAbsender } from "@/lib/angebot/pdfdaten";
import { rechnungAnlegen, rechnungLesen, type Rechnung } from "./db";

/** Zahlungsziel für Firmenrechnungen: sieben Tage. */
export const ZAHLUNGSZIEL_TAGE = 7;

/**
 * Der Hinweis, der auf jeder Eventrechnung steht.
 *
 * Er ist die Fortsetzung dessen, was schon im Angebot stand, und der
 * Grund, warum überhaupt so früh eine Rechnung kommt.
 */
export const RESERVIERUNGSHINWEIS =
  "Wir haben euren Termin reserviert. Bitte überweist den Betrag innerhalb von sieben Tagen, " +
  "dann ist eure Veranstaltung fest gebucht. Bis zum Zahlungseingang bleibt die Reservierung " +
  "unverbindlich.";

/** Nächste freie Rechnungsnummer im Format RE-MMJJ-NNNN. */
export async function naechsteRechnungsnummer(heute = new Date()): Promise<string> {
  const praefix = `RE-${String(heute.getMonth() + 1).padStart(2, "0")}${String(
    heute.getFullYear(),
  ).slice(-2)}-`;
  const zeilen = (await db()`
    select nummer from rechnung where nummer like ${praefix + "%"} order by nummer desc limit 1
  `) as Array<{ nummer: string }>;
  const letzte = zeilen.length > 0 ? Number(zeilen[0].nummer.split("-")[2]) : 0;
  return praefix + String(letzte + 1).padStart(4, "0");
}

export class RechnungFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = "RechnungFehler";
  }
}

/**
 * Legt die Rechnung zu einem Angebot an.
 *
 * Gibt es schon eine, wird sie zurückgegeben statt einer zweiten. Zwei
 * Rechnungen über dieselbe Veranstaltung sind ein Ärgernis, das sich
 * hinterher nur mit einer Gutschrift lösen lässt.
 */
export async function rechnungAusAngebot(angebotId: string, wer: string): Promise<Rechnung> {
  const angebot = await holeAngebot(angebotId);
  if (!angebot) throw new RechnungFehler("Das Angebot wurde nicht gefunden.");

  const [vorhanden] = (await db()`
    select id from rechnung where angebot_id = ${angebotId} and storniert_am is null limit 1
  `) as Array<{ id: string }>;
  if (vorhanden) return (await rechnungLesen(String(vorhanden.id)))!;

  // Optionale Positionen hat der Kunde nicht genommen.
  const positionen = angebot.positionen.filter((p) => !p.istAlternativeZu);
  if (positionen.length === 0) throw new RechnungFehler("Dieses Angebot hat keine Positionen.");

  const summe = angebotssumme(positionen);
  const absender = await angebotsAbsender();
  const nummer = await naechsteRechnungsnummer();

  const leistung = angebot.vorstellung
    ? `Veranstaltung am ${angebot.vorstellung.datum.split("-").reverse().join(".")}, ${angebot.vorstellung.show}`
    : "Veranstaltung im Florian Zimmer Theater";

  const rechnung = await rechnungAnlegen({
    nummer,
    quelle: "vorgang",
    vorgangId: angebot.vorgangId,
    kunde: angebot.kunde.name,
    kundeEmail: angebot.kunde.email,
    betragCent: summe.bruttoCent,
    zahlungszielTage: ZAHLUNGSZIEL_TAGE,
    leistung,
    notiz: `Aus Angebot ${angebot.nummer}`,
    von: wer,
  });

  /*
    Positionen und Absender getrennt nachtragen: rechnungAnlegen kennt
    sie nicht, und die Funktion soll für den Weinverkauf unverändert
    bleiben, der ohne sie auskommt.
  */
  await db()`
    update rechnung
       set angebot_id = ${angebotId},
           positionen = ${JSON.stringify(positionen)}::jsonb,
           absender = ${JSON.stringify(absender)}::jsonb,
           leistungszeitraum = ${angebot.vorstellung?.datum ?? ""},
           geaendert_am = now()
     where id = ${rechnung.id}
  `;

  return (await rechnungLesen(rechnung.id))!;
}
