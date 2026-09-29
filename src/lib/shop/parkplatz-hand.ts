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
    select id, datum::text as datum, name, email, anzahl, notiz, erfasst_von, erstellt_am
      from parkplatz_hand where datum = ${datum}::date order by name
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function parkplatzVonHand(o: {
  datum: string;
  name: string;
  email: string;
  anzahl: number;
  notiz: string;
  erfasstVon: string;
}): Promise<void> {
  const name = nameOrdentlich(o.name.trim());
  if (!name) throw new Error("Ohne Namen steht nichts auf dem Schild.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.datum)) throw new Error("Bitte den Abend angeben.");

  await db()`
    insert into parkplatz_hand (datum, name, email, anzahl, notiz, erfasst_von)
    values (${o.datum}::date, ${name}, ${o.email.trim().slice(0, 200)},
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
 */
export function alsBuchung(p: HandParkplatz, eventName: string, uhrzeit: string): Parkplatzbuchung {
  return {
    orderId: `hand:${p.id}`,
    name: p.name,
    email: p.email,
    ditixEventId: "",
    eventName,
    datum: p.datum,
    uhrzeit,
    anzahl: p.anzahl,
    schildUrl: null,
  };
}
