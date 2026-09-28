/**
 * Von Hand durch-x-en, wer sitzt. Siehe migrations/085_sitz_eingecheckt.sql.
 *
 * Die Handarbeit-Vorstufe zu einem späteren Scanner: Auf einen Platz
 * tippen markiert ihn, nochmal antippen nimmt das X zurück. In Ditix
 * wird dabei nichts geändert, das hier ist unsere eigene Notiz für den
 * Abend (Florian, 28.09.2026).
 */

import { db } from "@/lib/db/client";

/** Die markierten Sitz-Kennungen einer Vorstellung. */
export async function eingecheckteSitze(ditixEventId: string): Promise<number[]> {
  try {
    const z = (await db()`
      select sitz_id from sitz_eingecheckt where ditix_event_id = ${ditixEventId}
    `) as Array<{ sitz_id: number }>;
    return z.map((r) => Number(r.sitz_id));
  } catch (e) {
    console.warn("[upgrade] Eingecheckte Sitze nicht lesbar:", e);
    return [];
  }
}

export async function sitzEinchecken(ditixEventId: string, sitzId: number, von: string): Promise<void> {
  await db()`
    insert into sitz_eingecheckt (ditix_event_id, sitz_id, markiert_von, markiert_am)
    values (${ditixEventId}, ${sitzId}, ${von}, now())
    on conflict (ditix_event_id, sitz_id) do nothing
  `;
}

export async function sitzAuschecken(ditixEventId: string, sitzId: number): Promise<void> {
  await db()`
    delete from sitz_eingecheckt where ditix_event_id = ${ditixEventId} and sitz_id = ${sitzId}
  `;
}
