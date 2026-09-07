import { NextResponse } from "next/server";
import { buchungPerToken } from "@/lib/db/shop-buchungen";

/**
 * Liefert eine Buchung fuer die Upgrade-Seite im Shop.
 *
 * Der Shop ruft das serverseitig auf, wenn ein Gast seinen Link aus der
 * Vorfreude-Mail oeffnet. Geschuetzt ueber denselben gemeinsamen Schluessel wie
 * der Schreibweg. Im Browser des Gastes landet nur, was die Seite anzeigt.
 *
 * Absichtlich sparsam: Wir geben Termin, Zeit, Show und die gebuchten Posten
 * heraus, aber weder E-Mail noch Telefonnummer noch Bestellnummer. Die Seite
 * braucht sie nicht, und was nicht rausgeht, kann auch nicht verloren gehen.
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

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const { token } = await ctx.params;
  const buchung = await buchungPerToken(token);
  if (!buchung) {
    return NextResponse.json({ ok: false, fehler: "unbekannt" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    buchung: {
      ditixEventId: buchung.ditixEventId,
      datum: buchung.datum,
      uhrzeit: buchung.uhrzeit,
      show: buchung.show,
      plaetze: buchung.plaetze,
      bestaetigt: buchung.bestaetigt,
      posten: buchung.posten.map((p) => ({
        ticketTypeId: p.ticketTypeId,
        name: p.name,
        anzahl: p.anzahl,
        gruppe: p.gruppe,
      })),
    },
  });
}
