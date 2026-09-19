import { NextResponse } from "next/server";
import { taeglicherRechnungslauf } from "@/lib/wein/rechnung";

/**
 * Jeden Morgen: Monatsrechnung für den Magicuvée (in den ersten Tagen des
 * Monats, wenn eingeschaltet) und der Blick in lexoffice, ob bezahlt ist.
 * Nur mit "Authorization: Bearer <CRON_SECRET>", siehe vercel.json.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  if (!geheimnis || request.headers.get("authorization") !== `Bearer ${geheimnis}`) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  try {
    const e = await taeglicherRechnungslauf();
    console.log(`[wein] Rechnung: ${e.erstellt ?? "keine"}, ${e.bezahlt} neu bezahlt`);
    return NextResponse.json({ ok: true, ...e });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[wein] Lauf fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
