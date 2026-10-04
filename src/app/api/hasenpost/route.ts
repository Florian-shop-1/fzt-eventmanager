import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { postErledigt, postGezeigt } from "@/lib/personal/hasenpost";

/**
 * Die Quittung zur Hasenpost: gezeigt oder erledigt.
 *
 * Eine eigene Route und keine Server-Aktion, damit der Hase die Seite
 * nicht neu laedt, waehrend jemand gerade arbeitet.
 *
 * Quittieren kann nur, wer angemeldet ist, und nur die eigene Post: Die
 * Abfragen filtern auf die eigene Kennung.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false }, { status: 401 });

  const d = (await request.json().catch(() => null)) as { id?: string; was?: string } | null;
  const id = String(d?.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    if (d?.was === "erledigt") await postErledigt(id, b.id);
    else await postGezeigt(id, b.id);
  } catch (f) {
    console.error("[hasenpost] Quittung nicht gespeichert:", f);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
