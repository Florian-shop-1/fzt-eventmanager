import { NextResponse } from "next/server";
import { buchungPerToken } from "@/lib/db/shop-buchungen";
import { widerspruchEintragen } from "@/lib/db/werbewiderspruch";

/**
 * Der Abmeldeweg aus der Vorfreude-Mail.
 *
 * Der Gast klickt im Shop auf shop.florianzimmertheater.de/abmelden/<token>,
 * und der Shop meldet es serverseitig hierher. Der gemeinsame Schlüssel ist
 * derselbe wie bei den übrigen Shop-Routen.
 *
 * Warum überhaupt über den Shop und nicht direkt hierher: Was in einer Mail an
 * Gäste steht, soll nach dem Shop aussehen, nicht nach einem internen Programm.
 * Und der Eventmanager verlangt eine Anmeldung; eine Ausnahme dafür wäre eine
 * offene Tür mehr, als nötig ist.
 *
 * Der Token identifiziert die Buchung, abgemeldet wird aber die ADRESSE. Wer
 * widerspricht, meint sich und nicht diesen einen Abend.
 *
 * Antwortet auch dann mit 200, wenn der Token unbekannt ist. Ein Abmeldelink,
 * der eine Fehlerseite zeigt, ist aus Sicht des Gastes eine Abmeldung, die
 * nicht funktioniert hat -- und das ist genau der Ärger, den wir vermeiden
 * wollen. Ob wirklich etwas eingetragen wurde, steht im Feld "eingetragen".
 */

export const dynamic = "force-dynamic";

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

  let token = "";
  try {
    const koerper = (await request.json()) as { token?: string };
    token = String(koerper.token ?? "");
  } catch {
    return NextResponse.json({ ok: false, fehler: "kein Token" }, { status: 400 });
  }

  const buchung = await buchungPerToken(token);
  if (!buchung || !buchung.email) {
    return NextResponse.json({ ok: true, eingetragen: false });
  }

  try {
    await widerspruchEintragen(buchung.email, "link");
  } catch (e) {
    console.warn("[abmelden] Widerspruch konnte nicht gespeichert werden:", e);
    return NextResponse.json({ ok: false, eingetragen: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eingetragen: true });
}
