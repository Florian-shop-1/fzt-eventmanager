import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { mailVerschicken } from "@/lib/mail/versand";

/**
 * Eine einzelne Mail aus einem Postfach des Hauses verschicken.
 *
 * Die Zugangsdaten für Microsoft liegen ausschließlich bei Vercel. Vom
 * Arbeitsrechner aus lässt sich deshalb keine Mail schicken, auch nicht
 * eine, die Florian ausdrücklich freigegeben hat (22.10.2026, Mail ans
 * Steuerbüro). Dafür ist diese Adresse da.
 *
 * Bewusst eng gehalten:
 *  - Nur POST, nur mit dem Schlüssel MAIL_SENDE_SCHLUESSEL im Kopf
 *    x-mail-schluessel. Fehlt der Schlüssel in der Umgebung, ist die
 *    Adresse zu und nicht offen.
 *  - Nur Absender aus unserer eigenen Domain. Es soll niemand über uns
 *    im Namen Dritter schreiben können.
 *  - Jede Sendung landet im Protokoll, mit Empfänger und Betreff.
 *
 * Was hier hinausgeht, hat ein Mensch vorher freigegeben. Die Adresse
 * ersetzt keinen Serienversand; dafür gibt es die eigenen Strecken.
 */

export const dynamic = "force-dynamic";

const EIGENE_DOMAIN = /@florianzimmer\.com$/i;

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const erwartet = (process.env.MAIL_SENDE_SCHLUESSEL ?? "").trim();
  if (erwartet.length < 16) {
    return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  }
  const mitgebracht = (request.headers.get("x-mail-schluessel") ?? "").trim();
  if (!gleich(mitgebracht, erwartet)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => null)) as {
    an?: string;
    absender?: string;
    antwortAn?: string;
    betreff?: string;
    text?: string;
    anhaenge?: Array<{ name?: string; typ?: string; base64?: string }>;
  } | null;

  if (!d?.an || !d.betreff || !d.text) {
    return NextResponse.json({ ok: false, fehler: "an, betreff und text fehlen" }, { status: 400 });
  }
  const absender = (d.absender ?? "").trim();
  if (absender && !EIGENE_DOMAIN.test(absender)) {
    return NextResponse.json({ ok: false, fehler: "fremder Absender" }, { status: 400 });
  }

  try {
    /*
      Anhaenge gehen als Base64 mit. Microsoft nimmt eine Mail nur bis
      etwa drei Megabyte an, deshalb die Grenze hier: lieber eine klare
      Absage als eine Mail, die beim Empfaenger nie ankommt.
    */
    const anhaenge = (d.anhaenge ?? [])
      .filter((a) => a.base64 && a.name)
      .map((a) => ({ name: a.name!, typ: a.typ ?? "application/octet-stream", base64: a.base64! }));
    const summe = anhaenge.reduce((z, a) => z + a.base64.length * 0.75, 0);
    if (summe > 3_000_000) {
      return NextResponse.json(
        { ok: false, fehler: "Die Anhaenge sind zusammen zu gross, Microsoft nimmt etwa 3 MB." },
        { status: 413 },
      );
    }

    await mailVerschicken({
      an: d.an,
      anhaenge: anhaenge.length ? anhaenge : undefined,
      absender: absender || undefined,
      antwortAn: d.antwortAn || absender || undefined,
      betreff: d.betreff,
      text: d.text,
    });
    console.log("[mail] verschickt an", d.an, "Betreff:", d.betreff);
    return NextResponse.json({ ok: true });
  } catch (f) {
    console.error("[mail] nicht verschickt:", f);
    return NextResponse.json({ ok: false, fehler: (f as Error).message }, { status: 500 });
  }
}
