import { NextResponse } from "next/server";
import { speichereShopHinweis } from "@/lib/db/shop-hinweise";

/**
 * Nimmt Unverträglichkeiten und Hinweise aus dem öffentlichen Ticketshop
 * entgegen. Erste Schnittstelle dieser Art: Bisher las der Eventmanager nur
 * aus dem Shop (Spielplan, Auslastung, Preise, Saalplan), jetzt schickt der
 * Shop auch etwas hierher.
 *
 * Geschützt über einen gemeinsamen Schlüssel im Kopf "x-shop-schluessel".
 * Bewusst KEINE Benutzeranmeldung: Hier meldet sich kein Mensch an, sondern
 * ein Server. Ist der Schlüssel nicht gesetzt, lehnt die Route grundsätzlich
 * ab, statt versehentlich offen zu stehen.
 */

export const dynamic = "force-dynamic";

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.SHOP_HINWEIS_SCHLUESSEL;
  if (!erwartet) return false;
  const gesendet = request.headers.get("x-shop-schluessel");
  if (!gesendet || gesendet.length !== erwartet.length) return false;
  // Zeichenweise vergleichen, ohne bei der ersten Abweichung abzubrechen.
  let unterschied = 0;
  for (let i = 0; i < erwartet.length; i++) {
    unterschied |= erwartet.charCodeAt(i) ^ gesendet.charCodeAt(i);
  }
  return unterschied === 0;
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  let daten: Record<string, unknown>;
  try {
    daten = await request.json();
  } catch {
    return NextResponse.json({ ok: false, fehler: "kein gültiges JSON" }, { status: 400 });
  }

  const text = (wert: unknown) => (typeof wert === "string" ? wert.trim() : "");
  const ditixEventId = text(daten.ditixEventId);
  const datum = text(daten.datum);
  const hinweis = text(daten.hinweis);

  if (!ditixEventId || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || !hinweis) {
    return NextResponse.json(
      { ok: false, fehler: "ditixEventId, datum (JJJJ-MM-TT) und hinweis sind Pflicht" },
      { status: 400 },
    );
  }

  try {
    await speichereShopHinweis({
      ditixEventId,
      datum,
      uhrzeit: text(daten.uhrzeit) || null,
      show: text(daten.show),
      email: text(daten.email),
      telefon: text(daten.telefon),
      // Begrenzt, damit ein sehr langer Freitext das Funktionsheet nicht sprengt.
      hinweis: hinweis.slice(0, 1000),
      plaetze: typeof daten.plaetze === "number" ? daten.plaetze : null,
      cartId: text(daten.cartId) || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[shop-hinweis]", e);
    return NextResponse.json({ ok: false, fehler: "konnte nicht gespeichert werden" }, { status: 500 });
  }
}
