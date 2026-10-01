/**
 * Der Personalbogen in der Ablage.
 *
 * Früher ging er nur als Mail ans Lohnbüro und war danach im Haus nicht
 * mehr greifbar. Wer etwas daraus brauchte, musste den Mitarbeiter noch
 * einmal fragen. Das soll aufhören: "bitte selber eitragen und
 * mitarbeiter dann auch nicht mehr fragen" (Florian, 01.10.2026).
 *
 * Die Angaben sind heikel. Sie gehören deshalb hinter dieselbe Schranke
 * wie die Arbeitsverträge, siehe darfVertraege; seinen eigenen Bogen
 * sieht natürlich jeder.
 */

import { db } from "./client";
import { LEER, type Personalbogen } from "@/lib/personal/personalbogen";

export interface BogenAblage {
  benutzerId: string;
  name: string;
  daten: Personalbogen;
  quelle: string;
  erfasstVon: string;
  erfasstAm: string;
  geaendertAm: string;
}

function baue(r: Record<string, unknown>): BogenAblage {
  const roh = (r.daten ?? {}) as Partial<Personalbogen>;
  const daten = { ...LEER };
  for (const k of Object.keys(LEER) as Array<keyof Personalbogen>) {
    daten[k] = String(roh[k] ?? "");
  }
  return {
    benutzerId: String(r.benutzer_id),
    name: String(r.name ?? ""),
    daten,
    quelle: String(r.quelle ?? ""),
    erfasstVon: String(r.erfasst_von ?? ""),
    erfasstAm: new Date(r.erfasst_am as string).toISOString(),
    geaendertAm: new Date(r.geaendert_am as string).toISOString(),
  };
}

/**
 * Bogen ablegen oder auffrischen.
 *
 * Leere Felder überschreiben nichts: Ein Papierbogen, auf dem die
 * Steuerklasse fehlt, soll eine vorhandene nicht löschen.
 */
export async function bogenSpeichern(o: {
  benutzerId: string;
  daten: Partial<Personalbogen>;
  quelle: string;
  von: string;
}): Promise<void> {
  const alt = await bogenVon(o.benutzerId);
  const daten = { ...LEER, ...(alt?.daten ?? {}) };
  for (const k of Object.keys(LEER) as Array<keyof Personalbogen>) {
    const wert = String(o.daten[k] ?? "").trim();
    if (wert) daten[k] = wert;
  }

  await db()`
    insert into personalbogen (benutzer_id, daten, quelle, erfasst_von)
    values (${o.benutzerId}::uuid, ${JSON.stringify(daten)}::jsonb, ${o.quelle}, ${o.von})
    on conflict (benutzer_id) do update
      set daten = ${JSON.stringify(daten)}::jsonb,
          quelle = ${o.quelle},
          geaendert_am = now()
  `;
}

export async function bogenVon(benutzerId: string): Promise<BogenAblage | null> {
  const z = (await db()`
    select p.*, b.name from personalbogen p join benutzer b on b.id = p.benutzer_id
     where p.benutzer_id = ${benutzerId}::uuid
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

/** Alle abgelegten Bögen, für die Übersicht im Büro. */
export async function alleBoegen(): Promise<BogenAblage[]> {
  const z = (await db()`
    select p.*, b.name from personalbogen p join benutzer b on b.id = p.benutzer_id
     where b.aktiv
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(baue);
}
