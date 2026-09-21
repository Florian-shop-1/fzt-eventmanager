/**
 * Der Dienstplan des Showteams. Siehe migrations/039_dienstplan.sql.
 *
 * Die Schichten werden nicht gespeichert, sondern jedes Mal aus drei
 * Dingen zusammengesetzt:
 *  1. dem Spielplan aus Ditix (welche Shows es gibt)
 *  2. den festen Tagen (Levi freitags FOH, Ben jeden Tag T2 ...)
 *  3. den Einträgen in dienst_einsatz (übernommen, Ersatz gesucht, eingeteilt)
 *
 * So muss niemand Schichten anlegen, und eine neue Show im Spielplan
 * taucht von selbst im Dienstplan auf.
 */

import { db } from "@/lib/db/client";
import type { Vorstellungstermin } from "@/lib/ditix/spielplan";

export type Position = "FOH" | "T2" | "T1" | "SHADOW";
export type FestePosition = Exclude<Position, "SHADOW">;

export const POSITIONEN: FestePosition[] = ["FOH", "T1", "T2"];

export const BEZEICHNUNG: Record<Position, string> = {
  FOH: "FOH",
  T2: "T2",
  T1: "T1",
  SHADOW: "Shadow",
};

export const ERKLAERUNG: Record<Position, string> = {
  FOH: "Front of House, Licht und Ton",
  // Im Haus heißt Bens Position T2, die Runde um Mario und Noel ist T1
  // (Florian, 21.09.2026). Genau so stehen die Werte auch in der Datenbank.
  T2: "Techniker 2",
  T1: "Techniker 1",
  SHADOW: "erfahrener T1, begleitet den Rookie",
};

export const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/**
 * Welche Positionen eine Show braucht.
 *
 * ULMFASSBAR und Magic Memories in allen Fassungen (Family Special, für
 * Schwaben, Silvester) brauchen FOH, T1 und T2. Den Flo-Zirkus macht Ben
 * allein (T2). Was nicht unsere eigene Show ist (RegioTV), braucht keinen Dienst.
 */
export function positionenDerShow(name: string): FestePosition[] {
  if (/regio\s*tv/i.test(name)) return [];
  if (/flo-?zirkus/i.test(name)) return ["T2"];
  return ["FOH", "T1", "T2"];
}

/** Wochentag eines Datums JJJJ-MM-TT, 0 = Sonntag. */
export function wochentag(datum: string): number {
  return new Date(`${datum}T12:00:00Z`).getUTCDay();
}

// ---------------------------------------------------------------------------
// Daten

export interface Person {
  id: string;
  name: string;
  vorname: string;
  email: string;
  rolle: string;
  /** Position -> lernt noch. */
  kann: Map<FestePosition, boolean>;
}

export interface FesterTag {
  position: FestePosition;
  /** null = jeden Tag */
  wochentag: number | null;
  benutzerId: string;
}

export interface Einsatz {
  ditixEventId: string;
  position: Position;
  datum: string;
  benutzerId: string | null;
  suchtErsatz: boolean;
  grund: string | null;
  erinnertStufe: number;
  /** Direkt angefragt: Diese Person soll zusagen oder absagen. */
  angefragtId: string | null;
  angefragtVonId: string | null;
  angefragtNotiz: string | null;
}

/** Alle aktiven Benutzer (außer dem Food-Kiosk), mit dem, was sie können. */
export async function allePersonen(): Promise<Person[]> {
  const z = (await db()`
    select b.id, b.name, b.email, b.rolle,
           coalesce(json_agg(json_build_object('p', q.position, 'l', q.lernt)) filter (where q.position is not null), '[]') as quali
      from benutzer b
      left join dienst_quali q on q.benutzer_id = b.id
     where b.aktiv and b.rolle <> 'kiosk'
     group by b.id
     order by b.name
  `) as Array<{ id: string; name: string; email: string; rolle: string; quali: Array<{ p: FestePosition; l: boolean }> }>;
  return z.map((r) => ({
    id: r.id,
    name: r.name,
    vorname: r.name.split(" ")[0],
    email: r.email,
    rolle: r.rolle,
    kann: new Map(r.quali.map((q) => [q.p, q.l])),
  }));
}

