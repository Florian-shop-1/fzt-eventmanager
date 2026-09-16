import { NextResponse } from "next/server";
import { nachtlauf } from "@/lib/scanner/ablauf";

/**
 * Der nächtliche Lauf des Scanners: Claude-Ergebnisse abholen, unklare
 * Karten an Claude schicken, alte Fotos löschen.
 *
 * Von der Uhr bei Vercel zweimal gerufen (vercel.json): um 1 Uhr UTC zum
 * Abschicken, um 5 Uhr UTC zum Abholen. Nur mit "Authorization: Bearer
 * <CRON_SECRET>", wie /api/vorfreude.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  if (!geheimnis || request.headers.get("authorization") !== `Bearer ${geheimnis}`) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  try {
    const e = await nachtlauf();
    console.log(`[scanner] ${e.abgeholt} abgeholt, ${e.abgeschickt} an Claude, ${e.fotosGeloescht} Fotos gelöscht, ${e.fehler.length} Fehler`);
    return NextResponse.json({ ok: true, ...e });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[scanner] Lauf fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
