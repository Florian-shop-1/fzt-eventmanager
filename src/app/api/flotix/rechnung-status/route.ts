import { NextResponse } from "next/server";
import { rechnungPerNummer } from "@/lib/rechnung/db";

/**
 * Wie stehen die Rechnungen von FloTix? (Florian, 21.10.2026)
 *
 * FloTix stellt die Rechnungen selbst aus und zeigt sie in seiner Uebersicht. Ob das Geld da ist, weiss nur der
 * Eventmanager, denn nur er liest das Konto. Diese Route gibt zu einer Liste von Rechnungsnummern den Stand zurueck:
 * offen, ueberfaellig oder bezahlt, mit Datum und Betrag. Sie liest nur.
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

  const d = (await request.json().catch(() => ({}))) as { nummern?: string[] };
  const nummern = (Array.isArray(d.nummern) ? d.nummern : []).map((n) => String(n).trim()).filter(Boolean).slice(0, 300);

  const liste = [];
  for (const nummer of nummern) {
    const r = await rechnungPerNummer(nummer).catch(() => null);
    if (!r) {
      liste.push({ nummer, gefunden: false });
      continue;
    }
    liste.push({
      nummer,
      gefunden: true,
      status: r.status,
      betragCent: r.betragCent,
      bezahltCent: r.bezahltCent,
      offenCent: r.offenCent,
      faelligAm: r.faelligAm,
      tageUeberfaellig: r.tageUeberfaellig,
      bezahltAm: r.bezahltAm,
      erinnerungen: r.erinnerungen,
      erinnertAm: r.erinnertAm,
    });
  }
  return NextResponse.json({ ok: true, rechnungen: liste });
}
