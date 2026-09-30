import { NextResponse } from "next/server";

import { zauberstabEintragen } from "@/lib/shop/zauberstab";

/**
 * Der Shop meldet eine Anschrift für einen Zauberstab.
 *
 * Wer beim Gewinnspiel mitmacht, bekommt keinen Rabattcode mehr, sondern
 * einen erscheinenden Zauberstab mit der Post. Dafür lässt er seine
 * Anschrift da, und die landet hier (Florian, 30.09.2026).
 *
 * Geschützt mit demselben Schlüssel wie die anderen Meldungen aus dem
 * Shop (SHOP_HINWEIS_SCHLUESSEL), nicht mit dem Anmeldecookie: Der Shop
 * hat keinen Benutzer.
 */

export const dynamic = "force-dynamic";

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.SHOP_HINWEIS_SCHLUESSEL;
  if (!erwartet) return false;
  const gesendet = request.headers.get("x-shop-schluessel");
  if (!gesendet || gesendet.length !== erwartet.length) return false;
  // Zeichen für Zeichen ohne vorzeitigen Abbruch, damit die Laufzeit
  // nichts über den Schlüssel verrät.
  let unterschied = 0;
  for (let i = 0; i < erwartet.length; i++) {
    unterschied |= erwartet.charCodeAt(i) ^ gesendet.charCodeAt(i);
  }
  return unterschied === 0;
}

interface Anfrage {
  vorname?: string;
  nachname?: string;
  email?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  quelle?: string;
  notiz?: string;
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  if (!d) return NextResponse.json({ ok: false, fehler: "Keine Daten" }, { status: 400 });

  const text = (w: unknown) => String(w ?? "").trim();
  if (!text(d.strasse) || !text(d.plz) || !text(d.ort)) {
    return NextResponse.json({ ok: false, fehler: "Anschrift unvollständig" }, { status: 400 });
  }

  try {
    const e = await zauberstabEintragen({
      vorname: text(d.vorname),
      nachname: text(d.nachname),
      email: text(d.email),
      strasse: text(d.strasse),
      plz: text(d.plz),
      ort: text(d.ort),
      land: text(d.land) || "Deutschland",
      quelle: text(d.quelle) || "gewinnspiel",
      notiz: text(d.notiz),
    });
    return NextResponse.json({ ok: true, ...e });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[zauberstab] Eintragen fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
