import { NextResponse } from "next/server";

import { wand } from "@/lib/postkarte/db";

/**
 * Die Gästewand für die öffentliche Webseite.
 *
 * Offen ohne Schlüssel, aber eng: Es kommen ausschliesslich Karten
 * heraus, die freigegeben UND datenschutzrechtlich frei sind und eine
 * geschwärzte Fassung haben. Das Original ist hier nicht zu bekommen,
 * auch nicht die Rohantwort der KI, auch nicht, wer gescannt hat.
 *
 * Der Shop holt sich das beim Bauen der Seite, stündlich neu.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const thema = (u.searchParams.get("thema") ?? "").trim() || undefined;
  const anzahl = Number(u.searchParams.get("anzahl") ?? 120);

  try {
    const karten = await wand({ thema, anzahl });
    return NextResponse.json(
      { karten, stand: new Date().toISOString() },
      { headers: { "cache-control": "public, max-age=300, s-maxage=300" } },
    );
  } catch (f) {
    console.error("[postkarte] Wand:", f);
    return NextResponse.json({ karten: [], fehler: "nicht erreichbar" }, { status: 503 });
  }
}
