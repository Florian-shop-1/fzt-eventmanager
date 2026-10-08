import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { abschlussMerken } from "@/lib/stempel/abschluss";
import { melden } from "@/lib/stempel/wache";

/**
 * Die Antwort auf "Ist alles aus?"
 *
 * Zwei mögliche Antworten, und die zweite ist die wichtige: Wenn etwas
 * noch läuft, soll es montags nicht erst auffallen, wenn jemand die
 * Tür aufmacht.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const daten = (await request.json().catch(() => null)) as
    | { datum?: string; allesAus?: boolean; text?: string }
    | null;
  const datum = String(daten?.datum ?? "");
  const allesAus = daten?.allesAus === true;
  const offen = String(daten?.text ?? "").trim().slice(0, 300);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return NextResponse.json({ ok: false, fehler: "Unbekannter Tag." }, { status: 400 });
  }
  if (!allesAus && offen.length < 3) {
    return NextResponse.json({ ok: false, fehler: "Schreib bitte kurz, was noch läuft." }, { status: 400 });
  }

  await abschlussMerken({ datum, benutzerId: b.id, name: b.name, allesAus, offen });

  const tag = datum.split("-").reverse().join(".");
  if (allesAus) {
    /*
      Die gute Nachricht geht auch raus, aber kurz.

      Sie ist die Bestaetigung, dass jemand nachgesehen hat, und genau
      das will das Buero am Montag wissen.
    */
    await melden(`Foyer ${tag}: alles aus`, [
      `${b.name} hat beim Ausstempeln bestätigt: Kühltheken, Musik und Licht sind aus.`,
    ]).catch(() => undefined);
  } else {
    await melden(`Foyer ${tag}: es läuft noch etwas`, [
      `${b.name} hat beim Ausstempeln gemeldet, dass noch nicht alles aus ist.`,
      `Was noch läuft: ${offen}`,
      "Bis zur nächsten Show steht das Haus still, das läuft also tagelang mit.",
    ]).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
