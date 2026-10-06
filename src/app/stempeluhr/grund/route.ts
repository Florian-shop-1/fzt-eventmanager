import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { grundNachtragen } from "@/lib/stempel/dienst";
import { ausserDienstMelden } from "@/lib/stempel/wache";

/**
 * Warum jemand außerhalb seines Dienstes gestempelt hat.
 *
 * Der Grund gehört an den Stempel, nicht in eine eigene Liste: Im Büro
 * steht er dann neben der Zeit, um die es geht.
 *
 * Die Antwort ist freiwillig in dem Sinn, dass der Stempel schon gesetzt
 * ist. Wer das Fenster wegklickt, hat trotzdem gestempelt, und das Büro
 * weiß auch ohne Antwort Bescheid.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const daten = (await request.json().catch(() => null)) as { id?: string; text?: string } | null;
  const id = String(daten?.id ?? "");
  const text = String(daten?.text ?? "").trim().slice(0, 500);

  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ ok: false, fehler: "Unbekannter Stempel." }, { status: 400 });
  }
  if (text.length < 3) {
    return NextResponse.json({ ok: false, fehler: "Schreib bitte kurz, worum es geht." }, { status: 400 });
  }

  const geklappt = await grundNachtragen({ stempelId: id, benutzerId: b.id, text });
  if (!geklappt) {
    return NextResponse.json({ ok: false, fehler: "Dieser Stempel passt nicht mehr dazu." }, { status: 409 });
  }

  const tag = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  await ausserDienstMelden({ name: b.name, tag, grund: text }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
