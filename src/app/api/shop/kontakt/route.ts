import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { webanfrageSpeichern, webanfragenLetzteStunde } from "@/lib/db/whatsapp";
import { nachEingang } from "@/lib/whatsapp/nachlauf";

/**
 * Nimmt Anfragen aus dem Kontaktfenster im Shop entgegen.
 *
 * Der Shop ruft das serverseitig auf, mit demselben gemeinsamen Schlüssel wie
 * bei den übrigen Shop-Routen. Der Browser des Besuchers sieht diese Adresse
 * nie, er spricht nur mit dem Shop.
 *
 * Die Anfrage landet im WhatsApp-Posteingang, markiert als "Webseite", und
 * löst dieselbe Mail an alle mit Freigabe aus. Eine automatische Antwort gibt
 * es nicht: Das Kontaktfenster sagt dem Besucher selbst, dass wir uns melden.
 */

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.SHOP_HINWEIS_SCHLUESSEL;
  const gesendet = request.headers.get("x-shop-schluessel");
  if (!erwartet || !gesendet) return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

const text = (w: unknown, max: number) => (typeof w === "string" ? w.trim().slice(0, max) : "");

export async function POST(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let daten: Record<string, unknown>;
  try {
    daten = await request.json();
  } catch {
    return NextResponse.json({ ok: false, fehler: "kein gültiges JSON" }, { status: 400 });
  }

  const name = text(daten.name, 120);
  const nachricht = text(daten.nachricht, 2000);
  const emailRoh = text(daten.email, 200);
  const email = EMAIL.test(emailRoh) ? emailRoh : null;
  // Telefon: nur Ziffern und ein führendes Plus behalten, sonst nichts.
  const telefonRoh = text(daten.telefon, 40);
  const telefon = telefonRoh.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "") || null;
  const rueckweg = daten.rueckweg === "anruf" ? "anruf" : "mail";
  const seite = text(daten.seite, 200) || null;

  if (!nachricht) {
    return NextResponse.json({ ok: false, fehler: "Die Nachricht fehlt." }, { status: 400 });
  }
  if (!email && !(telefon && telefon.replace(/\D/g, "").length >= 6)) {
    return NextResponse.json({ ok: false, fehler: "Telefon oder E-Mail fehlt." }, { status: 400 });
  }

  try {
    if ((await webanfragenLetzteStunde(email, telefon)) >= 5) {
      // Freundlich zum Menschen, nutzlos für ein Skript: Die Antwort sagt ok,
      // gespeichert wird aber nichts mehr.
      return NextResponse.json({ ok: true, gedrosselt: true });
    }

    const neu = await webanfrageSpeichern({
      name: name || "Ohne Namen",
      nachricht,
      email,
      telefon,
      // Wer "Mail" wählt, aber keine gültige Adresse angibt, wird angerufen.
      rueckweg: rueckweg === "mail" && !email ? "anruf" : rueckweg === "anruf" && !telefon ? "mail" : rueckweg,
      seite,
    });
    after(() => nachEingang([neu]));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Kontaktanfrage nicht gespeichert:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
