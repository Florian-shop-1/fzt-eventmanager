import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pruefbericht } from "@/lib/db/ditix-eingang";

/**
 * Prüfbericht zu den mitgeschriebenen Ditix-Meldungen.
 *
 * Gedacht zum Gegenprüfen von außen (Julian, 06.10.2026): Kommen alle
 * Verkäufe an, ist es dasselbe wie bei Make, welche Meldungsarten gibt es?
 * Dafür ein eigener, nur lesender Schlüssel (DITIX_PRUEF_SCHLUESSEL), der
 * nicht zum Schreiben taugt und den man jederzeit wechseln kann.
 *
 * Der Bericht enthält nichts Persönliches: keine Namen, Adressen, E-Mails
 * und keinen Betrag zu einer Bestellung, nur Kennungen, Zähler, Produktnamen
 * und den Aufbau der Meldungen (lib/db/ditix-eingang.ts, pruefbericht).
 * Die Meldungen im Wortlaut gibt es nur angemeldet unter /api/ditix/eingang.
 *
 * Der Schlüssel kommt nur als Header (x-pruef-schluessel oder
 * Authorization: Bearer), nie in der Adresse. Ohne gesetzten Schlüssel
 * bleibt die Route zu.
 */

export const dynamic = "force-dynamic";

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.DITIX_PRUEF_SCHLUESSEL;
  if (!erwartet) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const gesendet = request.headers.get("x-pruef-schluessel") ?? bearer;
  if (!gesendet) return false;

  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      { ok: true, bericht: await pruefbericht() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[ditix-pruefung]", e);
    return NextResponse.json({ ok: false, fehler: "Bericht nicht möglich" }, { status: 500 });
  }
}
