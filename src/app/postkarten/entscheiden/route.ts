import { NextResponse } from "next/server";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { standSetzen } from "@/lib/postkarte/db";

/**
 * Nein sagen, ohne ein Formular abzuschicken.
 *
 * Die Durchsicht am Handy wischt nach links, und dabei soll die Seite
 * stehen bleiben und die nächste Karte zeigen (Florian, 30.10.2026).
 * Eine Server-Action würde die Seite neu laden und den Stapel verlieren,
 * deshalb diese kleine Stelle.
 *
 * Nach links heisst zurückhalten, nicht löschen: Die Karte bleibt im
 * Haus und steht weiter unter "Zurückgehalten".
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfKaufmaennisches(benutzer.rolle)) {
    return NextResponse.json({ ok: false, fehler: "Nicht erlaubt." }, { status: 403 });
  }

  const d = (await request.json().catch(() => ({}))) as { id?: string; was?: string };
  const id = String(d.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, fehler: "Keine Karte." }, { status: 400 });
  if (d.was !== "zurueck") {
    return NextResponse.json({ ok: false, fehler: "Unbekannte Entscheidung." }, { status: 400 });
  }

  await standSetzen(id, "zurueck", `Beim Durchsehen zurückgehalten von ${benutzer.name}`);
  return NextResponse.json({ ok: true });
}
