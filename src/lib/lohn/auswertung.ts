/**
 * Die Stunden für die Lohnabrechnung.
 *
 * Werner gibt sie an Frau Buschow im Steuerbüro weiter. Deshalb zählt
 * hier nicht nur die Summe, sondern auch, wie sie zustande kommt: Wer
 * wann gekommen und gegangen ist, wie lange Pause war, an welchen Tagen
 * jemand Urlaub hatte oder krank war (Florian, 29.09.2026).
 *
 * Gerechnet wird aus den Stempeln, nicht aus einer nebenher geführten
 * Liste. Was der Mitarbeiter am Handy gedrückt hat, ist die Wahrheit;
 * alles andere ließe sich hinterher nicht mehr belegen.
 */

import { db } from "@/lib/db/client";
import type { Zeitraum } from "./zeitraum";

export type Abwesenheitsart = "urlaub" | "krank" | "privat";

export interface Tagesprotokoll {
  /** JJJJ-MM-TT in hiesiger Zeit. */
  datum: string;
  /** Die Stempel des Tages, in der Reihenfolge des Drückens. */
  stempel: Array<{ art: string; uhrzeit: string; quelle: string; imHaus: boolean }>;
  arbeitMinuten: number;
  pauseMinuten: number;
  /** Offen heißt: gekommen, aber nie gegangen. Dann fehlt die Zeit. */
  offen: boolean;
}

export interface Abwesenheitstag {
  datum: string;
  art: Abwesenheitsart;
  grund: string;
}

export interface Mitarbeiterzeiten {
  benutzerId: string;
  name: string;
  email: string;
  arbeitMinuten: number;
  pauseMinuten: number;
  arbeitstage: number;
  urlaubstage: number;
  kranktage: number;
  /** Tage, an denen ein Gehen fehlt. Die muss jemand nacharbeiten. */
  offeneTage: string[];
  protokoll: Tagesprotokoll[];
  abwesend: Abwesenheitstag[];
}

const ZEITZONE = "Europe/Berlin";

