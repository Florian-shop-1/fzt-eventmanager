import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { stoerungMelden } from "@/lib/db/technik-stoerung";
import { stoerungMailen } from "@/lib/stoerung/meldung";

/**
 * Nimmt Störungsmeldungen des Shops entgegen.
 *
 * Der Shop meldet hierher, wenn ein Gast bei ULMFASSBAR, Flo-Zirkus oder
 * Magic Memories die Warteliste zu sehen bekommt, statt Plätze wählen zu
 * können. Siehe migrations/048_technik_stoerung.sql.
 *
 *   { art: "warteliste", showName, eventId, eventZeit, grund, quelle }
 *
 * Gebündelt wird über art und Termin: Beim ersten Mal geht die Warnmail an
 * Florian, Kevin und Julian hinaus, danach wird nur noch mitgezählt.
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

  try {
    const { stoerung, neu } = await stoerungMelden({
      art,
      kennung,
      showName,
      eventId,
      eventZeit,
      grund,
      quelle,
    });
    if (neu) after(() => stoerungMailen(stoerung));
    return NextResponse.json({ ok: true, neu, anzahl: stoerung.anzahl });
  } catch (e) {
    console.error("[stoerung]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
