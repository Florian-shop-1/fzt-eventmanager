/**
 * Wie viel gerade in die Post muss.
 *
 * Fragt der Knopf in der Navigation regelmässig ab (VersandMelder).
 * Bisher fiel Versand nur auf, wenn jemand daran dachte, die Seite zu
 * öffnen, und die Seite lag auch noch unter "Events". Ein Gutschein, der
 * drei Tage liegen bleibt, ist ein verärgerter Kunde (Florian,
 * 25.09.2026).
 *
 * "offen" sind Sendungen, die in die Post gehen und noch nicht abgehakt
 * sind. "klaerung" sind die, bei denen etwas fehlt, etwa die Anschrift.
 */

import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { brauchtKlaerung, gehtInDiePost, holeSendungen } from "@/lib/shop/versand";
import { versandStaende } from "@/lib/db/buero";

export const dynamic = "force-dynamic";

const LEER = { offen: 0, klaerung: 0 };

export async function GET() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !["chef", "team"].includes(benutzer.rolle)) {
    return NextResponse.json(LEER, { status: 403 });
  }

  try {
    const [sendungen, staende] = await Promise.all([holeSendungen(), versandStaende()]);

    let offen = 0;
    let klaerung = 0;

    for (const s of sendungen) {
      if (!gehtInDiePost(s)) continue;
      if (staende.get(s.bestellnummer)?.erledigtAm) continue;
      offen += 1;
      if (brauchtKlaerung(s)) klaerung += 1;
    }

    return NextResponse.json({ offen, klaerung }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Lieber kein Zähler als eine Fehlermeldung im Kopf jeder Seite.
    return NextResponse.json(LEER, { status: 503 });
  }
}
