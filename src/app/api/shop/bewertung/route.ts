import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { kritikSpeichern, sterneSpeichern, buchungZurBewertung } from "@/lib/db/bewertung";
import { nachKritik, nachSternen } from "@/lib/bewertung/meldung";
import { vorname } from "@/lib/mail/vorfreude";

/**
 * Nimmt Sterne und Kritik von der Bewertungsseite im Shop entgegen.
 *
 * Die Seite /bewertung/<token> im Shop ruft das serverseitig auf, mit dem
 * gemeinsamen Schlüssel der übrigen Shop-Routen. Der Token aus der Mail ist
 * der Nachweis, welche Buchung bewertet.
 *
 *   { token, sterne }   speichert die Sterne
 *   { token, kritik }   speichert die Kritik bei bis zu drei Sternen
 *   { token }           liefert nur Vorname und bisherige Sterne
 */

export const dynamic = "force-dynamic";
// Die Meldung wartet im Hintergrund 20 Sekunden auf Mail-Scanner, siehe meldung.ts.
export const maxDuration = 60;

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.SHOP_HINWEIS_SCHLUESSEL;
  const gesendet = request.headers.get("x-shop-schluessel");
  if (!erwartet || !gesendet) return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) return NextResponse.json({ ok: false }, { status: 401 });

  let daten: Record<string, unknown>;
  try {
    daten = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const token = typeof daten.token === "string" ? daten.token : "";
  if (!/^[0-9a-f]{32}$/.test(token)) return NextResponse.json({ ok: false, fehler: "unbekannt" }, { status: 404 });

  try {
    if (typeof daten.sterne === "number") {
      const sterne = Math.round(daten.sterne);
      if (sterne < 1 || sterne > 5) return NextResponse.json({ ok: false }, { status: 400 });
      const b = await sterneSpeichern(token, sterne);
      if (!b) return NextResponse.json({ ok: false, fehler: "unbekannt" }, { status: 404 });
      after(() => nachSternen(token, sterne));
      return NextResponse.json({ ok: true, vorname: vorname(b.name), sterne });
    }

    if (typeof daten.kritik === "string") {
      const kritik = daten.kritik.trim().slice(0, 4000);
      if (!kritik) return NextResponse.json({ ok: false }, { status: 400 });
      const b = await kritikSpeichern(token, kritik);
      if (!b) return NextResponse.json({ ok: false, fehler: "unbekannt" }, { status: 404 });
      after(() => nachKritik(token));
      return NextResponse.json({ ok: true, vorname: vorname(b.name) });
    }

    const b = await buchungZurBewertung(token);
    if (!b) return NextResponse.json({ ok: false, fehler: "unbekannt" }, { status: 404 });
    return NextResponse.json({ ok: true, vorname: vorname(b.name), sterne: b.sterne });
  } catch (e) {
    console.error("[bewertung]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
