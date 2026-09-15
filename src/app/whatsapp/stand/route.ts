import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { ungelesenStand } from "@/lib/db/whatsapp";

/**
 * Wie viele Unterhaltungen gerade neu sind, und welche zuletzt.
 *
 * Fragt die Einblendung unten rechts regelmässig ab (WhatsAppMelder). Nur
 * für angemeldete Benutzer mit Freigabe; alle anderen bekommen eine leere
 * Antwort statt einer Fehlermeldung, damit auf ihren Geräten nichts
 * sichtbar knallt.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer?.whatsapp) {
    return NextResponse.json({ ungelesen: 0, unbeantwortet: 0, dringend: 0, neueste: null }, { status: 403 });
  }

  try {
    return NextResponse.json(await ungelesenStand(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ungelesen: 0, unbeantwortet: 0, dringend: 0, neueste: null }, { status: 503 });
  }
}
