import { timingSafeEqual } from "node:crypto";
import { anfrageAnnehmen } from "@/lib/db/anfragen";
import { anfragenAusDatenbankAktiv } from "@/lib/shop/leads";
import { anfragenMelden } from "@/lib/shop/lead-meldung";

/**
 * Eingang für Anfragen von der Website und aus Meta-Leadformularen (Julian, 20.10.2026).
 *
 * Bisher schrieb Make jede Anfrage in zwei Google-Tabellen und schickte Kevin
 * eine Mail. Jetzt geht sie hierher, in die eigene Tabelle anfrage (siehe
 * lib/db/anfragen.ts). Steht ANFRAGEN_QUELLE=datenbank, liest die Leads-Seite
 * daraus, und die Meldung an Kevin, Florian und Julian geht sofort raus
 * (ANFRAGEN_MELDEN_AN, mehrere mit Komma).
 *
 * Felder wie beim bisherigen Make-Webhook (JSON oder Formular): typ, name,
 * email, telefon, teilnehmerzahl, wunschdatum, kommentar, quelle_source,
 * quelle_medium, quelle_campaign, quelle_content, quelle_term.
 *
 * Geschützt über ANFRAGEN_SCHLUESSEL: als Header x-anfrage-schluessel,
 * Authorization: Bearer oder ?schluessel= (Make kann beides). Ohne gesetzten
 * Schlüssel lehnt die Route ab.
 *
 *   200  angenommen (auch eine schon bekannte Meldung)
 *   400  weder Name noch E-Mail noch Telefon
 *   401  Schlüssel fehlt oder stimmt nicht
 *   500  Ablegen fehlgeschlagen; nur dann soll der Absender wiederholen
 */

export const dynamic = "force-dynamic";

function stimmt(gesendet: string): boolean {
  const erwartet = (process.env.ANFRAGEN_SCHLUESSEL ?? "").trim();
  if (erwartet.length < 16 || !gesendet) return false;
  const a = Buffer.from(gesendet);
  const b = Buffer.from(erwartet);
  return a.length === b.length && timingSafeEqual(a, b);
}

function schluesselVon(request: Request): string {
  const kopf = request.headers.get("x-anfrage-schluessel");
  if (kopf) return kopf.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return (new URL(request.url).searchParams.get("schluessel") ?? "").trim();
}

async function inhalt(request: Request): Promise<Record<string, unknown>> {
  const art = request.headers.get("content-type") ?? "";
  if (art.includes("application/x-www-form-urlencoded") || art.includes("multipart/form-data")) {
    return Object.fromEntries((await request.formData()).entries());
  }
  const roh = await request.json().catch(() => ({}));
  return roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  if (!stimmt(schluesselVon(request))) {
    return Response.json({ fehler: "nicht erlaubt" }, { status: 401 });
  }
  const daten = await inhalt(request);
  const hat = (k: string) => String(daten[k] ?? "").trim() !== "";
  if (!hat("name") && !hat("email") && !hat("telefon")) {
    return Response.json({ fehler: "Anfrage ohne Name, E-Mail und Telefon" }, { status: 400 });
  }

  try {
    const { schluessel, neu } = await anfrageAnnehmen(daten);
    // Sofort melden, nicht erst beim nächsten Viertelstundenlauf. Scheitert die Mail,
    // holt der Lauf sie nach (anfrage_gemeldet bleibt dann leer).
    if (neu && anfragenAusDatenbankAktiv()) {
      await anfragenMelden().catch((f) => console.error("[anfrage] Meldung:", f instanceof Error ? f.message : f));
    }
    return Response.json({ ok: true, neu, schluessel });
  } catch (f) {
    console.error("[anfrage] nicht abgelegt:", f instanceof Error ? f.message : f);
    return Response.json({ fehler: "nicht abgelegt" }, { status: 500 });
  }
}
