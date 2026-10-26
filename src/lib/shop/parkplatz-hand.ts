/**
 * VIP-Parkplätze, die wir selbst vergeben.
 *
 * Nicht jeder Platz kommt aus dem Ticketshop. Manche werden am Telefon
 * gebucht, andere verschenken wir. Die stehen in unserer eigenen
 * Datenbank, denn in die Tabelle des Shops dürfen wir nicht schreiben
 * (Florian, 29.09.2026).
 *
 * Auf der Parkplatzseite laufen beide Quellen zusammen, und das Schild
 * wird für beide gleich gedruckt: Auf dem Parkplatz sieht man dem Auto
 * nicht an, wie es gebucht wurde.
 */

import { db } from "@/lib/db/client";
import { nameOrdentlich } from "@/lib/domain/namen";
import type { Parkplatzbuchung } from "./parkplaetze";

export interface HandParkplatz {
  id: string;
  datum: string;
  /** HH:MM der Show, zu der der Platz gehört. Leer: nicht angegeben. */
  uhrzeit: string;
  /** Menü dazu? Null: hat niemand gesagt. Siehe migrations/204. */
  menue: boolean | null;
  name: string;
  email: string;
  anzahl: number;
  notiz: string;
  erfasstVon: string;
  erstelltAm: string;
}

/**
 * Wer einen Parkplatz von Hand vergeben darf: Florian, Kevin und das Foyer.
 *
 * Dieselben Leute wie bei den Geschenken. Das Foyer steht abends mit den
 * Gästen zusammen und merkt als Erstes, wem ein Platz guttut.
 */
export function darfParkplatzEintragen(
  b: { rolle: string; email: string } | null | undefined,
): boolean {
  if (!b) return false;
  if (b.rolle === "chef" || b.rolle === "foyer") return true;
  return b.email.toLowerCase() === "kevin.steele@florianzimmer.com";
}

function baue(r: Record<string, unknown>): HandParkplatz {
  return {
    id: String(r.id),
    datum: String(r.datum),
    uhrzeit: String(r.uhrzeit ?? ""),
    menue: r.menue === null || r.menue === undefined ? null : Boolean(r.menue),
    name: String(r.name),
    email: String(r.email ?? ""),
    anzahl: Number(r.anzahl ?? 1),
    notiz: String(r.notiz ?? ""),
    erfasstVon: String(r.erfasst_von ?? ""),
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
  };
}

export async function handParkplaetzeAmTag(datum: string): Promise<HandParkplatz[]> {
  const z = (await db()`
    select id, datum::text as datum, uhrzeit, menue, name, email, anzahl, notiz,
           erfasst_von, erstellt_am
      from parkplatz_hand where datum = ${datum}::date order by uhrzeit, name
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function parkplatzVonHand(o: {
  datum: string;
  uhrzeit: string;
  menue: boolean | null;
  name: string;
  email: string;
  anzahl: number;
  notiz: string;
  erfasstVon: string;
}): Promise<void> {
  const name = nameOrdentlich(o.name.trim());
  if (!name) throw new Error("Ohne Namen steht nichts auf dem Schild.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.datum)) throw new Error("Bitte den Abend angeben.");

  // Die Uhrzeit nur, wenn sie wie eine aussieht: Sonst stünde Unsinn in
  // der Spalte, nach der die Liste die Shows trennt.
  const uhrzeit = /^\d{1,2}:\d{2}$/.test(o.uhrzeit.trim()) ? o.uhrzeit.trim().padStart(5, "0") : "";

  await db()`
    insert into parkplatz_hand (datum, uhrzeit, menue, name, email, anzahl, notiz, erfasst_von)
    values (${o.datum}::date, ${uhrzeit}, ${o.menue}, ${name}, ${o.email.trim().slice(0, 200)},
            ${Math.max(1, Math.min(20, o.anzahl))}, ${o.notiz.trim().slice(0, 300)}, ${o.erfasstVon})
  `;
}

export async function parkplatzWeg(id: string): Promise<void> {
  await db()`delete from parkplatz_hand where id = ${id}::uuid`;
}

/**
 * Einen Eintrag von Hand so aussehen lassen wie eine Buchung.
 *
 * Damit die Seite und der Schilddruck nur eine Sorte Daten kennen müssen.
 * Die Kennung traegt den Zusatz "hand:", daran erkennt die Seite, dass sie
 * einen Löschknopf anbieten kann.
 *
 * Die Uhrzeit kommt aus dem Eintrag, wenn eine dabeisteht. Ältere Einträge
 * haben keine, die bekommen die des Tages, so wie bisher.
 */
export function alsBuchung(p: HandParkplatz, eventName: string, uhrzeit: string): Parkplatzbuchung {
  return {
    quelle: "hand",
    orderId: `hand:${p.id}`,
    name: p.name,
    email: p.email,
    ditixEventId: "",
    eventName,
    datum: p.datum,
    uhrzeit: p.uhrzeit || uhrzeit,
    anzahl: p.anzahl,
    menue: p.menue,
    schildUrl: null,
  };
}
