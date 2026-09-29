/**
 * Tipps & Tricks: eine kleine Videosammlung mit Anleitungen fürs
 * Showteam. Siehe migrations/087_tipps.sql und 101_tipp_reihe.sql.
 *
 * Zwei Sorten Eintrag: das einzelne Video ("12-V-Akkus laden") und die
 * Reihe, die aus mehreren Schritten besteht ("Show einschalten"). Eine
 * Reihe sieht man der Reihe nach, sonst ergibt sie keinen Sinn
 * (Florian, 29.09.2026).
 */

import { db } from "@/lib/db/client";
import type { Tipp } from "./filter";

export type { Tipp } from "./filter";

export interface Reihe {
  id: string;
  titel: string;
  beschreibung: string;
  schlagworte: string;
  erstelltVon: string;
  erstelltAm: string;
  /** Die Videos, in der Reihenfolge, in der man sie ansehen soll. */
  schritte: Tipp[];
}

function zeile(r: Record<string, unknown>): Tipp {
  return {
    id: String(r.id),
    titel: String(r.titel),
    beschreibung: String(r.beschreibung ?? ""),
    schlagworte: String(r.schlagworte ?? ""),
    videoUrl: String(r.video_url),
    videoTyp: String(r.video_typ),
    erstelltVon: String(r.erstellt_von),
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
    reiheId: r.reihe_id ? String(r.reihe_id) : null,
    schritt: Number(r.schritt ?? 1),
  };
}

/** Nur die einzelnen Videos, ohne die Schritte einer Reihe. */
export async function alleTipps(): Promise<Tipp[]> {
  const z = (await db()`
    select * from tipp where reihe_id is null order by erstellt_am desc
  `) as Array<Record<string, unknown>>;
  return z.map(zeile);
}

export async function alleReihen(): Promise<Reihe[]> {
  const r = (await db()`select * from tipp_reihe order by erstellt_am desc`) as Array<
    Record<string, unknown>
  >;
  if (r.length === 0) return [];

  const schritte = (await db()`
    select * from tipp where reihe_id is not null order by reihe_id, schritt
  `) as Array<Record<string, unknown>>;

  return r.map((x) => ({
    id: String(x.id),
    titel: String(x.titel),
    beschreibung: String(x.beschreibung ?? ""),
    schlagworte: String(x.schlagworte ?? ""),
    erstelltVon: String(x.erstellt_von),
    erstelltAm: new Date(x.erstellt_am as string).toISOString(),
    schritte: schritte.filter((s) => String(s.reihe_id) === String(x.id)).map(zeile),
  }));
}

export async function reiheLesen(id: string): Promise<Reihe | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const alle = await alleReihen();
  return alle.find((r) => r.id === id) ?? null;
}

export async function tippAnlegen(o: {
  titel: string;
  beschreibung: string;
  schlagworte: string;
  videoUrl: string;
  videoTyp: string;
  von: string;
  reiheId?: string | null;
  schritt?: number;
}): Promise<void> {
  await db()`
    insert into tipp (titel, beschreibung, schlagworte, video_url, video_typ, erstellt_von, reihe_id, schritt)
    values (${o.titel}, ${o.beschreibung}, ${o.schlagworte}, ${o.videoUrl}, ${o.videoTyp}, ${o.von},
            ${o.reiheId ?? null}::uuid, ${o.schritt ?? 1})
  `;
}

/**
 * Eine Reihe mit allen Schritten auf einmal anlegen.
 *
 * Die Videos sind zu dem Zeitpunkt schon hochgeladen, hier entstehen nur
 * die Einträge. Die Reihenfolge ist die der übergebenen Liste.
 */
export async function reiheAnlegen(o: {
  titel: string;
  beschreibung: string;
  schlagworte: string;
  von: string;
  schritte: Array<{ titel: string; videoUrl: string; videoTyp: string }>;
}): Promise<string> {
  const r = (await db()`
    insert into tipp_reihe (titel, beschreibung, schlagworte, erstellt_von)
    values (${o.titel}, ${o.beschreibung}, ${o.schlagworte}, ${o.von})
    returning id
  `) as Array<{ id: string }>;
  const reiheId = String(r[0].id);

  for (const [i, s] of o.schritte.entries()) {
    await tippAnlegen({
      titel: s.titel || `Schritt ${i + 1}`,
      beschreibung: "",
      // Die Schlagworte der Reihe zählen für jeden Schritt: So findet die
      // Suche die Reihe auch über ein einzelnes Video.
      schlagworte: o.schlagworte,
      videoUrl: s.videoUrl,
      videoTyp: s.videoTyp,
      von: o.von,
      reiheId,
      schritt: i + 1,
    });
  }

  return reiheId;
}

export async function tippLoeschen(id: string): Promise<void> {
  await db()`delete from tipp where id = ${id}`;
}

/** Löscht die Reihe samt ihrer Schritte (die Videos hängen daran). */
export async function reiheLoeschen(id: string): Promise<void> {
  await db()`delete from tipp_reihe where id = ${id}`;
}
