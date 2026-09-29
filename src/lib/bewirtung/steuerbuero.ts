/**
 * Wer die Belege welcher Firma bekommt.
 *
 * Drei Firmen, drei Empfänger, drei getrennte Sendungen. Eine Mail, die
 * Belege aus zwei Firmen enthält, darf es nicht geben (Florian,
 * 29.09.2026).
 */

import { db } from "@/lib/db/client";
import { GESELLSCHAFTEN, gesellschaftName, type Gesellschaft } from "./gesellschaft";

export interface Empfaenger {
  gesellschaft: Gesellschaft;
  /** Firma, zu der die Belege gehören. */
  firma: string;
  /** Wer sie bekommt, etwa "Steuerbüro Katja Butz". */
  name: string;
  email: string;
  kopieAn: string;
}

export async function empfaengerLesen(): Promise<Empfaenger[]> {
  const zeilen = (await db()`
    select gesellschaft, name, email, kopie_an from beleg_steuerbuero
  `) as Array<Record<string, unknown>>;

  // Immer alle drei zurückgeben, auch wenn eine Zeile fehlt: Sonst
  // verschwände eine Firma einfach aus der Einstellung.
  return GESELLSCHAFTEN.map((g) => {
    const z = zeilen.find((x) => x.gesellschaft === g.wert);
    return {
      gesellschaft: g.wert,
      firma: g.name,
      name: String(z?.name ?? ""),
      email: String(z?.email ?? ""),
      kopieAn: String(z?.kopie_an ?? ""),
    };
  });
}

export async function empfaengerVon(g: Gesellschaft): Promise<Empfaenger> {
  return (await empfaengerLesen()).find((e) => e.gesellschaft === g)!;
}

export async function empfaengerSpeichern(
  g: Gesellschaft,
  e: { name: string; email: string; kopieAn: string },
): Promise<void> {
  await db()`
    insert into beleg_steuerbuero (gesellschaft, name, email, kopie_an)
    values (${g}, ${e.name.trim().slice(0, 120)}, ${e.email.trim().slice(0, 200)}, ${e.kopieAn.trim().slice(0, 200)})
    on conflict (gesellschaft) do update set
      name = excluded.name, email = excluded.email, kopie_an = excluded.kopie_an
  `;
}

export interface Sendung {
  gesellschaft: Gesellschaft;
  monat: string;
  versendetAm: string;
  versendetVon: string;
  versendetAn: string;
  anzahl: number;
  summeCent: number;
}

/** Was in einem Jahr schon hinausgegangen ist, je Firma und Monat. */
export async function sendungenDesJahres(jahr: number): Promise<Sendung[]> {
  const zeilen = (await db()`
    select gesellschaft, monat, versendet_am, versendet_von, versendet_an, anzahl, summe_cent
      from beleg_versand
     where monat like ${`${jahr}-%`}
     order by versendet_am desc
  `) as Array<Record<string, unknown>>;
  return zeilen.map((z) => ({
    gesellschaft: z.gesellschaft as Gesellschaft,
    monat: String(z.monat),
    versendetAm: String(z.versendet_am),
    versendetVon: String(z.versendet_von ?? ""),
    versendetAn: String(z.versendet_an),
    anzahl: Number(z.anzahl ?? 0),
    summeCent: Number(z.summe_cent ?? 0),
  }));
}

export async function sendungMerken(s: {
  gesellschaft: Gesellschaft;
  monat: string;
  von: string;
  an: string;
  anzahl: number;
  summeCent: number;
}): Promise<void> {
  await db()`
    insert into beleg_versand (gesellschaft, monat, versendet_von, versendet_an, anzahl, summe_cent)
    values (${s.gesellschaft}, ${s.monat}, ${s.von}, ${s.an}, ${s.anzahl}, ${s.summeCent})
  `;
}

/** "Belege September 2026, Magic-Expert GbR" für Betreff und Dateiname. */
export function sendungsname(g: Gesellschaft, monatName: string): string {
  return `Belege ${monatName}, ${gesellschaftName(g)}`;
}
