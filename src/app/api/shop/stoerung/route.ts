import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { stoerungBehoben, stoerungMelden } from "@/lib/db/technik-stoerung";
import { stoerungMailen } from "@/lib/stoerung/meldung";

/**
 * Nimmt Störungsmeldungen des Shops entgegen.
 *
 * Der Shop meldet hierher, wenn ein Gast bei ULMFASSBAR, Flo-Zirkus oder
 * Magic Memories die Warteliste zu sehen bekommt, statt Plätze wählen zu
 * können. Siehe migrations/048_technik_stoerung.sql.
 *
 *   { art: "warteliste", showName, eventId, eventZeit, grund, quelle,
 *     gesehen?: true, behoben?: "selbst" | "klick" }
 *
 * Gebündelt wird über art und Termin. Entscheidend ist "gesehen": Nur wenn
 * ein Gast den Warteliste-Bildschirm wirklich vor sich hatte und der Shop
 * ihn auch beim stillen zweiten Anlauf nicht wegbekommen hat, geht eine
 * Mail hinaus, und auch dann nur beim ersten Mal je Termin. Alles andere
 * wird nur gezählt (Florian, 23.09.2026).
 *
 * "behoben" ist die Entwarnung: Der Saalplan ist danach doch erschienen,
 * von selbst oder nachdem der Gast neu geladen hat.
 */

export const dynamic = "force-dynamic";

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.SHOP_HINWEIS_SCHLUESSEL;
  const gesendet = request.headers.get("x-shop-schluessel");
  if (!erwartet || !gesendet) return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

function kurz(wert: unknown, laenge = 200): string | null {
  return typeof wert === "string" && wert.trim() ? wert.trim().slice(0, laenge) : null;
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) return NextResponse.json({ ok: false }, { status: 401 });

  let daten: Record<string, unknown>;
  try {
    daten = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const art = kurz(daten.art, 40) ?? "warteliste";
  const showName = kurz(daten.showName, 120);
  const eventId = kurz(daten.eventId, 60);
  const eventZeit = kurz(daten.eventZeit, 80);
  const grund = kurz(daten.grund, 200);
  const quelle = kurz(daten.quelle, 120) ?? "shop";

  // Ohne Termin liesse sich nichts bündeln und nichts prüfen.
  if (!eventId && !eventZeit) return NextResponse.json({ ok: false }, { status: 400 });

  const kennung = `${art}:${eventId ?? eventZeit}`;
  const gesehen = daten.gesehen === true;
  const behoben = kurz(daten.behoben, 20);

  try {
    // Entwarnung: Es geht wieder, es wird nur vermerkt.
    if (behoben) {
      await stoerungBehoben(kennung, behoben === "klick" ? "Gast hat neu geladen" : "von selbst");
      return NextResponse.json({ ok: true, behoben: true });
    }

    const { stoerung, neu, erstmalsGesehen } = await stoerungMelden({
      art,
      kennung,
      showName,
      eventId,
      eventZeit,
      grund,
      quelle,
      gesehen,
    });
    if (erstmalsGesehen) after(() => stoerungMailen(stoerung));
    return NextResponse.json({ ok: true, neu, anzahl: stoerung.anzahl, gesehen: stoerung.gesehenAnzahl });
  } catch (e) {
    console.error("[stoerung]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
