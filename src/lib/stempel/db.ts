/**
 * Stempeluhr. Siehe migrations/053_stempeluhr.sql.
 *
 * Gestempelt wird im Haus, sonst gar nicht: Es gibt kein Homeoffice.
 * Geprüft wird über das GPS des Handys. Weil GPS in Gebäuden ungenau sein
 * kann, zählt nicht nur der Punkt, sondern auch die gemeldete Genauigkeit:
 * Ein Punkt 200 Meter daneben mit 300 Metern Unsicherheit ist kein Beweis
 * dafür, dass jemand weg ist. Deshalb wird großzügig gerechnet, wenn es
 * ums Ablehnen geht, und streng, wenn es ums Melden geht.
 */

import { db } from "@/lib/db/client";

export type StempelArt = "kommen" | "pause_start" | "pause_ende" | "gehen";

export interface Stempel {
  id: string;
  benutzerId: string;
  name: string;
  art: StempelArt;
  zeitpunkt: string;
  lat: number | null;
  lon: number | null;
  genauigkeit: number | null;
  entfernungM: number | null;
  imHaus: boolean;
  quelle: string;
  notiz: string;
}

export interface StempelEinstellung {
  lat: number;
  lon: number;
  radiusM: number;
  meldenAn: string[];
  maxStunden: number;
  aktiv: boolean;
}

/** Zustand einer Person: was als Nächstes dran ist. */
export type Zustand = "aus" | "arbeit" | "pause";

export interface Stand {
  zustand: Zustand;
  seit: string | null;
  /** Gearbeitete Minuten heute, ohne Pausen. */
  minutenHeute: number;
  pausenMinutenHeute: number;
  stempelHeute: Stempel[];
}

function baue(z: Record<string, unknown>): Stempel {
  return {
    id: String(z.id),
    benutzerId: String(z.benutzer_id),
    name: String(z.name),
    art: z.art as StempelArt,
    zeitpunkt: new Date(z.zeitpunkt as string).toISOString(),
    lat: z.lat === null ? null : Number(z.lat),
    lon: z.lon === null ? null : Number(z.lon),
    genauigkeit: z.genauigkeit === null ? null : Number(z.genauigkeit),
    entfernungM: z.entfernung_m === null ? null : Number(z.entfernung_m),
    imHaus: Boolean(z.im_haus),
    quelle: String(z.quelle),
    notiz: String(z.notiz ?? ""),
  };
}

export async function einstellungLesen(): Promise<StempelEinstellung> {
  const z = (await db()`select lat, lon, radius_m, melden_an, max_stunden, aktiv from stempel_einstellung where id = 1`) as Array<
    Record<string, unknown>
  >;
  return {
    lat: Number(z[0].lat),
    lon: Number(z[0].lon),
    radiusM: Number(z[0].radius_m),
    meldenAn: (z[0].melden_an as string[]) ?? [],
    maxStunden: Number(z[0].max_stunden),
    aktiv: Boolean(z[0].aktiv),
  };
}

