import { NextResponse } from "next/server";
import { taeglicheErinnerung } from "@/lib/dienstplan/laden";

/**
 * Erinnert jeden Morgen an offene Schichten im Dienstplan, siehe
 * taeglicheErinnerung. Von der Uhr bei Vercel gerufen (vercel.json), nur mit
 * "Authorization: Bearer <CRON_SECRET>". 07:00 UTC ist 9 Uhr im Sommer.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  if (!geheimnis || request.headers.get("authorization") !== `Bearer ${geheimnis}`) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  try {
    const e = await taeglicheErinnerung();
    console.log(`[dienstplan] ${e.schichten} offene Schichten, ${e.mails} Mails, ${e.fehler.length} Fehler`);
    return NextResponse.json({ ok: true, ...e });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[dienstplan] Lauf fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
