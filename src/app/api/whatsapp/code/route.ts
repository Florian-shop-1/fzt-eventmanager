import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { codesZiehen } from "@/lib/whatsapp/schlemmerblock";

/**
 * Einen einzelnen Schlemmerblock-Code ziehen, während man schreibt.
 *
 * "wäre es gut, wenn man immer sich direkt einen schlemmerblock code
 * ziehen könnte, jedesmal wenn man klickt, erscheint dieser schon im
 * textfeld von whats app ... mehrmals klicken = mehrere codes in der
 * antwortnachricht" (Florian, 26.10.2026).
 *
 * Der Entwurf kennt den Jahrgang oft noch nicht und fragt dann erst
 * nach. Wer im Postfach sitzt, sieht aber längst, dass der Gast einen
 * Block hat. Dann soll ein Klick reichen.
 *
 * Gezogen wird ein echter Code aus FloTix, kein Platzhalter: Er ist
 * damit vergeben und taucht kein zweites Mal auf, auch wenn die
 * Nachricht nie abgeschickt wird. Lieber ein Code zu viel vergeben als
 * zwei Gästen derselbe.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ fehler: "nicht angemeldet" }, { status: 401 });

  const daten = (await request.json().catch(() => ({}))) as { an?: string };
  const an = String(daten.an ?? "").trim().slice(0, 40) || "WhatsApp";

  try {
    const e = await codesZiehen(1, an);
    const code = e.codes[0];
    if (!code) return NextResponse.json({ fehler: "Es kam kein Code zurück." }, { status: 502 });
    return NextResponse.json({ code, rest: e.rest });
  } catch (f) {
    return NextResponse.json(
      { fehler: f instanceof Error ? f.message : "Der Code ließ sich nicht ziehen." },
      { status: 502 },
    );
  }
}
