import { NextResponse } from "next/server";

import { anschriftNachtragen, zauberstabEintragen, zauberstabPerToken } from "@/lib/shop/zauberstab";

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
  /** Nur die Teilnahme festhalten, die Anschrift kommt später. */
  nurTeilnahme?: boolean;
  /** Schlüssel aus der Erinnerungsmail, um die Anschrift nachzutragen. */
  token?: string;
}

/** Wer über den Link aus der Erinnerungsmail kommt, sieht seinen Namen. */
export async function GET(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const eintrag = await zauberstabPerToken(token);
  if (!eintrag) {
    return NextResponse.json({ ok: false, fehler: "unbekannt" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    vorname: eintrag.vorname,
    nachname: eintrag.nachname,
    strasse: eintrag.strasse,
    plz: eintrag.plz,
    ort: eintrag.ort,
    offen: eintrag.offen,
    versendet: Boolean(eintrag.versendetAm),
  });
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  if (!d) return NextResponse.json({ ok: false, fehler: "Keine Daten" }, { status: 400 });

  const text = (w: unknown) => String(w ?? "").trim();

  /*
    Drei Wege in diese Route:

    1. Anschrift nachtragen über den Link aus der Erinnerungsmail (token).
    2. Nur die Teilnahme festhalten, noch ohne Anschrift (nurTeilnahme).
       Dann steht der Teilnehmer in der Liste und bekommt am Tag darauf
       die Erinnerung, statt vergessen zu werden.
    3. Anschrift gleich nach dem Absenden, wie bisher.
  */
  const token = text(d.token);
  if (token) {
    if (!text(d.strasse) || !text(d.plz) || !text(d.ort)) {
      return NextResponse.json({ ok: false, fehler: "Anschrift unvollständig" }, { status: 400 });
    }
    const eintrag = await anschriftNachtragen(token, {
      vorname: text(d.vorname),
      nachname: text(d.nachname),
      strasse: text(d.strasse),
      plz: text(d.plz),
      ort: text(d.ort),
    });
    if (!eintrag) {
      return NextResponse.json({ ok: false, fehler: "Der Link ist nicht mehr gültig." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id: eintrag.id, email: eintrag.email, token: eintrag.token });
  }

  const nurTeilnahme = d.nurTeilnahme === true;
  if (!nurTeilnahme && (!text(d.strasse) || !text(d.plz) || !text(d.ort))) {
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
