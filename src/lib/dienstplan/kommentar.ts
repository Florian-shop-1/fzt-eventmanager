/**
 * Die Kommentare unter einer Show im Dienstplan.
 * Siehe migrations/070_dienst_kommentar.sql.
 *
 * Gedacht wie unter einem Beitrag bei Facebook: Jeder aus dem Showteam
 * schreibt etwas unter die Show, die anderen antworten oder geben ein
 * Herz. Eine Ebene Antworten, mehr nicht, sonst wird es unübersichtlich.
 */

import { db } from "@/lib/db/client";

export interface Kommentar {
  id: string;
  ditixEventId: string;
  antwortAuf: string | null;
  benutzerId: string;
  wer: string;
  text: string;
  erstelltAm: string;
  geloescht: boolean;
  /** Wie viele Herzen, und ob eines davon von mir ist. */
  herzen: number;
  meinHerz: boolean;
  antworten: Kommentar[];
}

function baue(z: Record<string, unknown>): Kommentar {
  const geloescht = Boolean(z.geloescht_am);
  return {
    id: String(z.id),
    ditixEventId: String(z.ditix_event_id),
    antwortAuf: (z.antwort_auf as string) ?? null,
    benutzerId: String(z.benutzer_id),
    wer: String(z.wer ?? "Jemand"),
    text: geloescht ? "" : String(z.text),
    erstelltAm: new Date(z.erstellt_am as string).toISOString(),
    geloescht,
    herzen: Number(z.herzen ?? 0),
    meinHerz: Boolean(z.mein_herz),
    antworten: [],
  };
}

/**
 * Alle Kommentare zu mehreren Terminen auf einmal.
 *
 * Absichtlich für die ganze Seite in einer Abfrage: Der Dienstplan zeigt
 * zwanzig Shows, und zwanzig einzelne Abfragen wären zwanzigmal Warten.
 */
export async function kommentareFuer(
  ditixEventIds: string[],
  ichId: string | null,
): Promise<Map<string, Kommentar[]>> {
  const karte = new Map<string, Kommentar[]>();
  if (ditixEventIds.length === 0) return karte;

  const zeilen = (await db()`
    select k.*, b.name as wer,
           (select count(*) from dienst_kommentar_herz h where h.kommentar_id = k.id) as herzen,
           exists (
             select 1 from dienst_kommentar_herz h
              where h.kommentar_id = k.id and h.benutzer_id = ${ichId}
           ) as mein_herz
      from dienst_kommentar k
      join benutzer b on b.id = k.benutzer_id
     where k.ditix_event_id = any(${ditixEventIds}::text[])
     order by k.erstellt_am
  `) as Array<Record<string, unknown>>;

  const alle = zeilen.map(baue);
  const nachId = new Map(alle.map((k) => [k.id, k]));

  for (const k of alle) {
    if (k.antwortAuf) {
      nachId.get(k.antwortAuf)?.antworten.push(k);
      continue;
    }
    const liste = karte.get(k.ditixEventId) ?? [];
    liste.push(k);
    karte.set(k.ditixEventId, liste);
  }

  // Gelöschte Kommentare ohne Antworten braucht niemand zu sehen.
  for (const [termin, liste] of karte) {
    karte.set(
      termin,
      liste.filter((k) => !k.geloescht || k.antworten.length > 0),
    );
  }
  return karte;
}

export async function kommentarSchreiben(o: {
  ditixEventId: string;
  benutzerId: string;
  text: string;
  antwortAuf?: string | null;
}): Promise<Kommentar | null> {
  const text = o.text.trim().slice(0, 2000);
  if (!text) return null;
  const z = (await db()`
    insert into dienst_kommentar (ditix_event_id, antwort_auf, benutzer_id, text)
    values (${o.ditixEventId}, ${o.antwortAuf ?? null}, ${o.benutzerId}, ${text})
    returning id
  `) as Array<{ id: string }>;
  const neu = (await db()`
    select k.*, b.name as wer, 0 as herzen, false as mein_herz
      from dienst_kommentar k join benutzer b on b.id = k.benutzer_id
     where k.id = ${z[0].id}
  `) as Array<Record<string, unknown>>;
  return neu[0] ? baue(neu[0]) : null;
}

/** Löschen darf nur, wem der Kommentar gehört, und das Büro. */
export async function kommentarLoeschen(id: string, benutzerId: string, darfAlles: boolean): Promise<void> {
  if (darfAlles) {
    await db()`update dienst_kommentar set geloescht_am = now() where id = ${id}`;
    return;
  }
  await db()`
    update dienst_kommentar set geloescht_am = now()
     where id = ${id} and benutzer_id = ${benutzerId}
  `;
}

/** Herz setzen oder wieder wegnehmen. Zurück kommt der neue Stand. */
export async function herzUmlegen(kommentarId: string, benutzerId: string): Promise<boolean> {
  const weg = (await db()`
    delete from dienst_kommentar_herz
     where kommentar_id = ${kommentarId} and benutzer_id = ${benutzerId}
    returning kommentar_id
  `) as Array<unknown>;
  if (weg.length > 0) return false;
  await db()`
    insert into dienst_kommentar_herz (kommentar_id, benutzer_id)
    values (${kommentarId}, ${benutzerId})
    on conflict do nothing
  `;
  return true;
}

/**
 * Wer über einen neuen Kommentar Bescheid wissen sollte.
 *
 * Wie bei Facebook: alle, die unter dieser Show eingeteilt sind, und alle,
 * die dort schon geschrieben haben. Der Schreiber selbst nicht, der weiß es.
 */
export async function beteiligte(ditixEventId: string, ausserBenutzerId: string): Promise<
  Array<{ id: string; name: string; email: string }>
> {
  const z = (await db()`
    select distinct b.id, b.name, b.email
      from benutzer b
     where b.id <> ${ausserBenutzerId}
       and coalesce(b.email, '') <> ''
       and b.aktiv
       and (
         b.id in (select benutzer_id from dienst_einsatz
                   where ditix_event_id = ${ditixEventId} and benutzer_id is not null)
         or b.id in (select benutzer_id from dienst_kommentar
                      where ditix_event_id = ${ditixEventId} and geloescht_am is null)
       )
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email) }));
}
