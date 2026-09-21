/**
 * Störungen, die der Shop selbst meldet.
 *
 * Siehe migrations/048_technik_stoerung.sql. Anders als die Rückrufwünsche
 * auf /stoerungen kommt hier kein Gast mit Telefonnummer, sondern das
 * Programm sagt: Gerade konnte jemand nicht buchen.
 */

import { db } from "./client";

export interface TechnikStoerung {
  id: string;
  art: string;
  kennung: string;
  showName: string | null;
  eventId: string | null;
  eventZeit: string | null;
  grund: string | null;
  quelle: string | null;
  anzahl: number;
  erstmalsAm: string;
  zuletztAm: string;
  mailAm: string | null;
  erledigtAm: string | null;
  erledigtVon: string | null;
  notiz: string | null;
}

function baue(z: Record<string, unknown>): TechnikStoerung {
  const zeit = (w: unknown) => (w ? new Date(w as string).toISOString() : null);
  return {
    id: String(z.id),
    art: String(z.art),
    kennung: String(z.kennung),
    showName: (z.show_name as string) ?? null,
    eventId: (z.event_id as string) ?? null,
    eventZeit: (z.event_zeit as string) ?? null,
    grund: (z.grund as string) ?? null,
    quelle: (z.quelle as string) ?? null,
    anzahl: Number(z.anzahl ?? 1),
    erstmalsAm: zeit(z.erstmals_am) ?? new Date().toISOString(),
    zuletztAm: zeit(z.zuletzt_am) ?? new Date().toISOString(),
    mailAm: zeit(z.mail_am),
    erledigtAm: zeit(z.erledigt_am),
    erledigtVon: (z.erledigt_von as string) ?? null,
    notiz: (z.notiz as string) ?? null,
  };
}

export interface NeueStoerung {
  art: string;
  kennung: string;
  showName?: string | null;
  eventId?: string | null;
  eventZeit?: string | null;
  grund?: string | null;
  quelle?: string | null;
}

/**
 * Meldung eintragen oder zur offenen Meldung zählen.
 *
 * `neu` sagt, ob damit eine Störung begonnen hat. Nur dann geht die Mail
 * hinaus, sonst würde ein Ausfall an einem Samstagabend hundert Mails
 * auslösen und niemand liest mehr eine davon.
 */
export async function stoerungMelden(s: NeueStoerung): Promise<{ stoerung: TechnikStoerung; neu: boolean }> {
  const zeilen = (await db()`
    insert into technik_stoerung (art, kennung, show_name, event_id, event_zeit, grund, quelle)
    values (${s.art}, ${s.kennung}, ${s.showName ?? null}, ${s.eventId ?? null},
            ${s.eventZeit ?? null}, ${s.grund ?? null}, ${s.quelle ?? null})
    on conflict (kennung) where erledigt_am is null do update
      set anzahl = technik_stoerung.anzahl + 1,
          zuletzt_am = now(),
          grund = coalesce(excluded.grund, technik_stoerung.grund)
    returning *, (technik_stoerung.anzahl = 1) as ist_neu
  `) as Array<Record<string, unknown>>;
  const z = zeilen[0];
  return { stoerung: baue(z), neu: z.ist_neu === true };
}

/** Vermerkt, dass die Warnmail hinausgegangen ist. */
export async function stoerungMailVermerken(id: string): Promise<void> {
  await db()`update technik_stoerung set mail_am = now() where id = ${id}`;
}

export async function technikStoerungen(alle: boolean): Promise<TechnikStoerung[]> {
  const zeilen = alle
    ? ((await db()`select * from technik_stoerung order by zuletzt_am desc limit 200`) as Array<Record<string, unknown>>)
    : ((await db()`select * from technik_stoerung where erledigt_am is null order by zuletzt_am desc`) as Array<
        Record<string, unknown>
      >);
  return zeilen.map(baue);
}

export async function technikStoerungErledigt(id: string, von: string, notiz: string | null): Promise<void> {
  await db()`
    update technik_stoerung
       set erledigt_am = now(), erledigt_von = ${von}, notiz = ${notiz}
     where id = ${id} and erledigt_am is null
  `;
}
