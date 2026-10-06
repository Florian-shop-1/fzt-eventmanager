import { antwortAufPruefung, nimmAn } from "@/lib/ditix/annahme";

/**
 * Nimmt die Verkaufsmeldungen von Ditix entgegen und schreibt sie mit.
 *
 * Erster Schritt (Julian, 06.10.2026): Ditix meldet jeden Verkauf an Make.
 * Dieselbe Meldung soll zusätzlich hier ankommen, damit wir sehen, wie sie
 * live aussieht und ob sie sich von der bei Make unterscheidet. Ausgewertet
 * wird nichts, die Meldung wird nur abgelegt (lib/db/ditix-eingang.ts).
 * Angesehen wird sie unter /api/ditix/eingang, geprüft unter
 * /api/ditix/pruefung.
 *
 * Geschützt über einen gemeinsamen Schlüssel (DITIX_WEBHOOK_SCHLUESSEL).
 * Ohne gesetzten Schlüssel lehnt die Route grundsätzlich ab, statt
 * versehentlich offen zu stehen. Der Schlüssel darf als Header
 * (x-ditix-schluessel oder Authorization: Bearer) oder, weil Ditix keine
 * Header setzen kann, als ?schluessel= in der Adresse kommen. Dieselbe
 * Annahme gibt es auch mit dem Schlüssel im Pfad: /api/ditix/verkauf/<schluessel>.
 *
 * Gilt für POST und PUT. Antworten:
 *   200  Abgelegt. Auch ein unlesbarer Rumpf wird abgelegt, damit er
 *        sichtbar wird, und gilt als angekommen.
 *   401  Schlüssel fehlt oder stimmt nicht.
 *   413  Die Meldung ist größer als 1 MB.
 *   500  Das Ablegen ging schief. Nur dann soll Ditix es noch einmal
 *        versuchen.
 * GET und HEAD antworten mit 200, ohne etwas abzulegen (siehe annahme.ts).
 */

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return nimmAn(request);
}

// Ditix lässt POST oder PUT einstellen. Beides gilt als Meldung.
export function PUT(request: Request) {
  return nimmAn(request);
}

export function GET(request: Request) {
  return antwortAufPruefung(request);
}
