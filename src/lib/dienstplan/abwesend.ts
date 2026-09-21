/**
 * Urlaub und private Termine. Siehe migrations/057_dienst_abwesend.sql.
 *
 * Wer im Voraus weiß, dass er weg ist, trägt es ein. Zwei Dinge passieren
 * dann: Seine Schichten in dem Zeitraum werden sofort ausgeschrieben, und
 * er wird in der Zeit nicht mehr nach Ersatz gefragt.
 */

import { db } from "@/lib/db/client";

export interface Abwesenheit {
  id: string;
  benutzerId: string;
  name: string;
  von: string;
  bis: string;
  grund: string;
}

function baue(z: Record<string, unknown>): Abwesenheit {
  return {
    id: String(z.id),
    benutzerId: String(z.benutzer_id),
    name: String(z.name ?? ""),
    von: String(z.von),
    bis: String(z.bis),
    grund: String(z.grund ?? ""),
  };
}

/** Alles, was noch nicht vorbei ist. */
export async function abwesenheiten(): Promise<Abwesenheit[]> {
  const z = (await db()`
    select a.id, a.benutzer_id, b.name, a.von::text as von, a.bis::text as bis, a.grund
      from dienst_abwesend a join benutzer b on b.id = a.benutzer_id
     where a.bis >= (now() at time zone 'Europe/Berlin')::date
     order by a.von
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function abwesenheitenVon(benutzerId: string): Promise<Abwesenheit[]> {
  return (await abwesenheiten()).filter((a) => a.benutzerId === benutzerId);
}

export async function abwesendEintragen(o: {
  benutzerId: string;
  von: string;
  bis: string;
  grund: string;
}): Promise<void> {
  await db()`
    insert into dienst_abwesend (benutzer_id, von, bis, grund)
    values (${o.benutzerId}, ${o.von}::date, ${o.bis}::date, ${o.grund})
  `;
}

/** Löscht einen Eintrag, aber nur den eigenen (oder als Büro jeden). */
export async function abwesendLoeschen(id: string, benutzerId?: string): Promise<void> {
  if (benutzerId) {
    await db()`delete from dienst_abwesend where id = ${id} and benutzer_id = ${benutzerId}`;
    return;
  }
  await db()`delete from dienst_abwesend where id = ${id}`;
}

/** Ist diese Person an diesem Tag weg? */
export function istAbwesend(liste: Abwesenheit[], benutzerId: string, datum: string): boolean {
  return liste.some((a) => a.benutzerId === benutzerId && a.von <= datum && datum <= a.bis);
}
