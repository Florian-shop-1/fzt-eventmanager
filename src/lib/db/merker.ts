/**
 * Merkzettel. Siehe migrations/063_merker.sql.
 *
 * Für Dinge, die von außen abhängen und deshalb liegen bleiben: einen
 * Zugang besorgen, beim Steuerbüro nachfragen, eine Nummer eintragen.
 *
 * Der Takt ist bewusst zurückhaltend: Ein Eintrag meldet sich, und beim
 * Melden schiebt ihn das Programm ein paar Tage nach hinten. So kommt er
 * wieder, ohne auf jeder Seite im Weg zu stehen. Wer ihn abhakt, sieht
 * ihn nie wieder.
 */

import { db } from "@/lib/db/client";

/** Tage bis zur nächsten Erinnerung, wenn ein Eintrag gezeigt wurde. */
const ABSTAND_TAGE = 3;

export interface Merker {
  id: string;
  schluessel: string;
  titel: string;
  text: string;
  link: string | null;
  wiederAm: string;
  erledigt: boolean;
}

function baue(z: Record<string, unknown>): Merker {
  return {
    id: String(z.id),
    schluessel: String(z.schluessel),
    titel: String(z.titel),
    text: String(z.text ?? ""),
    link: (z.link as string) ?? null,
    wiederAm: String(z.wieder_am).slice(0, 10),
    erledigt: Boolean(z.erledigt_am),
  };
}

/**
 * Was jetzt dran ist, und schiebt es gleich nach hinten.
 *
 * Beides in einer Abfrage, damit ein zweiter Seitenaufruf nicht dasselbe
 * noch einmal meldet.
 */
export async function faelligeMerker(benutzerId: string): Promise<Merker[]> {
  try {
    const z = (await db()`
      update merker
         set wieder_am = current_date + (${ABSTAND_TAGE})::int
       where benutzer_id = ${benutzerId} and erledigt_am is null and wieder_am <= current_date
      returning id, schluessel, titel, text, link, to_char(wieder_am, 'YYYY-MM-DD') as wieder_am, erledigt_am
    `) as Array<Record<string, unknown>>;
    return z.map(baue);
  } catch (e) {
    console.warn("[merker] nicht lesbar:", e);
    return [];
  }
}

/** Alles, was offen ist, für die Übersicht. */
export async function offeneMerker(benutzerId: string): Promise<Merker[]> {
  const z = (await db()`
    select id, schluessel, titel, text, link, to_char(wieder_am, 'YYYY-MM-DD') as wieder_am, erledigt_am
      from merker where benutzer_id = ${benutzerId} and erledigt_am is null order by wieder_am
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function erledigteMerker(benutzerId: string, anzahl = 10): Promise<Merker[]> {
  const z = (await db()`
    select id, schluessel, titel, text, link, to_char(wieder_am, 'YYYY-MM-DD') as wieder_am, erledigt_am
      from merker where benutzer_id = ${benutzerId} and erledigt_am is not null
     order by erledigt_am desc limit ${anzahl}
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function merkerAnlegen(o: {
  benutzerId: string;
  schluessel: string;
  titel: string;
  text?: string;
  link?: string | null;
  inTagen?: number;
}): Promise<void> {
  await db()`
    insert into merker (benutzer_id, schluessel, titel, text, link, wieder_am)
    values (${o.benutzerId}, ${o.schluessel}, ${o.titel}, ${o.text ?? ""}, ${o.link ?? null},
            current_date + (${o.inTagen ?? 0})::int)
    on conflict (benutzer_id, schluessel) do nothing
  `;
}

export async function merkerVerschieben(id: string, benutzerId: string, tage: number): Promise<void> {
  await db()`
    update merker set wieder_am = current_date + (${tage})::int
     where id = ${id} and benutzer_id = ${benutzerId}
  `;
}

export async function merkerErledigt(id: string, benutzerId: string): Promise<void> {
  await db()`update merker set erledigt_am = now() where id = ${id} and benutzer_id = ${benutzerId}`;
}

export async function merkerWiederOeffnen(id: string, benutzerId: string): Promise<void> {
  await db()`
    update merker set erledigt_am = null, wieder_am = current_date
     where id = ${id} and benutzer_id = ${benutzerId}
  `;
}
