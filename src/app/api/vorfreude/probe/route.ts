import { NextResponse } from "next/server";
import { buchungPerToken } from "@/lib/db/shop-buchungen";
import { verfuegbareGruppen } from "@/lib/shop/zusatzleistungen";
import { baueVorfreudemail } from "@/lib/mail/vorfreude";
import { mailVerschicken } from "@/lib/mail/versand";

/**
 * Schickt eine Vorfreude-Mail als Probe ins eigene Haus.
 *
 * Gedacht zum Ansehen, bevor die Mail zum ersten Mal an echte Gäste geht: Man
 * bekommt genau den Text, den ein bestimmter Gast bekäme, mit seinen
 * Bausteinen und seinen Links, nur eben an die eigene Adresse.
 *
 * Zwei Vorkehrungen, damit daraus kein Versandwerkzeug für Fremde wird:
 *
 *  - Ein Schlüssel im Kopf der Anfrage. Ohne ihn passiert nichts.
 *  - Empfänger nur aus einer festen Liste. Selbst wer den Schlüssel hätte,
 *    könnte damit niemanden ausserhalb des Hauses anschreiben.
 *
 * Die Buchung wird dabei NICHT als angeschrieben markiert. Ein echter Gast
 * bekäme seine Mail also weiterhin zum vorgesehenen Zeitpunkt.
 *
 * Aufruf:
 *   GET /api/vorfreude/probe?token=<zugangstoken>&an=<adresse>
 *   Kopf: x-probe-schluessel: <PROBE_SCHLUESSEL>
 */

export const dynamic = "force-dynamic";

/** Nur ins eigene Haus. */
const ERLAUBTE_EMPFAENGER = ["info@florianzimmer.com", "tickets@florianzimmer.com"];

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.PROBE_SCHLUESSEL;
  if (!erwartet) return false;
  const gesendet = request.headers.get("x-probe-schluessel");
  if (!gesendet || gesendet.length !== erwartet.length) return false;
  let unterschied = 0;
  for (let i = 0; i < erwartet.length; i++) {
    unterschied |= erwartet.charCodeAt(i) ^ gesendet.charCodeAt(i);
  }
  return unterschied === 0;
}

export async function GET(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const an = (searchParams.get("an") ?? "").trim().toLowerCase();

  if (!ERLAUBTE_EMPFAENGER.includes(an)) {
    return NextResponse.json(
      { ok: false, fehler: `Empfänger nicht erlaubt. Möglich: ${ERLAUBTE_EMPFAENGER.join(", ")}` },
      { status: 400 },
    );
  }

  const buchung = await buchungPerToken(token);
  if (!buchung) {
    return NextResponse.json({ ok: false, fehler: "Buchung unbekannt" }, { status: 404 });
  }

  const gruppen = await verfuegbareGruppen(buchung.ditixEventId);
  const mail = baueVorfreudemail(buchung, gruppen);

  try {
    await mailVerschicken({
      an,
      betreff: mail.betreff,
      text: mail.text,
      antwortAn: "tickets@florianzimmer.com",
    });
  } catch (f) {
    return NextResponse.json(
      { ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    an,
    betreff: mail.betreff,
    angeboten: mail.angeboten,
    gebucht: buchung.posten.map((p) => `${p.anzahl}x ${p.name}`),
  });
}
