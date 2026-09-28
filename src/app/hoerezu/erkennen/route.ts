import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { hoerzuEingerichtet, stichwortErkennen } from "@/lib/hoerezu/erkennen";
import { KATEGORIEN, type Kategorie } from "@/lib/hoerezu/kategorien";

/**
 * Ein Häppchen frisch transkribierten Texts wird ausgewertet, siehe
 * components/HoereZu.tsx: Dort wird erst nach einer kurzen Sprechpause
 * geschickt, nicht bei jedem Zwischenwort.
 */

export const dynamic = "force-dynamic";

interface Anfrage {
  text?: string;
  offen?: string[];
}

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  if (!hoerzuEingerichtet()) {
    return NextResponse.json({ ok: false, fehler: "Stichwort-Erkennung ist serverseitig nicht eingerichtet." }, { status: 503 });
  }

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  const text = (d?.text ?? "").slice(0, 2000);
  const offen = (d?.offen ?? []).filter((k): k is Kategorie => (KATEGORIEN as readonly string[]).includes(k));

  if (!text.trim() || offen.length === 0) {
    return NextResponse.json({ ok: true, ergebnis: null });
  }

  try {
    const ergebnis = await stichwortErkennen(text, offen);
    return NextResponse.json({ ok: true, ergebnis });
  } catch (e) {
    return NextResponse.json(
      { ok: false, fehler: e instanceof Error ? e.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }
}
