import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { grundMerken } from "@/lib/foyer/pause";
import { melden } from "@/lib/stempel/wache";

/**
 * "Warum bleibst du nach der Pause noch da?"
 *
 * Die Antwort ist kein Formfehler, sondern die Grundlage für die
 * Bezahlung: Die Zeit nach der Pause steht in keinem Dienstplan und ist
 * nicht budgetiert. Sie wird vergütet, wenn ein Grund dasteht und das
 * Büro ihn nachträglich genehmigt (Florian, 11.10.2026).
 *
 * Deshalb geht sie sofort an Florian und Kevin, mit Namen und Uhrzeit.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const daten = (await request.json().catch(() => null)) as { text?: string } | null;
  const grund = String(daten?.text ?? "").trim().slice(0, 400);
  if (grund.length < 3) {
    return NextResponse.json({ ok: false, fehler: "Schreib bitte kurz, warum du noch bleibst." }, { status: 400 });
  }

  await grundMerken({ benutzerId: b.id, name: b.name, grund });

  const uhr = new Date().toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  });
  await melden(`${b.name} bleibt nach der Pause im Foyer`, [
    `${b.name} ist um ${uhr} Uhr noch eingestempelt, obwohl nach der Pause nur eine Kraft bleibt.`,
    `Grund: ${grund}`,
    "",
    "Diese Zeit ist nicht budgetiert. Sie wird bezahlt, wenn ihr den Grund gelten lasst.",
  ]).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
