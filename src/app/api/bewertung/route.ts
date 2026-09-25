import { NextResponse } from "next/server";
import { taeglicherBewertungslauf } from "@/lib/bewertung/lauf";
import { abbrecherLauf } from "@/lib/abbrecher/lauf";

/**
 * Der Auslöser für die Bewertungsmail, jeden Morgen.
 *
 * Wie /api/vorfreude: von der Uhr bei Vercel gerufen (vercel.json), nur mit
 * "Authorization: Bearer <CRON_SECRET>". 08:00 UTC ist 10 Uhr im Sommer und
 * 9 Uhr im Winter.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  if (!geheimnis || request.headers.get("authorization") !== `Bearer ${geheimnis}`) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  try {
    const e = await taeglicherBewertungslauf();
    // Gleich mit erledigen: Wer im Warenkorb stehen geblieben ist, bekommt
    // die Frage, und drei Tage spaeter wird das Getraenkepaket verlost.
    const a = await abbrecherLauf().catch((f) => {
      console.error("[abbrecher] Lauf fehlgeschlagen:", f);
      return { gefragt: 0, gezogen: 0, getroestet: 0, uebersprungen: 0, fehler: [] };
    });
    if (a.gefragt || a.gezogen || a.getroestet)
      console.log(`[abbrecher] ${a.gefragt} gefragt, ${a.gezogen} gezogen, ${a.getroestet} mit Glas oder Zauberstab`);
    console.log(
      `[bewertung] ${e.datum}: ${e.ausgeschaltet ? "ausgeschaltet" : `${e.verschickt.length} verschickt, ${e.uebersprungen.length} übersprungen, ${e.fehler.length} Fehler`}`,
    );
    return NextResponse.json({ ok: true, ...e, abbrecher: a });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[bewertung] Lauf fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
