import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { blockName, codesZiehen, jahrgangGueltig } from "@/lib/whatsapp/schlemmerblock";

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
 *
 * Kennt die Unterhaltung den Jahrgang des Blocks, geht er mit: FloTix
 * trägt dann das Ablaufdatum des Blocks am Code ein, und ein
 * abgelaufener Block bekommt hier gar keinen Code.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ fehler: "nicht angemeldet" }, { status: 401 });

  const daten = (await request.json().catch(() => ({}))) as {
    an?: string;
    name?: string;
    jahrgang?: number | string | null;
  };
  const an = String(daten.an ?? "").trim().slice(0, 40) || "WhatsApp";
  const name = String(daten.name ?? "").trim().slice(0, 60);
  const jahrgang = Math.round(Number(daten.jahrgang ?? 0)) || null;

  /*
    Auf einen abgelaufenen Block gibt es auch per Knopfdruck keinen
    Code. Die Kulanz bei abgelaufenen Gutscheinen gilt für unsere
    eigenen, nicht für das Buch eines Partners.
  */
  if (jahrgang && !jahrgangGueltig(jahrgang)) {
    return NextResponse.json(
      {
        fehler:
          `Der Block ${blockName(jahrgang)} galt nur bis zum 1. Dezember ${jahrgang}. ` +
          "Dafür gibt es keinen Code mehr.",
      },
      { status: 409 },
    );
  }

  try {
    const e = await codesZiehen(1, an, { name, jahrgang });
    const code = e.codes[0];
    if (!code) return NextResponse.json({ fehler: "Es kam kein Code zurück." }, { status: 502 });
    return NextResponse.json({ code, rest: e.rest, gueltigBis: e.gueltigBis });
  } catch (f) {
    return NextResponse.json(
      { fehler: f instanceof Error ? f.message : "Der Code ließ sich nicht ziehen." },
      { status: 502 },
    );
  }
}
