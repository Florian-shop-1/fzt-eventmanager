import { NextResponse } from "next/server";
import { angebotsAbsender } from "@/lib/angebot/pdfdaten";

/**
 * Die Bankverbindung fuer die Rechnungen von FloTix (Florian, 21.10.2026).
 *
 * Sie steht hier in der Einstellung und nicht im Code von FloTix: Aendert sich das Konto, aendert es sich an einer
 * Stelle. Nur Lesen, und nur mit dem gemeinsamen Schluessel.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  if ((request.headers.get("x-eventmanager-key") ?? "").trim() !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  const a = await angebotsAbsender();
  if (!a.iban) return NextResponse.json({ ok: false, fehler: "keine IBAN hinterlegt" }, { status: 404 });
  return NextResponse.json({ ok: true, kontoinhaber: a.firma, iban: a.iban, bic: a.bic ?? "", bank: a.bank ?? "" });
}
