import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { buchungPerToken } from "@/lib/abbrecher/db";
import { GESCHENK_ERKLAERUNG, GESCHENK_TEXT, geschenkZurBuchung } from "@/lib/abbrecher/geschenk";

/**
 * Sagt dem Shop, ob diesem Gast ein Geschenk zusteht.
 *
 * Wer aus der Angebotsmail zurück in den Shop klickt, trägt seinen
 * Schlüssel im Link mit (…/?event=…&g=<token>). Der Shop fragt damit
 * hier nach und schreibt "Für euch kostenlos" an die passende Kachel
 * unter "Magie für Zuhause" (Florian, 23.09.2026).
 *
 * Bewusst über den Schlüssel und nicht über einen Parameter wie
 * "&geschenk=glas": Sonst hängt sich jeder den Parameter selbst an, sieht
 * im Shop ein Geschenk versprochen und steht am Einlass vor einer Liste,
 * in der er nicht steht. Der Ärger fiele dem Foyer zu.
 *
 * Antwort, wenn etwas zusteht:
 *   { geschenk: { art, text, erklaerung, anzahl, giltBis } }
 * sonst { geschenk: null }. Nie Name, Adresse oder Betrag: Der Shop
 * braucht davon nichts.
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

export async function GET(request: Request) {
  if (!istErlaubt(request)) return NextResponse.json({ ok: false }, { status: 401 });

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (token.length < 16) return NextResponse.json({ geschenk: null });

  const buchung = await buchungPerToken(token).catch(() => null);
  if (!buchung) return NextResponse.json({ geschenk: null });

  const g = await geschenkZurBuchung(buchung.id).catch(() => null);
  // Schon im Foyer ausgegeben oder abgelaufen: dann gibt es nichts mehr
  // anzuzeigen, sonst verspricht der Shop etwas zum zweiten Mal.
  if (!g || g.eingeloestAm) return NextResponse.json({ geschenk: null });
  if (g.giltBis && Date.parse(g.giltBis) < Date.now()) return NextResponse.json({ geschenk: null });

  return NextResponse.json({
    geschenk: {
      art: g.art,
      text: GESCHENK_TEXT[g.art],
      erklaerung: GESCHENK_ERKLAERUNG[g.art],
      anzahl: g.anzahl,
      giltBis: g.giltBis,
    },
  });
}
