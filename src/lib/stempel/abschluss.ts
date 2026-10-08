/**
 * Der Sonntagsabschluss im Foyer. Siehe migrations/154_sonntagsabschluss.sql.
 *
 * Sonntag ist der letzte Showtag der Woche. Was danach noch läuft,
 * läuft tagelang umsonst: Kühltheken, Musik, Licht. Deshalb fragt die
 * Uhr die Person, die als letzte aus dem Foyer geht (Florian,
 * 08.10.2026).
 *
 * Anders als beim Parkplatzhinweis zählt hier wirklich, wer der letzte
 * ist: Die Frage gehört an den, der abschließt, und nicht an jeden, der
 * vor ihm geht.
 */

import { db } from "@/lib/db/client";
import { werIstDa } from "@/lib/stempel/db";

/**
 * Vergessene Stempel zählen nicht als Anwesenheit.
 *
 * Wer seit zwölf Stunden eingestempelt ist, steht nicht mehr im Foyer,
 * sondern hat vergessen auszustempeln. Genau daran scheiterte die erste
 * Fassung des Parkplatzhinweises: Ein vergessener Stempel machte alle
 * anderen zu "nicht dem letzten".
 */
const VERGESSEN_AB_MINUTEN = 12 * 60;

/** Ist außer dieser Person noch jemand aus dem Foyer da? */
export async function letzterImFoyer(benutzerId: string): Promise<boolean> {
  const da = (await werIstDa()).filter(
    (p) => p.benutzerId !== benutzerId && p.minuten < VERGESSEN_AB_MINUTEN,
  );
  if (da.length === 0) return true;

  const z = (await db()`
    select 1 from benutzer
     where id = any(${da.map((p) => p.benutzerId)}::uuid[]) and rolle = 'foyer'
     limit 1
  `.catch(() => [])) as unknown[];
  return z.length === 0;
}

/** Sonntag in unserer Zeit? */
export function istSonntag(): boolean {
  return (
    new Date().toLocaleDateString("en-US", { timeZone: "Europe/Berlin", weekday: "short" }) === "Sun"
  );
}

/** Wurde heute schon abgeschlossen? */
export async function schonAbgeschlossen(datum: string): Promise<boolean> {
  const z = (await db()`
    select 1 from abendabschluss where datum = ${datum}::date limit 1
  `.catch(() => [])) as unknown[];
  return z.length > 0;
}

export async function abschlussMerken(o: {
  datum: string;
  benutzerId: string;
  name: string;
  allesAus: boolean;
  offen: string;
}): Promise<void> {
  await db()`
    insert into abendabschluss (datum, benutzer_id, name, alles_aus, offen)
    values (${o.datum}::date, ${o.benutzerId}::uuid, ${o.name}, ${o.allesAus}, ${o.offen})
  `;
}
