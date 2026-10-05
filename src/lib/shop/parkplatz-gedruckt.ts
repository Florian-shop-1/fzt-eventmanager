/**
 * Welche Parkplatzschilder schon gedruckt sind.
 * Siehe migrations/144_parkplatz_gedruckt.sql.
 *
 * Gedruckt wird am Tag vor der Show. Zwei Dinge sollen damit aufhoeren:
 * dass jemand den ganzen Stapel noch einmal druckt, weil er nicht weiss,
 * was der Kollege gestern gemacht hat, und dass ein Platz untergeht, der
 * erst am Showtag dazukam (Florian, 05.10.2026).
 *
 * Abgehakt wird von Hand. Ob der Drucker wirklich gedruckt hat, weiss
 * nur, wer das Blatt in der Hand hat.
 */

import { db } from "@/lib/db/client";

export interface Druckvermerk {
  orderId: string;
  von: string;
  am: string;
}

/** Alle Vermerke eines Tages, nach Bestellnummer. */
export async function gedruckteSchilder(datum: string): Promise<Map<string, Druckvermerk>> {
  const z = (await db()`
    select order_id, gedruckt_von, gedruckt_am
      from parkplatz_gedruckt
     where datum = ${datum}::date
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return new Map(
    z.map((r) => [
      String(r.order_id),
      {
        orderId: String(r.order_id),
        von: String(r.gedruckt_von ?? ""),
        am: new Date(r.gedruckt_am as string).toISOString(),
      },
    ]),
  );
}

export async function alsGedrucktMerken(o: {
  datum: string;
  orderId: string;
  von: string;
}): Promise<void> {
  await db()`
    insert into parkplatz_gedruckt (datum, order_id, gedruckt_von)
    values (${o.datum}::date, ${o.orderId}, ${o.von})
    on conflict (datum, order_id) do update
      set gedruckt_von = excluded.gedruckt_von, gedruckt_am = now()
  `;
}

export async function druckvermerkWeg(datum: string, orderId: string): Promise<void> {
  await db()`
    delete from parkplatz_gedruckt where datum = ${datum}::date and order_id = ${orderId}
  `;
}
