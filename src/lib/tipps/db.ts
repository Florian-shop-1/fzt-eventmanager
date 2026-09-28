/**
 * Tipps & Tricks: eine kleine Videosammlung mit Anleitungen fürs
 * Showteam. Siehe migrations/087_tipps.sql.
 */

import { db } from "@/lib/db/client";
import type { Tipp } from "./filter";

export type { Tipp } from "./filter";

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
  };
}

export async function alleTipps(): Promise<Tipp[]> {
  const z = (await db()`select * from tipp order by erstellt_am desc`) as Array<Record<string, unknown>>;
  return z.map(zeile);
}

export async function tippAnlegen(o: {
  titel: string;
  beschreibung: string;
  schlagworte: string;
  videoUrl: string;
  videoTyp: string;
  von: string;
}): Promise<void> {
  await db()`
    insert into tipp (titel, beschreibung, schlagworte, video_url, video_typ, erstellt_von)
    values (${o.titel}, ${o.beschreibung}, ${o.schlagworte}, ${o.videoUrl}, ${o.videoTyp}, ${o.von})
  `;
}

export async function tippLoeschen(id: string): Promise<void> {
  await db()`delete from tipp where id = ${id}`;
}