/** Luftlinie in Metern zwischen zwei Punkten (Haversine). */
export function entfernung(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const bogen = (g: number) => (g * Math.PI) / 180;
  const dLat = bogen(lat2 - lat1);
  const dLon = bogen(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(bogen(lat1)) * Math.cos(bogen(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/**
 * Ist dieser Punkt im Haus?
 *
 * Die gemeldete Genauigkeit wird abgezogen: Wer 180 Meter entfernt gemessen
 * wird, aber nur auf 100 Meter genau, könnte im Haus stehen. Ein völlig
 * unbrauchbares Signal (über 300 Meter Unsicherheit) zählt aber nicht.
 */
export function imHaus(
  e: StempelEinstellung,
  p: { lat: number; lon: number; genauigkeit: number },
): { drin: boolean; entfernungM: number; grund: string } {
  const d = entfernung(e.lat, e.lon, p.lat, p.lon);
  if (p.genauigkeit > 300) {
    return { drin: false, entfernungM: d, grund: "Das GPS-Signal ist zu ungenau. Bitte kurz ans Fenster oder vor die Tür." };
  }
  const spielraum = Math.min(p.genauigkeit, 150);
  const drin = d - spielraum <= e.radiusM;
  return {
    drin,
    entfernungM: d,
    grund: drin ? "" : `Du bist rund ${d} Meter vom Haus entfernt. Stempeln geht nur auf dem Gelände.`,
  };
}

export async function letzteStempel(benutzerId: string, anzahl = 40): Promise<Stempel[]> {
  const z = (await db()`
    select * from stempel where benutzer_id = ${benutzerId} order by zeitpunkt desc limit ${anzahl}
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Der Stand einer Person: Zustand und die Zeiten von heute. */
export async function standVon(benutzerId: string): Promise<Stand> {
  const z = (await db()`
    select * from stempel
     where benutzer_id = ${benutzerId}
       and (zeitpunkt at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date
     order by zeitpunkt
  `) as Array<Record<string, unknown>>;
  const heute = z.map(baue);

  const letzter = (await db()`
    select * from stempel where benutzer_id = ${benutzerId} order by zeitpunkt desc limit 1
  `) as Array<Record<string, unknown>>;
  const l = letzter[0] ? baue(letzter[0]) : null;
  const zustand: Zustand = !l || l.art === "gehen" ? "aus" : l.art === "pause_start" ? "pause" : "arbeit";

  // Zeiten des Tages zusammenzählen.
  let minuten = 0;
  let pause = 0;
  let start: number | null = null;
  let pauseStart: number | null = null;
  for (const s of heute) {
    const t = Date.parse(s.zeitpunkt);
    if (s.art === "kommen") start = t;
    if (s.art === "pause_start" && start !== null) {
      minuten += (t - start) / 60000;
      start = null;
      pauseStart = t;
    }
    if (s.art === "pause_ende") {
      if (pauseStart !== null) pause += (t - pauseStart) / 60000;
      pauseStart = null;
      start = t;
    }
    if (s.art === "gehen") {
      if (start !== null) minuten += (t - start) / 60000;
      if (pauseStart !== null) pause += (t - pauseStart) / 60000;
      start = null;
      pauseStart = null;
    }
  }
  const jetzt = Date.now();
  if (zustand === "arbeit" && start !== null) minuten += (jetzt - start) / 60000;
  if (zustand === "pause" && pauseStart !== null) pause += (jetzt - pauseStart) / 60000;

  return {
    zustand,
    seit: l ? l.zeitpunkt : null,
    minutenHeute: Math.round(minuten),
    pausenMinutenHeute: Math.round(pause),
    stempelHeute: heute,
  };
}

/** Setzt einen Stempel. Die Prüfung, ob er erlaubt ist, passiert davor. */
export async function stempelSetzen(s: {
  benutzerId: string;
  name: string;
  art: StempelArt;
  lat?: number | null;
  lon?: number | null;
  genauigkeit?: number | null;
  entfernungM?: number | null;
  imHaus?: boolean;
  quelle?: string;
  notiz?: string;
}): Promise<Stempel> {
  const z = (await db()`
    insert into stempel (benutzer_id, name, art, lat, lon, genauigkeit, entfernung_m, im_haus, quelle, notiz)
    values (${s.benutzerId}, ${s.name}, ${s.art}, ${s.lat ?? null}, ${s.lon ?? null}, ${s.genauigkeit ?? null},
            ${s.entfernungM ?? null}, ${s.imHaus ?? true}, ${s.quelle ?? "app"}, ${s.notiz ?? ""})
    returning *
  `) as Array<Record<string, unknown>>;
  return baue(z[0]);
}

/** Wer gerade eingestempelt ist, mit dem Zeitpunkt des Kommens. */
export async function werIstDa(): Promise<
  Array<{ benutzerId: string; name: string; seit: string; zustand: Zustand; kommenId: string; minuten: number }>
> {
  const z = (await db()`
    with letzte as (
      select distinct on (benutzer_id) benutzer_id, name, art, zeitpunkt
        from stempel order by benutzer_id, zeitpunkt desc
    )
    select l.benutzer_id, l.name, l.art, l.zeitpunkt,
           (select id from stempel k where k.benutzer_id = l.benutzer_id and k.art = 'kommen'
             order by k.zeitpunkt desc limit 1) as kommen_id,
           (select zeitpunkt from stempel k where k.benutzer_id = l.benutzer_id and k.art = 'kommen'
             order by k.zeitpunkt desc limit 1) as kommen_am,
           extract(epoch from now() - (select zeitpunkt from stempel k where k.benutzer_id = l.benutzer_id
             and k.art = 'kommen' order by k.zeitpunkt desc limit 1)) / 60 as minuten
      from letzte l where l.art <> 'gehen'
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    benutzerId: String(r.benutzer_id),
    name: String(r.name),
    seit: new Date((r.kommen_am ?? r.zeitpunkt) as string).toISOString(),
    zustand: (r.art === "pause_start" ? "pause" : "arbeit") as Zustand,
    kommenId: String(r.kommen_id),
    minuten: Math.max(0, Math.round(Number(r.minuten ?? 0))),
  }));
}

/** Alle Stempel eines Monats, für die Übersicht und den Export. */
export async function stempelDesMonats(monat: string): Promise<Stempel[]> {
  const [j, m] = monat.split("-").map(Number);
  const von = new Date(Date.UTC(j, m - 1, 1)).toISOString();
  const bis = new Date(Date.UTC(j, m, 1)).toISOString();
  const z = (await db()`
    select * from stempel where zeitpunkt >= ${von}::timestamptz and zeitpunkt < ${bis}::timestamptz
     order by name, zeitpunkt
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function schonGemeldet(kommenId: string): Promise<boolean> {
  const z = (await db()`select 1 from stempel_meldung where kommen_id = ${kommenId}`) as unknown[];
  return z.length > 0;
}

export async function meldungMerken(kommenId: string, grund: string): Promise<void> {
  await db()`insert into stempel_meldung (kommen_id, grund) values (${kommenId}, ${grund}) on conflict do nothing`;
}

/** Stunden und Minuten als "7:45". */
export function stunden(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
