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
import { nachFamilienname } from "@/lib/domain/namen";
import { NACHT_BIS, tagRechnen } from "@/lib/stempel/tag";

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
  /** Wer die Zeit nachträglich geändert hat, falls jemand. */
  geaendertVon: string | null;
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
    geaendertVon: z.geaendert_von ? String(z.geaendert_von) : null,
  };
}

export async function einstellungLesen(): Promise<StempelEinstellung> {
  const z = (await db()`
    select lat, lon, radius_m, melden_an, max_stunden, aktiv
      from stempel_einstellung where id = 1
  `) as Array<Record<string, unknown>>;
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
 * unbrauchbares Signal (über 500 Meter Unsicherheit) zählt aber nicht.
 *
 * Bewusst großzügig gerechnet (Florian, 28.09.2026): Bei manchen Handys ist
 * das GPS in Gebäuden einfach schlecht. Wer draußen wirklich nicht ist,
 * fällt trotzdem auf, nur eben erst beim Prüfen hinterher und nicht schon
 * beim Stempeln selbst (siehe stempeln/route.ts: eingestempelt wird immer).
 */
export function imHaus(
  e: StempelEinstellung,
  p: { lat: number; lon: number; genauigkeit: number },
): { drin: boolean; entfernungM: number; grund: string } {
  const d = entfernung(e.lat, e.lon, p.lat, p.lon);
  if (p.genauigkeit > 500) {
    return { drin: false, entfernungM: d, grund: "Das GPS-Signal ist zu ungenau. Bitte Ortungsdienste einschalten und kurz ans Fenster oder vor die Tür." };
  }
  const spielraum = Math.min(p.genauigkeit, 200);
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

/**
 * Wie lange diese Person gerade ohne Pause arbeitet, in Minuten.
 * Null, wenn sie nicht arbeitet oder gerade Pause macht.
 */
export function minutenOhnePause(stand: Stand): number {
  if (stand.zustand !== "arbeit") return 0;
  const letzter = [...stand.stempelHeute].reverse().find((s) => s.art === "kommen" || s.art === "pause_ende");
  if (!letzter) return 0;
  return Math.max(0, Math.round((Date.now() - Date.parse(letzter.zeitpunkt)) / 60000));
}

/**
 * Nur der Zustand, ohne die Zeiten des Tages: eine einzige Abfrage.
 * Dafür, dass der Knopf oben in der Leiste zeigt, ob die Zeit läuft.
 */
export async function zustandVon(benutzerId: string): Promise<Zustand> {
  const z = (await db()`
    select art from stempel where benutzer_id = ${benutzerId} order by zeitpunkt desc limit 1
  `) as Array<{ art: StempelArt }>;
  if (!z[0] || z[0].art === "gehen") return "aus";
  return z[0].art === "pause_start" ? "pause" : "arbeit";
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
  /** Weicht ab, wenn nachgetragen wird, etwa beim Nachtabschluss. */
  zeitpunkt?: string;
  /** Nur bei Dienstleistern: wie viele Leute zu dieser Schicht gekommen sind. */
  personen?: number | null;
}): Promise<Stempel> {
  const z = (await db()`
    insert into stempel (benutzer_id, name, art, zeitpunkt, lat, lon, genauigkeit, entfernung_m, im_haus, quelle, notiz, personen)
    values (${s.benutzerId}, ${s.name}, ${s.art}, ${s.zeitpunkt ?? new Date().toISOString()}::timestamptz,
            ${s.lat ?? null}, ${s.lon ?? null}, ${s.genauigkeit ?? null},
            ${s.entfernungM ?? null}, ${s.imHaus ?? true}, ${s.quelle ?? "app"}, ${s.notiz ?? ""},
            ${s.personen ?? null})
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

export async function schonGemeldet(kommenId: string, grund: string): Promise<boolean> {
  const z = (await db()`
    select 1 from stempel_meldung where kommen_id = ${kommenId} and grund = ${grund}
  `) as unknown[];
  return z.length > 0;
}

export async function meldungMerken(kommenId: string, grund: string): Promise<void> {
  await db()`insert into stempel_meldung (kommen_id, grund) values (${kommenId}, ${grund}) on conflict do nothing`;
}

/**
 * Wer gerade arbeitet und wie lange schon ohne Pause.
 *
 * Gezählt wird ab dem Einstempeln oder ab dem Ende der letzten Pause.
 * Wer gerade Pause macht, taucht hier nicht auf.
 */
export async function ohnePause(): Promise<
  Array<{ benutzerId: string; name: string; email: string; kommenId: string; seit: string; minuten: number }>
> {
  const z = (await db()`
    with letzte as (
      select distinct on (benutzer_id) benutzer_id, name, art, zeitpunkt
        from stempel order by benutzer_id, zeitpunkt desc
    )
    select l.benutzer_id, l.name, b.email,
           (select id from stempel k where k.benutzer_id = l.benutzer_id and k.art = 'kommen'
             order by k.zeitpunkt desc limit 1) as kommen_id,
           (select max(zeitpunkt) from stempel k where k.benutzer_id = l.benutzer_id
             and k.art in ('kommen', 'pause_ende')) as seit,
           extract(epoch from now() - (select max(zeitpunkt) from stempel k
             where k.benutzer_id = l.benutzer_id and k.art in ('kommen', 'pause_ende'))) / 60 as minuten
      from letzte l join benutzer b on b.id = l.benutzer_id
     where l.art in ('kommen', 'pause_ende') and b.aktiv
  `) as Array<Record<string, unknown>>;
  return z
    .filter((r) => r.kommen_id && r.seit)
    .map((r) => ({
      benutzerId: String(r.benutzer_id),
      name: String(r.name),
      email: String(r.email),
      kommenId: String(r.kommen_id),
      seit: new Date(r.seit as string).toISOString(),
      minuten: Math.max(0, Math.round(Number(r.minuten ?? 0))),
    }));
}

/* ------------------------------------------------------------------ *
 * Korrekturen: Zeiten ändern, nachtragen, löschen.
 *
 * Eine Arbeitszeiterfassung muss nachvollziehbar bleiben. Deshalb wird
 * bei jeder Änderung festgehalten, wer sie gemacht hat und wie die Zeit
 * vorher lautete. Gelöscht wird nur mit Namen in der Notiz.
 * ------------------------------------------------------------------ */

/** Alle Stempel einer Person an einem Tag (Europe/Berlin). */
export async function stempelAmTag(benutzerId: string, tag: string): Promise<Stempel[]> {
  const z = (await db()`
    select * from stempel
     where benutzer_id = ${benutzerId}
       and (zeitpunkt at time zone 'Europe/Berlin')::date = ${tag}::date
     order by zeitpunkt
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/**
 * Die ganze Schicht eines Tages, auch wenn sie nach Mitternacht endet.
 *
 * Bei uns ist das der Regelfall: Wer um 17 Uhr kommt und nach der Show
 * aufraeumt, geht um 0:30. Nach Kalendertagen sortiert stuende dieser
 * Stempel am naechsten Tag, und die Korrekturansicht zeigte eine Schicht
 * ohne Ende.
 *
 * Dieselbe Regel wie in nachtschichtenAnhaengen(): Alles, was vor dem
 * naechsten Kommen und vor dem Morgen liegt, gehoert noch zum Vortag.
 */
export async function schichtAmTag(benutzerId: string, tag: string): Promise<Stempel[]> {
  const eigene = await stempelAmTag(benutzerId, tag);
  const letzter = eigene[eigene.length - 1];
  if (!letzter || letzter.art === "gehen") return eigene;

  const naechster = new Date(`${tag}T12:00:00Z`);
  naechster.setUTCDate(naechster.getUTCDate() + 1);
  const morgen = await stempelAmTag(benutzerId, naechster.toISOString().slice(0, 10));

  const dazu: Stempel[] = [];
  for (const x of morgen) {
    if (x.art === "kommen") break;
    const d = new Date(x.zeitpunkt);
    const minuten = Number(d.toLocaleTimeString("de-DE", { hour: "2-digit", timeZone: "Europe/Berlin" }).slice(0, 2)) * 60
      + Number(d.toLocaleTimeString("de-DE", { minute: "2-digit", timeZone: "Europe/Berlin" }).slice(0, 2));
    if (minuten > NACHT_BIS) break;
    dazu.push(x);
    if (x.art === "gehen") break;
  }
  return [...eigene, ...dazu];
}

/** Verschiebt einen Stempel auf eine andere Uhrzeit. */
/**
 * Jede Korrektur wird mitgeschrieben.
 *
 * Arbeitszeit ist nachweispflichtig, und eine Aenderung ohne Grund ist im
 * Zweifel wertlos, fuer beide Seiten (Florian, 30.09.2026). Deshalb
 * landet jede Korrektur zusaetzlich im Aenderungsbuch, auch eine
 * Loeschung: Sonst waere der Stempel danach einfach weg und niemand
 * koennte sagen, ob er je da war.
 */
async function aenderungMerken(o: {
  benutzerId: string;
  name: string;
  tag: string;
  was: "geaendert" | "geloescht" | "nachgetragen" | "tag_berichtigt";
  art: string;
  altZeitpunkt: string | null;
  neuZeitpunkt: string | null;
  grund: string;
  wer: string;
  /* Nur bei "tag_berichtigt": der ganze Tag vorher und nachher. */
  altMinuten?: number | null;
  neuMinuten?: number | null;
  altText?: string;
  neuText?: string;
}): Promise<void> {
  await db()`
    insert into stempel_aenderung
      (benutzer_id, name, tag, was, art, alt_zeitpunkt, neu_zeitpunkt, grund, wer,
       alt_minuten, neu_minuten, alt_text, neu_text)
    values (${o.benutzerId}::uuid, ${o.name}, ${o.tag}::date, ${o.was}, ${o.art},
            ${o.altZeitpunkt}::timestamptz, ${o.neuZeitpunkt}::timestamptz, ${o.grund}, ${o.wer},
            ${o.altMinuten ?? null}, ${o.neuMinuten ?? null}, ${o.altText ?? ""}, ${o.neuText ?? ""})
  `.catch((f) => console.warn("[stempel] Änderung nicht vermerkt:", f));
}

/** Der Tag eines Zeitpunkts in hiesiger Zeit. */
function tagVon(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export async function zeitAendern(id: string, zeitpunkt: string, von: string, grund = ""): Promise<void> {
  const vorher = (await db()`
    select benutzer_id, name, art, zeitpunkt from stempel where id = ${id}
  `) as Array<Record<string, unknown>>;

  await db()`
    update stempel
       set original_zeitpunkt = coalesce(original_zeitpunkt, zeitpunkt),
           zeitpunkt = ${zeitpunkt}::timestamptz,
           geaendert_von = ${von}, geaendert_am = now(),
           notiz = case when notiz = '' then ${`Zeit geändert von ${von}`} else notiz end
     where id = ${id}
  `;

  if (vorher[0]) {
    const alt = new Date(vorher[0].zeitpunkt as string).toISOString();
    await aenderungMerken({
      benutzerId: String(vorher[0].benutzer_id),
      name: String(vorher[0].name ?? ""),
      // Der Tag der neuen Zeit: Wird ein Stempel auf einen anderen Tag
      // geschoben, gehoert die Notiz zu dem Tag, an dem er jetzt steht.
      tag: tagVon(zeitpunkt),
      was: "geaendert",
      art: String(vorher[0].art ?? ""),
      altZeitpunkt: alt,
      neuZeitpunkt: new Date(zeitpunkt).toISOString(),
      grund,
      wer: von,
    });
  }
}

/** Löscht einen Stempel, etwa wenn jemand versehentlich doppelt gestempelt hat. */
export async function stempelEntfernen(id: string, von = "", grund = ""): Promise<void> {
  const vorher = (await db()`
    select benutzer_id, name, art, zeitpunkt from stempel where id = ${id}
  `) as Array<Record<string, unknown>>;

  await db()`delete from stempel where id = ${id}`;

  if (vorher[0]) {
    const alt = new Date(vorher[0].zeitpunkt as string).toISOString();
    await aenderungMerken({
      benutzerId: String(vorher[0].benutzer_id),
      name: String(vorher[0].name ?? ""),
      tag: tagVon(alt),
      was: "geloescht",
      art: String(vorher[0].art ?? ""),
      altZeitpunkt: alt,
      neuZeitpunkt: null,
      grund,
      wer: von,
    });
  }
}

export interface Zeitaenderung {
  id: string;
  tag: string;
  was: string;
  art: string;
  altZeitpunkt: string | null;
  neuZeitpunkt: string | null;
  grund: string;
  wer: string;
  wann: string;
  /** Nur bei "tag_berichtigt" gesetzt: der ganze Tag vorher und nachher. */
  altMinuten: number | null;
  neuMinuten: number | null;
  altText: string;
  neuText: string;
}

/** Was an einem Tag korrigiert wurde. */
export async function aenderungenAmTag(benutzerId: string, tag: string): Promise<Zeitaenderung[]> {
  const z = (await db()`
    select id, tag::text as tag, was, art, alt_zeitpunkt, neu_zeitpunkt, grund, wer, wann,
           alt_minuten, neu_minuten, alt_text, neu_text
      from stempel_aenderung
     where benutzer_id = ${benutzerId}::uuid and tag = ${tag}::date
     order by wann desc
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    tag: String(r.tag),
    was: String(r.was),
    art: String(r.art ?? ""),
    altZeitpunkt: r.alt_zeitpunkt ? new Date(r.alt_zeitpunkt as string).toISOString() : null,
    neuZeitpunkt: r.neu_zeitpunkt ? new Date(r.neu_zeitpunkt as string).toISOString() : null,
    grund: String(r.grund ?? ""),
    wer: String(r.wer ?? ""),
    wann: new Date(r.wann as string).toISOString(),
    altMinuten: r.alt_minuten === null || r.alt_minuten === undefined ? null : Number(r.alt_minuten),
    neuMinuten: r.neu_minuten === null || r.neu_minuten === undefined ? null : Number(r.neu_minuten),
    altText: String(r.alt_text ?? ""),
    neuText: String(r.neu_text ?? ""),
  }));
}

/** Trägt einen vergessenen Stempel nach. */
export async function nachtragen(o: {
  benutzerId: string;
  art: StempelArt;
  zeitpunkt: string;
  von: string;
  grund?: string;
}): Promise<void> {
  const p = (await db()`select name from benutzer where id = ${o.benutzerId}`) as Array<{ name: string }>;
  if (!p[0]) throw new Error("Diese Person gibt es nicht.");
  await db()`
    insert into stempel (benutzer_id, name, art, zeitpunkt, im_haus, quelle, notiz, geaendert_von, geaendert_am)
    values (${o.benutzerId}, ${p[0].name}, ${o.art}, ${o.zeitpunkt}::timestamptz, true, 'korrektur',
            ${`Nachgetragen von ${o.von}`}, ${o.von}, now())
  `;
  await aenderungMerken({
    benutzerId: o.benutzerId,
    name: p[0].name,
    tag: tagVon(o.zeitpunkt),
    was: "nachgetragen",
    art: o.art,
    altZeitpunkt: null,
    neuZeitpunkt: new Date(o.zeitpunkt).toISOString(),
    grund: o.grund ?? "",
    wer: o.von,
  });
}

/** Alle, die stempeln: für die Auswahl in der Korrektur. */
export async function stempelnde(): Promise<Array<{ id: string; name: string }>> {
  // Nach Familienname, wie ueberall (Florian, 29.09.2026).
  return ((await db()`
    select id, name from benutzer
     where aktiv and rolle not in ('kiosk', 'gastro') and coalesce(art, 'intern') <> 'extern'
  `) as Array<{ id: string; name: string }>).sort(nachFamilienname);
}

/* ------------------------------------------------------------------ *
 * Anträge: Mitarbeiter ändern nichts selbst, sie bitten darum.
 * ------------------------------------------------------------------ */

export interface Antrag {
  id: string;
  benutzerId: string;
  name: string;
  art: "aenderung" | "pausengrund";
  tag: string;
  text: string;
  status: "offen" | "angenommen" | "abgelehnt" | "notiert";
  antwort: string;
  erstelltAm: string;
  entschiedenVon: string | null;
  /**
   * Die tatsächlichen Zeiten, wenn der Mitarbeiter sie strukturiert
   * angegeben hat (etwa nach einem vergessenen Ausstempeln). Alle vier
   * optional: meist fehlt nur "gehen".
   */
  vorschlagKommen: string | null;
  vorschlagPauseStart: string | null;
  vorschlagPauseEnde: string | null;
  vorschlagGehen: string | null;
}

const ANTRAG_SPALTEN = `id, benutzer_id, name, art, to_char(tag, 'YYYY-MM-DD') as tag, text, status, antwort,
  erstellt_am, entschieden_von, vorschlag_kommen, vorschlag_pause_start, vorschlag_pause_ende, vorschlag_gehen`;

function bauAntrag(z: Record<string, unknown>): Antrag {
  const zeit = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(z.id),
    benutzerId: String(z.benutzer_id),
    name: String(z.name),
    art: z.art as Antrag["art"],
    tag: String(z.tag).slice(0, 10),
    text: String(z.text),
    status: z.status as Antrag["status"],
    antwort: String(z.antwort ?? ""),
    erstelltAm: new Date(z.erstellt_am as string).toISOString(),
    entschiedenVon: z.entschieden_von === null ? null : String(z.entschieden_von),
    vorschlagKommen: zeit(z.vorschlag_kommen),
    vorschlagPauseStart: zeit(z.vorschlag_pause_start),
    vorschlagPauseEnde: zeit(z.vorschlag_pause_ende),
    vorschlagGehen: zeit(z.vorschlag_gehen),
  };
}

export async function antragStellen(o: {
  benutzerId: string;
  name: string;
  art: Antrag["art"];
  tag: string;
  text: string;
  vorschlagKommen?: string | null;
  vorschlagPauseStart?: string | null;
  vorschlagPauseEnde?: string | null;
  vorschlagGehen?: string | null;
}): Promise<void> {
  await db()`
    insert into stempel_antrag
      (benutzer_id, name, art, tag, text, status, vorschlag_kommen, vorschlag_pause_start, vorschlag_pause_ende, vorschlag_gehen)
    values (${o.benutzerId}, ${o.name}, ${o.art}, ${o.tag}::date, ${o.text},
            ${o.art === "pausengrund" ? "notiert" : "offen"},
            ${o.vorschlagKommen ?? null}, ${o.vorschlagPauseStart ?? null},
            ${o.vorschlagPauseEnde ?? null}, ${o.vorschlagGehen ?? null})
  `;
}

/** Offene Anträge, für Werner, Kevin und Florian. */
export async function antraege(nur?: "offen"): Promise<Antrag[]> {
  const z = (
    nur === "offen"
      ? await db()`select ${db().unsafe(ANTRAG_SPALTEN)} from stempel_antrag where status = 'offen' order by erstellt_am`
      : await db()`select ${db().unsafe(ANTRAG_SPALTEN)} from stempel_antrag order by erstellt_am desc limit 60`
  ) as Array<Record<string, unknown>>;
  return z.map(bauAntrag);
}

export async function antraegeVon(benutzerId: string, anzahl = 10): Promise<Antrag[]> {
  const z = (await db()`
    select ${db().unsafe(ANTRAG_SPALTEN)} from stempel_antrag
     where benutzer_id = ${benutzerId} order by erstellt_am desc limit ${anzahl}
  `) as Array<Record<string, unknown>>;
  return z.map(bauAntrag);
}

/**
 * Was der Mitarbeiter zu diesem Tag geschrieben hat.
 *
 * Alles, was zu dem Tag geschrieben wurde, auch schon Angenommenes.
 *
 * Zuerst standen hier nur offene Eintraege. Das ging schief: Olena hatte
 * am 09.10.2026 zum 08.10. geschrieben, wann sie wirklich Feierabend
 * gemacht hat, Florian hat den Antrag angenommen -- und damit war der
 * Text verschwunden, obwohl die Zeiten noch gar nicht geaendert waren.
 * Genau in dem Moment, in dem er korrigieren wollte, fehlte ihm die
 * Information.
 *
 * Verschwinden sollen die Kommentare erst, wenn der Tag wirklich
 * berichtigt ist. Darueber entscheidet die Seite, nicht diese Abfrage.
 */
export async function antraegeAmTag(benutzerId: string, tag: string): Promise<Antrag[]> {
  const z = (await db()`
    select ${db().unsafe(ANTRAG_SPALTEN)} from stempel_antrag
     where benutzer_id = ${benutzerId} and tag = ${tag}::date
       and status <> 'abgelehnt'
     order by erstellt_am
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(bauAntrag);
}

/**
 * Hakt alles ab, was zu diesem Tag offen war.
 *
 * Wer den Tag berichtigt hat, hat den Kommentar gelesen und beantwortet.
 * Er verschwindet deshalb aus der Ansicht, bleibt aber mit Antwort und
 * Namen in der Tabelle stehen.
 */
export async function antraegeAmTagErledigen(
  benutzerId: string,
  tag: string,
  antwort: string,
  von: string,
): Promise<number> {
  const z = (await db()`
    update stempel_antrag
       set status = 'angenommen', antwort = ${antwort}, entschieden_von = ${von}, entschieden_am = now()
     where benutzer_id = ${benutzerId} and tag = ${tag}::date and status <> 'abgelehnt'
    returning id
  `.catch(() => [])) as unknown[];
  return z.length;
}

export async function antragEntscheiden(
  id: string,
  status: "angenommen" | "abgelehnt",
  antwort: string,
  von: string,
): Promise<Antrag | null> {
  const z = (await db()`
    update stempel_antrag
       set status = ${status}, antwort = ${antwort}, entschieden_von = ${von}, entschieden_am = now()
     where id = ${id}
    returning ${db().unsafe(ANTRAG_SPALTEN)}
  `) as Array<Record<string, unknown>>;
  return z[0] ? bauAntrag(z[0]) : null;
}

/** Nur den Antrag lesen, um vor dem Übernehmen zu wissen, was drinsteht. */
export async function antragLesen(id: string): Promise<Antrag | null> {
  const z = (await db()`
    select ${db().unsafe(ANTRAG_SPALTEN)} from stempel_antrag where id = ${id}
  `) as Array<Record<string, unknown>>;
  return z[0] ? bauAntrag(z[0]) : null;
}

/**
 * Übernimmt die vom Mitarbeiter angegebenen Zeiten direkt in die Stempeluhr.
 *
 * Für "gehen" und "kommen" wird der bestehende Stempel des Tages
 * verschoben, falls es einen gibt (meist der automatische), sonst wird
 * einer angelegt. Für die Pause wird nachgetragen, wenn an dem Tag noch
 * keine Pause steht. Jede Zeile bekommt in "geändert von" den Hinweis,
 * dass die Angabe vom Mitarbeiter selbst stammt und wer sie bestätigt hat.
 */
export async function antragUebernehmen(id: string, von: string): Promise<Antrag | null> {
  const a = await antragLesen(id);
  if (!a) return null;
  const bereitsAmTag = await stempelAmTag(a.benutzerId, a.tag);
  const vermerk = `Selbstauskunft von ${a.name}, bestätigt von ${von}`;

  const uebernehmen = async (art: StempelArt, zeitpunkt: string | null) => {
    if (!zeitpunkt) return;
    const bestehend = [...bereitsAmTag].reverse().find((s) => s.art === art);
    if (bestehend) await zeitAendern(bestehend.id, zeitpunkt, vermerk);
    else {
      await db()`
        insert into stempel (benutzer_id, name, art, zeitpunkt, im_haus, quelle, notiz, geaendert_von, geaendert_am)
        values (${a.benutzerId}, ${a.name}, ${art}, ${zeitpunkt}::timestamptz, true, 'korrektur', ${vermerk}, ${von}, now())
      `;
    }
  };

  await uebernehmen("kommen", a.vorschlagKommen);
  await uebernehmen("pause_start", a.vorschlagPauseStart);
  await uebernehmen("pause_ende", a.vorschlagPauseEnde);
  await uebernehmen("gehen", a.vorschlagGehen);

  return antragEntscheiden(id, "angenommen", `Übernommen: ${vermerk}`, von);
}

/** Hat diese Person heute schon geschrieben, warum die Pause ausfiel? */
export async function pausengrundHeute(benutzerId: string): Promise<boolean> {
  const z = (await db()`
    select 1 from stempel_antrag
     where benutzer_id = ${benutzerId} and art = 'pausengrund'
       and tag = (now() at time zone 'Europe/Berlin')::date
  `) as unknown[];
  return z.length > 0;
}

/* ------------------------------------------------------------------ *
 * Den ganzen Tag berichtigen
 *
 * Wer das Einstempeln vergisst, vergisst meistens auch das Ausstempeln
 * und die Pause. Jeden Stempel einzeln zu reparieren sind dann sechs
 * Formulare fuer einen Abend. Hier wird stattdessen gesagt, wie der Tag
 * wirklich war; das Programm vergleicht und nimmt die eingetragene Zeit
 * (Florian, 09.10.2026).
 *
 * Die gestempelte Fassung geht dabei nicht verloren. Sie steht als Text
 * und als Minutenzahl im Aenderungsbuch, zusammen mit der neuen Fassung,
 * dem Unterschied, dem Grund und dem Namen. Arbeitszeit ist
 * nachweispflichtig: Es muss spaeter noch zu sehen sein, was der
 * Mitarbeiter gestempelt hat und was das Buero daraus gemacht hat.
 * ------------------------------------------------------------------ */

/** Eine Uhrzeit aus einem Zeitpunkt, hiesige Zeit, als "17:05". */
function uhrzeitVon(ms: number): string {
  return new Date(ms).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

/**
 * Ein Tag in einem Satz: "17:05 bis 23:10, Pause 0:30, 5:35 Stunden".
 *
 * Gedacht zum Lesen, nicht zum Rechnen. Steht so im Aenderungsbuch und
 * in der Gegenueberstellung auf dem Schirm.
 */
export function tagInWorten(stempel: Array<{ art: string; ms: number }>, rechnung: {
  arbeitMinuten: number;
  pauseMinuten: number;
  offen: boolean;
}): string {
  if (stempel.length === 0) return "nicht gestempelt";
  const kommen = stempel.find((x) => x.art === "kommen");
  const gehen = [...stempel].reverse().find((x) => x.art === "gehen");
  const von = kommen ? uhrzeitVon(kommen.ms) : "?";
  const bis = gehen ? uhrzeitVon(gehen.ms) : rechnung.offen ? "offen" : "?";
  const pause = rechnung.pauseMinuten > 0 ? `, Pause ${stunden(rechnung.pauseMinuten)}` : "";
  return `${von} bis ${bis}${pause}, ${stunden(rechnung.arbeitMinuten)} Stunden`;
}

export interface Berichtigung {
  altMinuten: number;
  neuMinuten: number;
  altText: string;
  neuText: string;
  /** Neu minus gestempelt, in Minuten. Negativ heisst: weniger als gestempelt. */
  unterschied: number;
  /** Wie viele Kommentare des Mitarbeiters damit beantwortet wurden. */
  kommentareErledigt: number;
}

/**
 * Setzt den ganzen Tag neu: Kommen, Pause, Gehen.
 *
 * Alles, was an diesem Tag gestempelt war, wird ersetzt. Die alten
 * Zeiten bleiben im Aenderungsbuch stehen, deshalb genuegt EIN Eintrag
 * fuer den ganzen Vorgang statt sechs einzelner.
 *
 * Zeiten nach Mitternacht sind der Normalfall, nicht die Ausnahme: Wer um
 * 17 Uhr kommt und um 0:30 geht, hat eine Schicht gearbeitet. Deshalb
 * rutscht jede Uhrzeit, die vor der vorhergehenden liegt, auf den
 * naechsten Tag.
 */
export async function tagBerichtigen(o: {
  benutzerId: string;
  tag: string;
  /** "17:30" */
  kommen: string;
  pauseVon?: string;
  pauseBis?: string;
  gehen: string;
  grund: string;
  von: string;
}): Promise<Berichtigung> {
  const p = (await db()`select name from benutzer where id = ${o.benutzerId}`) as Array<{ name: string }>;
  if (!p[0]) throw new Error("Diese Person gibt es nicht.");

  const vorher = await schichtAmTag(o.benutzerId, o.tag);
  const alteRechnung = tagRechnen(
    o.tag,
    vorher.map((x) => ({ art: x.art, ms: Date.parse(x.zeitpunkt), geaendertVon: x.geaendertVon })),
  );
  const altText = tagInWorten(
    vorher.map((x) => ({ art: x.art, ms: Date.parse(x.zeitpunkt) })),
    alteRechnung,
  );

  // Die neuen Zeitpunkte, der Reihe nach. Jede Uhrzeit, die vor der
  // vorhergehenden liegt, gehoert zum naechsten Tag.
  const folge: Array<{ art: StempelArt; uhrzeit: string }> = [{ art: "kommen", uhrzeit: o.kommen }];
  if (o.pauseVon && o.pauseBis) {
    folge.push({ art: "pause_start", uhrzeit: o.pauseVon });
    folge.push({ art: "pause_ende", uhrzeit: o.pauseBis });
  }
  folge.push({ art: "gehen", uhrzeit: o.gehen });

  let letzte = -1;
  let tagVersatz = 0;
  const neu = folge.map((f) => {
    const [h, m] = f.uhrzeit.split(":").map(Number);
    const minuten = h * 60 + m;
    if (minuten < letzte) tagVersatz += 1;
    letzte = minuten;
    return { art: f.art, zeitpunkt: berlinZeitpunkt(o.tag, f.uhrzeit, tagVersatz) };
  });

  /*
    Erst raus, dann rein: Was gestempelt war, gilt nicht mehr.

    Geloescht wird vom Beginn des Tages bis zum neuen Gehen, mindestens
    aber bis Mitternacht. So verschwindet auch ein altes Gehen, das nach
    Mitternacht steht und damit rechnerisch zum naechsten Tag gehoert --
    sonst bliebe es als Rest stehen.
  */
  const fensterVon = berlinZeitpunkt(o.tag, "00:00");
  const letzterNeuer = neu[neu.length - 1].zeitpunkt;
  const mitternacht = berlinZeitpunkt(o.tag, "00:00", 1);
  const fensterBis = letzterNeuer > mitternacht ? letzterNeuer : mitternacht;
  await db()`
    delete from stempel
     where benutzer_id = ${o.benutzerId}
       and zeitpunkt >= ${fensterVon}::timestamptz
       and zeitpunkt <= ${fensterBis}::timestamptz
  `;
  for (const n of neu) {
    await db()`
      insert into stempel (benutzer_id, name, art, zeitpunkt, im_haus, quelle, notiz, geaendert_von, geaendert_am)
      values (${o.benutzerId}, ${p[0].name}, ${n.art}, ${n.zeitpunkt}::timestamptz, true, 'korrektur',
              ${`Tag berichtigt von ${o.von}`}, ${o.von}, now())
    `;
  }

  const neueRechnung = tagRechnen(
    o.tag,
    neu.map((n) => ({ art: n.art, ms: Date.parse(n.zeitpunkt), geaendertVon: o.von })),
  );
  const neuText = tagInWorten(
    neu.map((n) => ({ art: n.art, ms: Date.parse(n.zeitpunkt) })),
    neueRechnung,
  );

  const ergebnis: Berichtigung = {
    altMinuten: alteRechnung.arbeitMinuten,
    neuMinuten: neueRechnung.arbeitMinuten,
    altText,
    neuText,
    unterschied: neueRechnung.arbeitMinuten - alteRechnung.arbeitMinuten,
    kommentareErledigt: 0,
  };

  /*
    Der Kommentar des Mitarbeiters ist damit beantwortet.

    Wer den Tag berichtigt, hat ihn gelesen; ihn danach noch als offen
    stehen zu lassen, hiesse, dieselbe Arbeit zweimal anzubieten
    (Florian, 09.10.2026).
  */
  ergebnis.kommentareErledigt = await antraegeAmTagErledigen(
    o.benutzerId,
    o.tag,
    `Tag berichtigt: ${neuText} (vorher ${altText}).`,
    o.von,
  );

  await aenderungMerken({
    benutzerId: o.benutzerId,
    name: p[0].name,
    tag: o.tag,
    was: "tag_berichtigt",
    art: "",
    altZeitpunkt: null,
    neuZeitpunkt: null,
    grund: o.grund,
    wer: o.von,
    altMinuten: ergebnis.altMinuten,
    neuMinuten: ergebnis.neuMinuten,
    altText,
    neuText,
  });

  return ergebnis;
}

/**
 * Tag und Uhrzeit zu einem Zeitpunkt, in hiesiger Zeit.
 *
 * Deutschland hat zwei Abstaende zur Weltzeit, je nach Jahreszeit. Der
 * Umweg ueber Intl nimmt den richtigen, ohne dass hier eine Tabelle
 * gepflegt werden muesste.
 */
function berlinZeitpunkt(tag: string, uhrzeit: string, plusTage = 0): string {
  const [j, m, t] = tag.split("-").map(Number);
  const [h, min] = uhrzeit.split(":").map(Number);
  const roh = Date.UTC(j, m - 1, t + plusTage, h, min);
  const probe = new Date(roh);
  const berlin = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(roh - (berlin.getTime() - utc.getTime())).toISOString();
}

/** Stunden und Minuten als "7:45". */
export function stunden(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
