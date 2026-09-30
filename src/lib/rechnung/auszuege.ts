/**
 * Welche Kontoauszüge und Kartenabrechnungen schon eingelesen wurden.
 *
 * Doppelte Umsätze kann es nicht geben, dafür sorgt ihr Fingerabdruck
 * beim Einlesen. Der Mensch davor weiss das aber nicht: Er lädt dieselbe
 * Abrechnung noch einmal hoch und liest danach "0 neue Umsätze", ohne zu
 * erfahren, dass sie längst da ist (Florian, 30.09.2026).
 *
 * Deshalb dieser kleine Merkzettel. Er beantwortet zwei Fragen: Habe ich
 * diese Datei schon eingelesen, und welche Zeiträume fehlen mir noch?
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";

export interface EingelesenerAuszug {
  id: string;
  hash: string;
  dateiname: string;
  konto: string;
  vonDatum: string | null;
  bisDatum: string | null;
  umsaetze: number;
  neu: number;
  wer: string;
  angelegtAm: string;
}

function baue(z: Record<string, unknown>): EingelesenerAuszug {
  return {
    id: String(z.id),
    hash: String(z.hash),
    dateiname: String(z.dateiname ?? ""),
    konto: String(z.konto ?? ""),
    vonDatum: (z.von_datum as string) ?? null,
    bisDatum: (z.bis_datum as string) ?? null,
    umsaetze: Number(z.umsaetze ?? 0),
    neu: Number(z.neu ?? 0),
    wer: String(z.wer ?? ""),
    angelegtAm: new Date(z.angelegt_am as string).toISOString(),
  };
}

/** Der Fingerabdruck einer Datei. Der Inhalt zählt, nicht der Name. */
export function dateiAbdruck(inhalt: Buffer): string {
  return createHash("sha256").update(inhalt).digest("hex");
}

/** Kennen wir diese Datei schon? */
export async function auszugMitAbdruck(hash: string): Promise<EingelesenerAuszug | null> {
  const z = (await db()`
    select id, hash, dateiname, konto, von_datum::text as von_datum, bis_datum::text as bis_datum,
           umsaetze, neu, wer, angelegt_am
      from kontoauszug_datei where hash = ${hash} limit 1
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

export async function auszugVermerken(o: {
  hash: string;
  dateiname: string;
  konto: string;
  vonDatum: string | null;
  bisDatum: string | null;
  umsaetze: number;
  neu: number;
  wer: string;
}): Promise<void> {
  await db()`
    insert into kontoauszug_datei (hash, dateiname, konto, von_datum, bis_datum, umsaetze, neu, wer)
    values (${o.hash}, ${o.dateiname}, ${o.konto}, ${o.vonDatum}::date, ${o.bisDatum}::date,
            ${o.umsaetze}, ${o.neu}, ${o.wer})
    on conflict (hash) do nothing
  `;
}

/** Die zuletzt eingelesenen Dateien, neueste zuerst. */
export async function eingeleseneAuszuege(hoechstens = 25): Promise<EingelesenerAuszug[]> {
  const z = (await db()`
    select id, hash, dateiname, konto, von_datum::text as von_datum, bis_datum::text as bis_datum,
           umsaetze, neu, wer, angelegt_am
      from kontoauszug_datei
     order by angelegt_am desc
     limit ${hoechstens}
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(baue);
}
