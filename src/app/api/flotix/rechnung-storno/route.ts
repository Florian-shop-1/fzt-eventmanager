import { NextResponse } from "next/server";
import { rechnungPerNummer, stornieren } from "@/lib/rechnung/db";

/**
 * FloTix hat eine Bestellung storniert, die auf Rechnung lief (Florian, 21.10.2026): Die Rechnung dazu wird mit
 * storniert, solange sie noch nicht bezahlt ist. Ist sie schon bezahlt, bleibt sie stehen und FloTix sagt es laut:
 * Dann muss das Geld von Hand zurueck.
 *
 * Geschuetzt wie die anderen FloTix-Routen (FLOTIX_KEY, Kopf x-eventmanager-key).
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => ({}))) as { nummer?: string; grund?: string; wer?: string };
  const nummer = String(d.nummer ?? "").trim();
  if (!nummer) return NextResponse.json({ ok: false, fehler: "Rechnungsnummer fehlt" }, { status: 400 });

  const r = await rechnungPerNummer(nummer);
  if (!r) return NextResponse.json({ ok: false, fehler: "Rechnung nicht gefunden" }, { status: 404 });
  if (r.status === "CANCELLED") return NextResponse.json({ ok: true, storniert: true, schonStorniert: true });
  if (r.status === "PAID" || r.bezahltCent > 0) {
    return NextResponse.json({ ok: true, storniert: false, bezahlt: true, bezahltCent: r.bezahltCent });
  }

  await stornieren(r.id, String(d.grund ?? "Bestellung in FloTix storniert").slice(0, 300), String(d.wer ?? "FloTix").slice(0, 80));
  return NextResponse.json({ ok: true, storniert: true });
}
