import { NextResponse } from "next/server";
import { angemeldeterBenutzer, darfZeitenAendern } from "@/lib/auth/sitzung";
import { werIstDa } from "@/lib/stempel/db";

/**
 * Wer gerade eingestempelt ist, als JSON. Für die live aktualisierte
 * Liste im Büro-Admin (siehe components/WerIstDaLive.tsx).
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const b = await angemeldeterBenutzer();
  if (!darfZeitenAendern(b)) return NextResponse.json({ ok: false }, { status: 403 });
  const da = await werIstDa();
  return NextResponse.json({ ok: true, da });
}
