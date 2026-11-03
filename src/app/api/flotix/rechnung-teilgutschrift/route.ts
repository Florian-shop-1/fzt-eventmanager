import { NextResponse } from "next/server";
import { teilgutschriftBuchen } from "@/lib/rechnung/teilgutschrift";

/**
 * FloTix hat einzelne Positionen einer Bestellung auf Rechnung storniert und dazu eine Stornorechnung ausgestellt
 * (Florian, 03.11.2026). Der Rechnungsbetrag sinkt um die Gutschrift, die Rechnung selbst bleibt bestehen. Gegenstueck zu
 * rechnung-storno, das die ganze Rechnung storniert.
 *
 * Geschuetzt wie die anderen FloTix-Routen (FLOTIX_KEY, Kopf x-eventmanager-key).
 * Antwort 200: { ok, schonVerbucht, betragCent, bezahltCent, offenCent, ueberzahlungCent, status }.
 * Fehler: 400 Angaben fehlen, 401, 404 Rechnung unbekannt, 409 storniert oder Gutschrift zu hoch, 503 nicht eingerichtet.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => ({}))) as {
    nummer?: string;
    gutschriftNummer?: string;
    betragCent?: number;
    grund?: string;
    wer?: string;
  };
  const nummer = String(d.nummer ?? "").trim();
  const gutschriftNummer = String(d.gutschriftNummer ?? "").trim();
  const betragCent = Math.round(Number(d.betragCent));
  if (!nummer) return NextResponse.json({ ok: false, fehler: "Rechnungsnummer fehlt" }, { status: 400 });
  if (!gutschriftNummer) return NextResponse.json({ ok: false, fehler: "Nummer der Stornorechnung fehlt" }, { status: 400 });
  if (!Number.isFinite(betragCent) || betragCent <= 0) return NextResponse.json({ ok: false, fehler: "Betrag fehlt" }, { status: 400 });

  const e = await teilgutschriftBuchen({
    rechnungsnummer: nummer,
    gutschriftNummer: gutschriftNummer.slice(0, 40),
    betragCent,
    grund: String(d.grund ?? "Teilstorno in FloTix").slice(0, 300),
    wer: String(d.wer ?? "FloTix").slice(0, 80),
  });
  if (!e.ok) return NextResponse.json({ ok: false, fehler: e.fehler }, { status: e.status });

  const r = e.rechnung;
  return NextResponse.json({
    ok: true,
    schonVerbucht: e.schonVerbucht,
    betragCent: r.betragCent,
    bezahltCent: r.bezahltCent,
    offenCent: r.offenCent,
    ueberzahlungCent: r.ueberzahlungCent,
    status: r.status,
  });
}
