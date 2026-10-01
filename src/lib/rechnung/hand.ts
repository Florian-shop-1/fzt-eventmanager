/**
 * Eine Ausgangsrechnung von Hand.
 *
 * Nicht jede Rechnung kommt aus einem Angebot: eine Weiterberechnung, ein
 * Zuschuss, eine Leistung für ein anderes Haus. Dafür gab es bisher
 * nichts, und solche Rechnungen entstanden außerhalb des Programms und
 * fehlten dann beim Abgleich mit dem Konto (Florian, 01.10.2026).
 *
 * Sie bekommt dieselbe Nummer aus demselben Kreis, dasselbe PDF im
 * Hausstil und läuft danach denselben Weg: verschicken, Zahlungseingang
 * abgleichen, erinnern.
 */

import { db } from "@/lib/db/client";
import type { Position } from "@/lib/domain/vorgang";
import { angebotsAbsender } from "@/lib/angebot/pdfdaten";
import { naechsteRechnungsnummer } from "./aus-angebot";
import { einstellung, rechnungAnlegen, rechnungLesen, type Rechnung } from "./db";

export interface HandPosition {
  bezeichnung: string;
  beschreibung?: string;
  menge: number;
  einheit: string;
  einzelBruttoCent: number;
  ust: number;
}

export interface HandRechnung {
  kunde: string;
  ansprechpartner?: string;
  email?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  leistung: string;
  leistungszeitraum?: string;
  rechnungsdatum?: string;
  zahlungszielTage?: number;
  notiz?: string;
  positionen: HandPosition[];
  von: string;
}

export function summeCent(positionen: HandPosition[]): number {
  return positionen.reduce((s, p) => s + Math.round(p.einzelBruttoCent * p.menge), 0);
}

export async function handRechnungAnlegen(o: HandRechnung): Promise<Rechnung> {
  if (!o.kunde.trim()) throw new Error("Bitte den Namen des Kunden eintragen.");
  const positionen = o.positionen.filter((p) => p.bezeichnung.trim() && p.menge > 0);
  if (positionen.length === 0) throw new Error("Bitte mindestens eine Position mit Menge und Preis eintragen.");

  const betragCent = summeCent(positionen);
  if (betragCent <= 0) throw new Error("Der Rechnungsbetrag muss größer als null sein.");

  const nummer = await naechsteRechnungsnummer();
  const ziel = o.zahlungszielTage ?? (await einstellung()).zahlungszielTage;

  const rechnung = await rechnungAnlegen({
    nummer,
    quelle: "hand",
    kunde: o.kunde.trim(),
    kundeEmail: (o.email ?? "").trim(),
    betragCent,
    rechnungsdatum: o.rechnungsdatum,
    zahlungszielTage: ziel,
    leistung: o.leistung.trim(),
    notiz: o.notiz ?? "",
    von: o.von,
  });

  /*
    Positionen, Anschrift und Absender kommen getrennt dazu.

    Der Absender wird mitgespeichert, nicht nachgeschlagen: Ändert sich
    später die Bankverbindung, muss eine alte Rechnung trotzdem so
    aussehen wie an dem Tag, an dem sie rausging.
  */
  const vollePositionen: Position[] = positionen.map((p, i) => ({
    id: `hand-${i + 1}`,
    artikelNummer: "",
    bezeichnung: p.bezeichnung.trim(),
    beschreibung: p.beschreibung?.trim() || undefined,
    menge: p.menge,
    einheit: p.einheit || "Stück",
    einzelBruttoCent: p.einzelBruttoCent,
    ust: p.ust,
  }));

  const anschrift = {
    ansprechpartner: (o.ansprechpartner ?? "").trim(),
    strasse: (o.strasse ?? "").trim(),
    plz: (o.plz ?? "").trim(),
    ort: (o.ort ?? "").trim(),
  };

  await db()`
    update rechnung
       set positionen = ${JSON.stringify(vollePositionen)}::jsonb,
           absender = ${JSON.stringify(await angebotsAbsender())}::jsonb,
           kunde_anschrift = ${JSON.stringify(anschrift)}::jsonb,
           leistungszeitraum = ${o.leistungszeitraum ?? ""},
           geaendert_am = now()
     where id = ${rechnung.id}
  `;

  return (await rechnungLesen(rechnung.id))!;
}
