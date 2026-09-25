import { NextResponse } from "next/server";
import { umsaetzeUebernehmen, type RoherUmsatz } from "@/lib/rechnung/bankimport";
import { einstellung, erfolgErstmalsMerken, syncMerken } from "@/lib/rechnung/db";
import { mailVerschicken } from "@/lib/mail/versand";

/**
 * Hier liefert der Bankabruf seine Umsätze ab.
 *
 * Bewusst nur eine Annahmestelle: Die Verbindung zur Bank baut nicht der
 * Eventmanager auf, sondern ein kleines Programm dort, wo die
 * Zugangsdaten hingehören (scripts/bank-abruf.py). Dieses schickt die
 * gebuchten Umsätze hierher. Damit liegt keine PIN bei Vercel, kein
 * VR-NetKey in der Datenbank und nichts davon im Browser.
 *
 * Geschützt mit einem eigenen Schlüssel (BANK_IMPORT_SECRET), nicht mit
 * dem Anmeldecookie: Das Programm hat keinen Benutzer.
 *
 * Gelesen wird, geschrieben wird beim Konto nichts. Diese Adresse nimmt
 * ausschließlich Umsätze entgegen und löst niemals eine Zahlung aus.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Anfrage {
  /** Die gebuchten Umsätze, so wie die Bank sie liefert. */
  umsaetze?: RoherUmsatz[];
  /** Bis wann abgerufen wurde, für die Anzeige "zuletzt abgeglichen". */
  bis?: string;
  /** Meldet das Skript, wenn die Bank eine neue Freigabe verlangt. */
  freigabeNoetig?: boolean;
  fehler?: string;
  /** Die letzten vier Stellen des Kontos, zur Sicherheit gegen Verwechslung. */
  kontoEndetAuf?: string;
}

function erlaubt(request: Request): boolean {
  const geheim = process.env.BANK_IMPORT_SECRET;
  if (!geheim || geheim.length < 16) return false;
  const kopf = request.headers.get("authorization") ?? "";
  return kopf === `Bearer ${geheim}`;
}

export async function POST(request: Request) {
  if (!erlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const d = (await request.json().catch(() => null)) as Anfrage | null;
  if (!d) return NextResponse.json({ ok: false, fehler: "Keine Daten" }, { status: 400 });

  // Meldet das Skript nur einen Zustand, wird nichts übernommen.
  if (d.fehler || d.freigabeNoetig) {
    await syncMerken({ umsaetze: 0, fehler: d.fehler ?? null, freigabeNoetig: Boolean(d.freigabeNoetig) });
    return NextResponse.json({ ok: true, vermerkt: true });
  }

  const e = await einstellung();
  if (d.kontoEndetAuf && e.kontoEndetAuf && d.kontoEndetAuf !== e.kontoEndetAuf) {
    return NextResponse.json(
      { ok: false, fehler: `Falsches Konto: erwartet wird das Konto auf ${e.kontoEndetAuf}` },
      { status: 400 },
    );
  }

  const liste = Array.isArray(d.umsaetze) ? d.umsaetze : [];
  if (liste.length > 2000) {
    return NextResponse.json({ ok: false, fehler: "Zu viele Umsätze auf einmal" }, { status: 413 });
  }

  const BR = String.fromCharCode(10);
  const ergebnis = await umsaetzeUebernehmen(liste, "Bankabruf");
  await syncMerken({ umsaetze: ergebnis.neu, bisDatum: d.bis ?? null, fehler: null, freigabeNoetig: false });

  /*
    Der erste gelungene Abruf bekommt eine Nachricht.

    Die FinTS-Registrierungsnummer war am 23.09.2026 bei Atruvia noch
    nicht bekannt, der geplante Lauf probiert es seitdem zweimal taeglich.
    Florian soll nicht selbst nachsehen muessen, wann es endlich klappt.
    Die Mail geht genau einmal hinaus, dafuer sorgt der Merker in der
    Datenbank.
  */
  if (await erfolgErstmalsMerken()) {
    const text = [
      "Der Bankabgleich läuft.",
      "",
      `Der erste Abruf bei der Bank hat geklappt, ${ergebnis.neu} neue Umsätze sind eingelesen.`,
      "Ab jetzt holt der Rechner die Kontoumsätze zweimal täglich, um 7:30 und um 18:00 Uhr,",
      "und gleicht sie mit den offenen Rechnungen ab.",
      "",
      "Offene und bezahlte Rechnungen stehen im Eventmanager unter Zahlungseingänge.",
      "",
      "Das Konto wird ausschließlich gelesen. Zahlungen werden nie ausgelöst.",
    ].join(BR);

    await mailVerschicken({
      an: "info@florianzimmer.com",
      betreff: "Der Bankabgleich läuft jetzt",
      text,
      html: text
        .split(BR)
        .map((z) => (z ? `<p style="margin:0 0 10px">${z}</p>` : ""))
        .join(""),
    }).catch((f) => {
      // Eine Mail, die nicht ankommt, darf den Import nicht scheitern lassen.
      console.warn("[bank] Erfolgsmeldung nicht zugestellt:", f);
    });
  }

  return NextResponse.json({ ok: true, ...ergebnis });
}

/** Zum Prüfen, ob der Schlüssel stimmt, ohne etwas zu verändern. */
export async function GET(request: Request) {
  if (!erlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }
  const e = await einstellung();
  return NextResponse.json({
    ok: true,
    konto: e.kontoEndetAuf,
    bank: e.bank,
    zuletzt: e.zuletztAm,
    freigabeNoetig: e.freigabeNoetig,
  });
}
