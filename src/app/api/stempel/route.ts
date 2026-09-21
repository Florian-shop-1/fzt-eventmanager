import { NextResponse } from "next/server";
import { langeSchichtenPruefen } from "@/lib/stempel/wache";

/**
 * Prüft regelmäßig, wer zu lange eingestempelt ist, und meldet das an
 * Florian und Kevin. Von der Uhr bei Vercel gerufen (vercel.json), nur mit
 * "Authorization: Bearer <CRON_SECRET>".
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  if (!geheimnis || request.headers.get("authorization") !== `Bearer ${geheimnis}`) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  try {
    const e = await langeSchichtenPruefen();
    if (e.gemeldet > 0) console.log(`[stempel] ${e.gemeldet} lange Schicht(en) gemeldet`);
    return NextResponse.json({ ok: true, ...e });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[stempel] Lauf fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
