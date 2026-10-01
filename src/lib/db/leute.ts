/**
 * Die Namen der eigenen Leute, für Vorschlagslisten.
 *
 * Nur interne Mitarbeiter: Die Gastronomie und der Food-Kiosk gehören zu
 * anderen Betrieben, und ein Geschenk an sie ist kein Sachbezug an einen
 * eigenen Mitarbeiter (Florian, 01.10.2026).
 */

import { db } from "./client";
import { nachFamilienname } from "@/lib/domain/namen";

export async function namenDerMitarbeiter(): Promise<string[]> {
  const z = (await db()`
    select name from benutzer
     where aktiv and coalesce(art, 'intern') = 'intern'
       and rolle not in ('gastro', 'kiosk', 'agentur')
     order by name
  `.catch(() => [])) as Array<{ name: string }>;
  // Nach Familienname, wie ueberall, wo mehrere Leute stehen.
  return z.map((r) => ({ name: String(r.name) })).sort(nachFamilienname).map((r) => r.name);
}
