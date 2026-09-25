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
  /** Wie oft ein Gast den Bildschirm wirklich gesehen hat. */
  gesehenAnzahl: number;
  behobenAm: string | null;
  behobenWie: string | null;
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
    gesehenAnzahl: Number(z.gesehen_anzahl ?? 0),
    behobenAm: zeit(z.behoben_am),
    behobenWie: (z.behoben_wie as string) ?? null,
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
  /** Hat ein Gast den Bildschirm wirklich zu sehen bekommen? */
  gesehen?: boolean;
}

/**
 * Meldung eintragen oder zur offenen Meldung zählen.
 *
 * `neu` sagt, ob damit eine Störung begonnen hat. Nur dann geht die Mail
 * hinaus, sonst würde ein Ausfall an einem Samstagabend hundert Mails
 * auslösen und niemand liest mehr eine davon.
 */
export async function stoerungMelden(
  s: NeueStoerung,
): Promise<{ stoerung: TechnikStoerung; neu: boolean; erstmalsGesehen: boolean }> {
  const gesehen = s.gesehen === true;
  const zeilen = (await db()`
    insert into technik_stoerung (art, kennung, show_name, event_id, event_zeit, grund, quelle, gesehen_anzahl)
    values (${s.art}, ${s.kennung}, ${s.showName ?? null}, ${s.eventId ?? null},
            ${s.eventZeit ?? null}, ${s.grund ?? null}, ${s.quelle ?? null}, ${gesehen ? 1 : 0})
    on conflict (kennung) where erledigt_am is null do update
      set anzahl = technik_stoerung.anzahl + 1,
          gesehen_anzahl = technik_stoerung.gesehen_anzahl + ${gesehen ? 1 : 0},
          zuletzt_am = now(),
          grund = coalesce(excluded.grund, technik_stoerung.grund),
          -- Tritt es nach einer Entwarnung wieder auf, ist es nicht mehr behoben.
          behoben_am = case when ${gesehen} then null else technik_stoerung.behoben_am end,
          behoben_wie = case when ${gesehen} then null else technik_stoerung.behoben_wie end
    returning *, (technik_stoerung.anzahl = 1) as ist_neu
  `) as Array<Record<string, unknown>>;
  const z = zeilen[0];
  const stoerung = baue(z);
  return {
    stoerung,
    neu: z.ist_neu === true,
    // Gemailt wird beim ersten Mal, das ein Gast wirklich gesehen hat.
    erstmalsGesehen: gesehen && stoerung.gesehenAnzahl === 1,
  };
}

/**
 * Der Shop meldet, dass es beim selben Termin wieder geht.
 *
 * Kommt, wenn der Saalplan beim stillen Nachladen oder nach einem Klick
 * des Gastes doch erschienen ist. Die Meldung bleibt stehen, bekommt aber
 * den Vermerk, dass sie sich erledigt hat.
 */
export async function stoerungBehoben(kennung: string, wie: string): Promise<void> {
  await db()`
    update technik_stoerung
       set behoben_am = now(), behoben_wie = ${wie}, zuletzt_am = now()
     where kennung = ${kennung} and erledigt_am is null and behoben_am is null
  `;
}

/** Vermerkt, dass die Warnmail hinausgegangen ist. */
export async function stoerungMailVermerken(id: string): Promise<void> {
  await db()`update technik_stoerung set mail_am = now() where id = ${id}`;
}

export interface StoerungEinstellung {
  mailAn: boolean;
  geaendertAm: string;
  geaendertVon: string | null;
  grund: string | null;
}

/**
 * Ob die Warnmail überhaupt hinausgehen soll.
 *
 * Steht seit dem 22.09.2026 auf aus, siehe migrations/068. Aufgezeichnet
 * wird trotzdem alles: Die Seite zeigt jede Meldung, nur der Briefkasten
 * bleibt ruhig.
 */
export async function stoerungEinstellung(): Promise<StoerungEinstellung> {
  const z = (await db()`select * from stoerung_einstellung where id = 1`) as Array<Record<string, unknown>>;
  const r = z[0];
  return {
    mailAn: Boolean(r?.mail_an),
    geaendertAm: r?.geaendert_am ? new Date(r.geaendert_am as string).toISOString() : new Date().toISOString(),
    geaendertVon: (r?.geaendert_von as string) ?? null,
    grund: (r?.grund as string) ?? null,
  };
}

export async function stoerungMailSchalten(an: boolean, von: string, grund: string | null): Promise<void> {
  await db()`
    insert into stoerung_einstellung (id, mail_an, geaendert_von, grund)
    values (1, ${an}, ${von}, ${grund})
    on conflict (id) do update
      set mail_an = excluded.mail_an, geaendert_am = now(),
          geaendert_von = excluded.geaendert_von, grund = excluded.grund
  `;
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
