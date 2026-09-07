import { NextResponse } from "next/server";
import { speichereBuchung, type BuchungsPosten, type PostenGruppe } from "@/lib/db/shop-buchungen";

/**
 * Nimmt Buchungen aus dem oeffentlichen Ticketshop entgegen.
 *
 * Der Shop meldet JEDE Uebergabe zur Kasse, nicht nur abgeschlossene Kaeufe.
 * Ob wirklich bezahlt wurde, klaert der Eventmanager spaeter selbst ueber
 * checkout/status. Erst dann zaehlt eine Zeile als Buchung.
 *
 * Geschuetzt ueber denselben gemeinsamen Schluessel wie /api/shop/hinweis.
 * Ohne gesetzten Schluessel lehnt die Route grundsaetzlich ab, statt
 * versehentlich offen zu stehen.
 */

export const dynamic = "force-dynamic";

const ERLAUBTE_GRUPPEN: PostenGruppe[] = ["sitzplatz", "menue", "vip", "bundle", ""];

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.SHOP_HINWEIS_SCHLUESSEL;
  if (!erwartet) return false;
  const gesendet = request.headers.get("x-shop-schluessel");
  if (!gesendet || gesendet.length !== erwartet.length) return false;
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
  const zahl = (wert: unknown) => (typeof wert === "number" && Number.isFinite(wert) ? wert : null);

  const ditixEventId = text(daten.ditixEventId);
  const datum = text(daten.datum);
  if (!ditixEventId || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return NextResponse.json(
      { ok: false, fehler: "ditixEventId und datum (JJJJ-MM-TT) sind Pflicht" },
      { status: 400 },
    );
  }

  // Posten begrenzen und pruefen: Ein fremder Aufruf soll die Tabelle nicht
  // mit beliebig vielen Zeilen fluten koennen.
  const roh = Array.isArray(daten.posten) ? daten.posten.slice(0, 60) : [];
  const posten: BuchungsPosten[] = roh.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const gruppe = text(o.gruppe) as PostenGruppe;
    return {
      ticketTypeId: text(o.ticketTypeId).slice(0, 100),
      name: text(o.name).slice(0, 200),
      anzahl: Math.max(0, Math.min(999, Math.round(Number(o.anzahl) || 0))),
      preisCent: zahl(o.preisCent),
      gruppe: ERLAUBTE_GRUPPEN.includes(gruppe) ? gruppe : "",
    };
  });

  try {
    await speichereBuchung({
      cartId: text(daten.cartId) || null,
      ditixEventId,
      datum,
      uhrzeit: text(daten.uhrzeit) || null,
      show: text(daten.show).slice(0, 200),
      email: text(daten.email).slice(0, 200),
      telefon: text(daten.telefon).slice(0, 60),
      plaetze: zahl(daten.plaetze),
      gesamtCent: zahl(daten.gesamtCent),
      hinweis: text(daten.hinweis).slice(0, 1000),
      posten,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[shop-buchung]", e);
    return NextResponse.json({ ok: false, fehler: "konnte nicht gespeichert werden" }, { status: 500 });
  }
}
