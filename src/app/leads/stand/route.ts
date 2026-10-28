import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { anfragenStand } from "@/lib/db/anfragen";

/**
 * Wie viele Anfragen gerade unbearbeitet sind, und welche zuletzt kam.
 *
 * Fragt das rote Zeichen in der Navigation regelmässig ab (AnfragenMarke). Nur für Büro und Chef; alle anderen
 * bekommen eine leere Antwort statt einer Fehlermeldung, damit auf ihren Geräten nichts sichtbar knallt.
 */

export const dynamic = "force-dynamic";

const LEER = { neu: 0, altbestand: 0, neueste: null };

export async function GET() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !["chef", "team"].includes(benutzer.rolle)) {
    return NextResponse.json(LEER, { status: 403 });
  }
  try {
    return NextResponse.json(await anfragenStand(), { headers: { "Cache-Control": "no-store" } });
  } catch (f) {
    console.error("[anfragen] Stand:", f);
    return NextResponse.json(LEER, { status: 503 });
  }
}
