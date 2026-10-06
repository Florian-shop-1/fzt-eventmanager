import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { kopfzeilen, legeMeldungAb, unlesbar } from "@/lib/db/ditix-eingang";

/**
 * Nimmt die Verkaufsmeldungen von Ditix entgegen und schreibt sie mit.
 *
 * Erster Schritt (Julian, 06.10.2026): Ditix meldet jeden Verkauf an Make.
 * Dieselbe Meldung soll zusätzlich hier ankommen, damit wir sehen, wie sie
 * live aussieht und ob sie sich von der bei Make unterscheidet. Ausgewertet
 * wird nichts, die Meldung wird nur abgelegt (lib/db/ditix-eingang.ts).
 * Angesehen wird sie unter /api/ditix/eingang.
 *
 * Geschützt über einen gemeinsamen Schlüssel (DITIX_WEBHOOK_SCHLUESSEL).
 * Ohne gesetzten Schlüssel lehnt die Route grundsätzlich ab, statt
 * versehentlich offen zu stehen. Der Schlüssel darf als Header
 * (x-ditix-schluessel oder Authorization: Bearer) oder, falls Ditix keine
 * Header setzen kann, als ?schluessel= in der Adresse kommen.
 *
 * Antworten:
 *   200  Abgelegt. Auch ein unlesbarer Rumpf wird abgelegt, damit er
 *        sichtbar wird, und gilt als angekommen.
 *   401  Schlüssel fehlt oder stimmt nicht.
 *   413  Die Meldung ist größer als 1 MB.
 *   500  Das Ablegen ging schief. Nur dann soll Ditix es noch einmal
 *        versuchen.
 */

export const dynamic = "force-dynamic";

/**
 * Obergrenze für eine Meldung. Eine große Gruppenbestellung bleibt weit
 * darunter, aber wer den Schlüssel hat (oder ihn einmal hatte), soll die
 * Datenbank nicht mit Megabytes pro Aufruf füllen können.
 */
const MAX_BYTES = 1024 * 1024;

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.DITIX_WEBHOOK_SCHLUESSEL;
  if (!erwartet) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const gesendet =
    request.headers.get("x-ditix-schluessel") ??
    bearer ??
    new URL(request.url).searchParams.get("schluessel");
  if (!gesendet) return false;

  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const angekuendigt = Number(request.headers.get("content-length"));
  if (Number.isFinite(angekuendigt) && angekuendigt > MAX_BYTES) {
    return NextResponse.json({ ok: false, fehler: "zu groß" }, { status: 413 });
  }

  // Erst als Text lesen: Ist es kein JSON, wollen wir trotzdem sehen, was kam.
  const rumpf = await request.text();
  if (rumpf.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, fehler: "zu groß" }, { status: 413 });
  }
  let roh: unknown;
  try {
    roh = JSON.parse(rumpf);
  } catch {
    roh = unlesbar(rumpf);
  }

  try {
    const a = await legeMeldungAb(roh, kopfzeilen(request.headers));
    return NextResponse.json({ ok: true, wiederholt: a.wiederholt });
  } catch (e) {
    console.error("[ditix-eingang]", e);
    return NextResponse.json({ ok: false, fehler: "konnte nicht abgelegt werden" }, { status: 500 });
  }
}
