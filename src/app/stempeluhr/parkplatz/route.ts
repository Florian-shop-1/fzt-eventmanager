import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { antwortMerken } from "@/lib/shop/parkplatz-wache";
import { melden } from "@/lib/stempel/wache";

/**
 * Die Antwort auf "Die Parkplatzschilder hängen noch nicht".
 *
 * Zwei mögliche Antworten, und beide sind eine Auskunft, die sonst
 * niemand hat: "Mach ich noch" heißt, es passiert gleich. "Geht nicht,
 * weil ..." heißt, der Showtag beginnt ohne Schilder, und Florian und
 * Kevin wissen, woran es lag, bevor es ein Gast merkt.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const daten = (await request.json().catch(() => null)) as
    | { datum?: string; was?: string; text?: string }
    | null;
  const datum = String(daten?.datum ?? "");
  const macht = daten?.was === "mache";
  const text = String(daten?.text ?? "").trim().slice(0, 300);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return NextResponse.json({ ok: false, fehler: "Unbekannter Tag." }, { status: 400 });
  }
  if (!macht && text.length < 3) {
    return NextResponse.json({ ok: false, fehler: "Schreib bitte kurz, woran es lag." }, { status: 400 });
  }

  const antwort = macht ? "macht es noch" : text;
  await antwortMerken({ datum, name: b.name, antwort });

  const tag = datum.split("-").reverse().join(".");
  await melden(
    macht
      ? `Parkplatzschilder ${tag}: ${b.name} macht es noch`
      : `Parkplatzschilder ${tag} bleiben liegen`,
    macht
      ? [`${b.name} hat beim Ausstempeln zugesagt, die Schilder für den ${tag} noch zu bestücken.`]
      : [
          `${b.name} konnte die Schilder für den ${tag} nicht bestücken.`,
          `Grund: ${text}`,
          "Am Showtag stehen die Plätze damit ohne Schild da.",
        ],
  ).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