/** Datum und Uhrzeit in hiesiger Zeit, nicht in UTC. */
function hier(iso: string): { tag: string; uhrzeit: string } {
  const d = new Date(iso);
  const tag = d.toLocaleDateString("sv-SE", { timeZone: ZEITZONE });
  const uhrzeit = d.toLocaleTimeString("de-DE", {
    timeZone: ZEITZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return { tag, uhrzeit };
}

/** Alle Tage eines Zeitraums als JJJJ-MM-TT. */
function tageZwischen(von: string, bis: string): string[] {
  const tage: string[] = [];
  const d = new Date(`${von}T12:00:00Z`);
  const ende = new Date(`${bis}T12:00:00Z`);
  while (d <= ende) {
    tage.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return tage;
}

/**
 * Die Zeiten aller Mitarbeiter in einem Zeitraum.
 *
 * Ein Tag beginnt und endet nach hiesiger Zeit. Deshalb wird großzügig
 * geladen (ein Tag vorher und nachher) und danach genau zugeordnet:
 * Sonst fiele eine Schicht, die um 23:30 Uhr endet, im Winter in den
 * falschen Tag.
 */
export async function zeitenImZeitraum(z: Zeitraum): Promise<Mitarbeiterzeiten[]> {
  const stempel = (await db()`
    select s.benutzer_id, s.name, s.art, s.zeitpunkt, s.quelle, s.im_haus, b.email
      from stempel s
      left join benutzer b on b.id = s.benutzer_id
     where s.zeitpunkt >= (${z.von}::date - 1)::timestamptz
       and s.zeitpunkt < (${z.bis}::date + 2)::timestamptz
     order by s.benutzer_id, s.zeitpunkt
  `) as Array<Record<string, unknown>>;

  const abwesend = (await db()`
    select a.benutzer_id, b.name, b.email, a.von::text as von, a.bis::text as bis, a.grund, a.art
      from dienst_abwesend a
      join benutzer b on b.id = a.benutzer_id
     where a.von <= ${z.bis}::date and a.bis >= ${z.von}::date
     order by a.von
  `) as Array<Record<string, unknown>>;

  const imZeitraum = (tag: string) => tag >= z.von && tag <= z.bis;
  const leute = new Map<string, Mitarbeiterzeiten>();

  const hole = (id: string, name: string, email: string): Mitarbeiterzeiten => {
    const da = leute.get(id);
    if (da) return da;
    const neu: Mitarbeiterzeiten = {
      benutzerId: id,
      name,
      email,
      arbeitMinuten: 0,
      pauseMinuten: 0,
      arbeitstage: 0,
      urlaubstage: 0,
      kranktage: 0,
      offeneTage: [],
      protokoll: [],
      abwesend: [],
    };
    leute.set(id, neu);
    return neu;
  };

  // Stempel nach Person und Tag sortieren.
  const jeTag = new Map<string, Tagesprotokoll>();
  for (const s of stempel) {
    const id = String(s.benutzer_id);
    const person = hole(id, String(s.name ?? ""), String(s.email ?? ""));
    const { tag, uhrzeit } = hier(String(s.zeitpunkt));
    if (!imZeitraum(tag)) continue;

    const schluessel = `${id}|${tag}`;
    let eintrag = jeTag.get(schluessel);
    if (!eintrag) {
      eintrag = { datum: tag, stempel: [], arbeitMinuten: 0, pauseMinuten: 0, offen: false };
      jeTag.set(schluessel, eintrag);
      person.protokoll.push(eintrag);
    }
    eintrag.stempel.push({
      art: String(s.art),
      uhrzeit,
      quelle: String(s.quelle ?? "app"),
      imHaus: s.im_haus !== false,
    });
  }

  /*
    Aus den Stempeln die Minuten rechnen.

    Dieselbe Logik wie in der Monatsübersicht der Stempeluhr: Die Zeit
    zwischen Kommen und Pause beziehungsweise Gehen ist Arbeit, die
    zwischen Pausenanfang und Pausenende ist Pause. Fehlt das Gehen,
    bleibt der Tag offen und zählt mit null Minuten: Lieber eine Lücke,
    die jemand sieht, als eine geschätzte Zahl in der Lohnabrechnung.
  */
  for (const [schluessel, tagProt] of jeTag) {
    const id = schluessel.split("|")[0];
    const person = leute.get(id)!;
    let start: number | null = null;
    let pauseStart: number | null = null;

    for (const s of tagProt.stempel) {
      const t = Date.parse(`${tagProt.datum}T${s.uhrzeit}:00`);
      if (s.art === "kommen") start = t;
      if (s.art === "pause_start") {
        if (start !== null) tagProt.arbeitMinuten += (t - start) / 60000;
        start = null;
        pauseStart = t;
      }
      if (s.art === "pause_ende") {
        if (pauseStart !== null) tagProt.pauseMinuten += (t - pauseStart) / 60000;
        pauseStart = null;
        start = t;
      }
      if (s.art === "gehen") {
        if (start !== null) tagProt.arbeitMinuten += (t - start) / 60000;
        if (pauseStart !== null) tagProt.pauseMinuten += (t - pauseStart) / 60000;
        start = null;
        pauseStart = null;
      }
    }

    tagProt.offen = start !== null || pauseStart !== null;
    tagProt.arbeitMinuten = Math.round(tagProt.arbeitMinuten);
    tagProt.pauseMinuten = Math.round(tagProt.pauseMinuten);

    person.arbeitMinuten += tagProt.arbeitMinuten;
    person.pauseMinuten += tagProt.pauseMinuten;
    if (tagProt.arbeitMinuten > 0) person.arbeitstage += 1;
    if (tagProt.offen) person.offeneTage.push(tagProt.datum);
  }

  // Urlaub und Krankheit tageweise, nur innerhalb des Zeitraums.
  for (const a of abwesend) {
    const id = String(a.benutzer_id);
    const person = hole(id, String(a.name ?? ""), String(a.email ?? ""));
    const art = String(a.art ?? "privat") as Abwesenheitsart;
    for (const tag of tageZwischen(String(a.von), String(a.bis))) {
      if (!imZeitraum(tag)) continue;
      person.abwesend.push({ datum: tag, art, grund: String(a.grund ?? "") });
      if (art === "urlaub") person.urlaubstage += 1;
      if (art === "krank") person.kranktage += 1;
    }
  }

  for (const p of leute.values()) {
    p.protokoll.sort((a, b) => a.datum.localeCompare(b.datum));
    p.abwesend.sort((a, b) => a.datum.localeCompare(b.datum));
  }

  return [...leute.values()]
    .filter((p) => p.arbeitMinuten > 0 || p.abwesend.length > 0 || p.offeneTage.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** "7:45" aus 465 Minuten. */
export function alsStunden(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Dezimalstunden, wie das Steuerbüro sie rechnet: 465 Minuten sind 7,75. */
export function alsDezimal(minuten: number): string {
  return (Math.max(0, minuten) / 60).toFixed(2).replace(".", ",");
}
