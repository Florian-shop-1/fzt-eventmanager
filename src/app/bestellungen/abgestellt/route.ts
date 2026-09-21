import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { uebergeben, zugang } from "@/lib/wein/db";

/**
 * Der grüne Knopf aus dem Pop-up: Die Bestellung steht bei den Kühlhäusern.
 * Eigene Adresse statt Server-Aktion, damit das Pop-up auf jeder Seite des
 * Programms funktioniert, ohne dass die Seite neu geladen werden muss.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  const z = await zugang(b);
  if (!b || !z.uebergeben) return NextResponse.json({ ok: false }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const ok = await uebergeben(id, b.name);
  return NextResponse.json({ ok });
}
