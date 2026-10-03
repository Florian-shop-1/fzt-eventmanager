import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { haken, hakenWeg } from "@/lib/showcheck/db";

/**
 * Einen Punkt der Show-Checkliste abhaken oder den Haken zurücknehmen.
 *
 * Bewusst eine eigene Route statt einer Server-Aktion mit Weiterleitung:
 * Backstage wird im Halbdunkel schnell getippt, und die Seite soll dabei
 * stehen bleiben, statt neu zu laden (Florian, 03.10.2026, nach dem
 * ersten Testlauf: "wenn man abcheckt wird die ganze seite weiss und man
 * muss neu laden").
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });
  if (!["chef", "team", "showteam"].includes(b.rolle)) {
    return NextResponse.json({ ok: false, fehler: "Die Show-Checkliste ist für das Showteam." }, { status: 403 });
  }

  const d = (await request.json().catch(() => null)) as
    | { abend?: string; datum?: string; punkt?: string; an?: boolean }
    | null;

  const abend = String(d?.abend ?? "").slice(0, 60);
  const punkt = String(d?.punkt ?? "").slice(0, 40);
  const datum = String(d?.datum ?? "").slice(0, 10);
  if (!abend || !/^[0-9a-f-]{36}$/.test(punkt) || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return NextResponse.json({ ok: false, fehler: "Unvollständige Angaben." }, { status: 400 });
  }

  try {
    if (d?.an) await haken({ ditixEventId: abend, datum, punktId: punkt, wer: b.name });
    else await hakenWeg(abend, punkt);
  } catch (f) {
    console.error("[showcheck] Haken nicht gespeichert:", f);
    return NextResponse.json({ ok: false, fehler: "Das hat nicht geklappt." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    erledigtVon: d?.an ? b.name : null,
    erledigtAm: d?.an ? new Date().toISOString() : null,
  });
}
