import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { mailVerschicken } from "@/lib/mail/versand";

/**
 * Mailversand für FloTix.
 *
 * Das eigene Ticketing hat keinen eigenen Mailweg, und es soll auch
 * keinen bekommen: Absender, Domain-Einrichtung, Zustellbarkeit und der
 * Umgang mit Brevo sind hier seit Monaten eingefahren. FloTix ruft
 * deshalb diese Adresse an, und der Eventmanager verschickt
 * (Florian, 24.09.2026).
 *
 * Geschützt mit einem eigenen Schlüssel (FLOTIX_MAIL_SCHLUESSEL). Ohne
 * ihn geht nichts hinaus, sonst wäre das ein offener Mailversender.
 */

export const dynamic = "force-dynamic";

function istErlaubt(request: Request): boolean {
  /*
    Ein eigener Schlüssel, nicht der allgemeine Shop-Schlüssel.

    Der ist an vielen Stellen im Einsatz (Störungen, Bewertungen,
    Abmeldungen). Wer den Mailversand öffnen darf, soll nicht
    automatisch alles andere dürfen, und ein Wechsel hier soll nichts
    anderes umwerfen (24.09.2026).
  */
  const erwartet = process.env.FLOTIX_MAIL_SCHLUESSEL;
  const gesendet = request.headers.get("x-shop-schluessel");
  if (!erwartet || !gesendet) return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) return NextResponse.json({ ok: false }, { status: 401 });

  const d = (await request.json().catch(() => null)) as {
    an?: string | string[];
    betreff?: string;
    text?: string;
    html?: string;
    antwortAn?: string;
  } | null;

  const empfaenger = Array.isArray(d?.an) ? d.an : d?.an ? [d.an] : [];
  if (!d || empfaenger.length === 0 || !d.betreff || !d.text) {
    return NextResponse.json({ ok: false, fehler: "an, betreff und text werden gebraucht" }, { status: 400 });
  }
  // Ein Aufruf, ein Gast. Verteiler laufen über den Eventmanager selbst.
  if (empfaenger.length > 5) {
    return NextResponse.json({ ok: false, fehler: "zu viele Empfänger" }, { status: 400 });
  }

  try {
    await mailVerschicken({
      an: empfaenger,
      betreff: d.betreff.slice(0, 200),
      text: d.text,
      html: d.html,
      antwortAn: d.antwortAn ?? "tickets@florianzimmer.com",
      /*
        Ueber Microsoft, nicht ueber Brevo.

        Eine Ticketbestaetigung ist keine Werbung, sondern eine
        Pflichtmail. Sie darf nicht davon abhaengen, ob jemand sich bei
        Brevo abgemeldet hat, und sie soll von tickets@florianzimmer.com
        kommen, der Adresse, die der Gast kennt (Florian, 24.09.2026).
      */
    });
    return NextResponse.json({ ok: true });
  } catch (fehler) {
    console.error("[shop/mail] gescheitert:", fehler);
    return NextResponse.json(
      { ok: false, fehler: fehler instanceof Error ? fehler.message : "Versand gescheitert" },
      { status: 502 },
    );
  }
}