export async function festeTage(): Promise<FesterTag[]> {
  const z = (await db()`select position, wochentag, benutzer_id from dienst_fest`) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    position: r.position as FestePosition,
    wochentag: r.wochentag === null ? null : Number(r.wochentag),
    benutzerId: String(r.benutzer_id),
  }));
}

export async function einsaetzeAb(datum: string): Promise<Einsatz[]> {
  const z = (await db()`
    select ditix_event_id, position, datum::text as datum, benutzer_id, sucht_ersatz, grund, erinnert_stufe,
           angefragt_id, angefragt_von_id, angefragt_notiz
      from dienst_einsatz where datum >= ${datum}::date
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    ditixEventId: String(r.ditix_event_id),
    position: r.position as Position,
    datum: String(r.datum),
    benutzerId: (r.benutzer_id as string) ?? null,
    suchtErsatz: Boolean(r.sucht_ersatz),
    grund: (r.grund as string) ?? null,
    erinnertStufe: Number(r.erinnert_stufe ?? 0),
    angefragtId: (r.angefragt_id as string) ?? null,
    angefragtVonId: (r.angefragt_von_id as string) ?? null,
    angefragtNotiz: (r.angefragt_notiz as string) ?? null,
  }));
}

/**
 * Eine Person direkt anfragen. Die Schicht bleibt, wie sie ist, bis die
 * Person zusagt. Nur sie bekommt eine Mail.
 */
export async function anfrageSetzen(e: {
  termin: Vorstellungstermin;
  position: Position;
  /** Wer gerade eingeteilt ist, damit die Anzeige stehen bleibt. */
  benutzerId: string | null;
  angefragtId: string;
  vonId: string;
  von: string;
  notiz: string | null;
}): Promise<void> {
  await db()`
    insert into dienst_einsatz (ditix_event_id, position, datum, uhrzeit, benutzer_id, geaendert_von, geaendert_am,
                                angefragt_id, angefragt_von_id, angefragt_notiz, angefragt_am)
    values (${e.termin.ditixEventId}, ${e.position}, ${e.termin.datum}::date, ${e.termin.uhrzeit}, ${e.benutzerId},
            ${e.von}, now(), ${e.angefragtId}, ${e.vonId}, ${e.notiz}, now())
    on conflict (ditix_event_id, position) do update set
      angefragt_id = excluded.angefragt_id, angefragt_von_id = excluded.angefragt_von_id,
      angefragt_notiz = excluded.angefragt_notiz, angefragt_am = now(),
      geaendert_von = excluded.geaendert_von, geaendert_am = now()
  `;
}

/** Anfrage beenden: zugesagt, abgesagt oder zurückgenommen. */
export async function anfrageLoeschen(ditixEventId: string, position: Position): Promise<void> {
  await db()`
    update dienst_einsatz set angefragt_id = null, angefragt_von_id = null, angefragt_notiz = null, angefragt_am = null
     where ditix_event_id = ${ditixEventId} and position = ${position}
  `;
}

/** Legt einen Eintrag an oder überschreibt ihn. */
export async function einsatzSetzen(e: {
  termin: Vorstellungstermin;
  position: Position;
  benutzerId: string | null;
  suchtErsatz: boolean;
  grund: string | null;
  von: string;
  erinnertStufe?: number;
}): Promise<void> {
  await db()`
    insert into dienst_einsatz (ditix_event_id, position, datum, uhrzeit, benutzer_id, sucht_ersatz, grund, geaendert_von, geaendert_am, erinnert_stufe)
    values (${e.termin.ditixEventId}, ${e.position}, ${e.termin.datum}::date, ${e.termin.uhrzeit}, ${e.benutzerId},
            ${e.suchtErsatz}, ${e.grund}, ${e.von}, now(), ${e.erinnertStufe ?? 0})
    on conflict (ditix_event_id, position) do update set
      benutzer_id = excluded.benutzer_id, sucht_ersatz = excluded.sucht_ersatz, grund = excluded.grund,
      geaendert_von = excluded.geaendert_von, geaendert_am = now(), erinnert_stufe = excluded.erinnert_stufe,
      datum = excluded.datum, uhrzeit = excluded.uhrzeit,
      angefragt_id = null, angefragt_von_id = null, angefragt_notiz = null, angefragt_am = null
  `;
}

/** Zurück auf den festen Plan. */
export async function einsatzLoeschen(ditixEventId: string, position: Position): Promise<void> {
  await db()`delete from dienst_einsatz where ditix_event_id = ${ditixEventId} and position = ${position}`;
}

export async function erinnertMerken(termin: Vorstellungstermin, position: Position, stufe: number): Promise<void> {
  // Gibt es noch keinen Eintrag, ist die Schicht offen ohne festen Tag.
  await db()`
    insert into dienst_einsatz (ditix_event_id, position, datum, uhrzeit, benutzer_id, erinnert_stufe, geaendert_von)
    values (${termin.ditixEventId}, ${position}, ${termin.datum}::date, ${termin.uhrzeit}, null, ${stufe}, 'Erinnerung')
    on conflict (ditix_event_id, position) do update set erinnert_stufe = ${stufe}
  `;
}

// ---------------------------------------------------------------------------
// Der Plan

export interface Slot {
  position: Position;
  person: Person | null;
  /** Kommt aus den festen Tagen. */
  fest: boolean;
  /** Die Person hat gefragt, ob jemand übernimmt. */
  suchtErsatz: boolean;
  grund: string | null;
  /** Hier wird jemand gebraucht: leer oder Ersatz gesucht. */
  offen: boolean;
  erinnertStufe: number;
  /** Nur beim Shadow: Welche Position er begleitet. */
  fuer?: FestePosition;
  /** Direkt angefragt und noch nicht beantwortet. */
  angefragt: Person | null;
  angefragtVon: Person | null;
  angefragtNotiz: string | null;
}

export interface Schicht {
  termin: Vorstellungstermin;
  slots: Slot[];
}

export function planBauen(
  termine: Vorstellungstermin[],
  personen: Person[],
  fest: FesterTag[],
  einsaetze: Einsatz[],
): Schicht[] {
  const person = new Map(personen.map((p) => [p.id, p]));
  const eintrag = new Map(einsaetze.map((e) => [`${e.ditixEventId}|${e.position}`, e]));

  const festerTag = (position: FestePosition, datum: string) => {
    const tag = wochentag(datum);
    return (
      fest.find((f) => f.position === position && f.wochentag === tag) ??
      fest.find((f) => f.position === position && f.wochentag === null)
    );
  };

  return termine
    .map((termin) => {
      const slots: Slot[] = [];
      for (const position of positionenDerShow(termin.name)) {
        const e = eintrag.get(`${termin.ditixEventId}|${position}`);
        const f = festerTag(position, termin.datum);
        const id = e ? e.benutzerId : (f?.benutzerId ?? null);
        const p = id ? (person.get(id) ?? null) : null;
        const suchtErsatz = Boolean(e?.suchtErsatz && p);
        slots.push({
          position,
          person: p,
          fest: Boolean(p && f && f.benutzerId === p.id),
          suchtErsatz,
          grund: e?.grund ?? null,
          offen: !p || suchtErsatz,
          erinnertStufe: e?.erinnertStufe ?? 0,
          angefragt: e?.angefragtId ? (person.get(e.angefragtId) ?? null) : null,
          angefragtVon: e?.angefragtVonId ? (person.get(e.angefragtVonId) ?? null) : null,
          angefragtNotiz: e?.angefragtNotiz ?? null,
        });
      }
      // Steht ein Rookie auf einer Position, geht jemand mit, der sie
      // allein kann. Nur dann gibt es die Shadow-Zeile, und dann ist sie
      // Pflicht. Gilt fuer FOH, T1 und T2 gleichermassen.
      const mitRookie = slots.find(
        (s) => s.person && s.position !== "SHADOW" && istRookieFuer(s.person, s.position as FestePosition),
      );
      if (mitRookie) {
        const sh = eintrag.get(`${termin.ditixEventId}|SHADOW`);
        const shPerson = sh?.benutzerId ? (person.get(sh.benutzerId) ?? null) : null;
        const suchtErsatz = Boolean(sh?.suchtErsatz && shPerson);
        slots.push({
          position: "SHADOW",
          fuer: mitRookie.position as FestePosition,
          person: shPerson,
          fest: false,
          suchtErsatz,
          grund: sh?.grund ?? null,
          offen: !shPerson || suchtErsatz,
          erinnertStufe: sh?.erinnertStufe ?? 0,
          angefragt: sh?.angefragtId ? (person.get(sh.angefragtId) ?? null) : null,
          angefragtVon: sh?.angefragtVonId ? (person.get(sh.angefragtVonId) ?? null) : null,
          angefragtNotiz: sh?.angefragtNotiz ?? null,
        });
      }
      return { termin, slots };
    })
    .filter((s) => s.slots.length > 0);
}

/**
 * Rookie: macht die Position schon, kann sie aber noch nicht allein
 * (Spalte "lernt"). Vollwertig ist nur, wen Florian dazu erklaert hat;
 * wer sich selbst eintraegt, faengt als Rookie an (Florian, 21.09.2026).
 */
export function istRookieFuer(p: Person, position: FestePosition): boolean {
  return p.kann.get(position) === true;
}

/** Rookie auf irgendeiner seiner Positionen. Fuer Listen und Hinweise. */
export function istRookie(p: Person): boolean {
  return [...p.kann.values()].some((lernt) => lernt);
}

/** Kann diese Person die Position allein? Dann darf sie auch begleiten. */
export function istVollwertig(p: Person, position: FestePosition): boolean {
  return p.kann.get(position) === false;
}

/**
 * Darf diese Person die Position übernehmen?
 * Die eigene Position dürfen alle übernehmen, die sie können, auch
 * Rookies: Sie bekommen dann einen Shadow an die Seite. Der Shadow
 * selbst darf nur sein, wer die begleitete Position allein kann.
 */
export function darfUebernehmen(p: Person, position: Position, fuer: FestePosition = "T1"): boolean {
  if (position === "SHADOW") return istVollwertig(p, fuer);
  return p.kann.has(position);
}

/** Wer bei einer offenen Schicht angeschrieben wird. */
export function werKann(
  personen: Person[],
  position: Position,
  ausser?: string | null,
  fuer: FestePosition = "T1",
): Person[] {
  return personen.filter((p) => p.id !== ausser && darfUebernehmen(p, position, fuer));
}

/** Arbeitet diese Person an diesem Tag schon (auf einer anderen Position)? */
export function schonImDienst(schichten: Schicht[], personId: string, termin: Vorstellungstermin): boolean {
  return schichten.some(
    (s) => s.termin.ditixEventId === termin.ditixEventId && s.slots.some((x) => x.person?.id === personId),
  );
}

// ---------------------------------------------------------------------------
// Florian stellt die Positionen einmal ein. Bis dahin schlägt die
// Einrichtung vor, was er am 18.09.2026 aufgeschrieben hat, anhand der Vornamen.

export const VORSCHLAG_KANN: Record<string, Array<[FestePosition, boolean]>> = {
  leeven: [["FOH", false]],
  sabah: [["FOH", false]],
  levi: [["FOH", false]],
  mario: [["T1", false]],
  julian: [["T1", false]],
  noel: [["T1", true]],
  sarah: [["T1", true]],
  chris: [["T1", true]],
  sammy: [["T1", true]],
  ben: [["T2", false]],
};

export const VORSCHLAG_FEST: Array<{ position: FestePosition; wochentag: number | null; vorname: string }> = [
  { position: "FOH", wochentag: 5, vorname: "levi" },
  { position: "FOH", wochentag: 6, vorname: "leeven" },
  { position: "FOH", wochentag: 0, vorname: "sabah" },
  { position: "T2", wochentag: null, vorname: "ben" },
];

export async function einstellungLesen(): Promise<{ festeTageFragen: string | null; erledigt: boolean }> {
  const z = (await db()`
    select feste_tage_fragen::text as f, feste_tage_erledigt_am from dienst_einstellung where id = 1
  `) as Array<Record<string, unknown>>;
  return { festeTageFragen: (z[0]?.f as string) ?? null, erledigt: Boolean(z[0]?.feste_tage_erledigt_am) };
}
