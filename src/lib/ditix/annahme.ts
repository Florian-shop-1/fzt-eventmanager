/**
 * Annahme der Ditix-Meldungen: Schlüsselprüfung, Größe, Ablegen.
 *
 * Liegt hier statt in der Route, weil derselbe Webhook auf zwei Adressen
 * hört (mit dem Schlüssel als ?schluessel= und als letzter Teil des
 * Pfads) und weil sich Routen nicht ohne Datenbank prüfen lassen. Die
 * Routen rufen nur noch diese Funktionen auf.
 *
 * Warum zwei Adressen: Ditix lässt keine Kopfzeilen setzen, nur eine
 * POST-Adresse. Ob Ditix eine Adresse mit "?" akzeptiert und beim
 * Speichern behält, wussten wir am 06.10.2026 nicht, "webhook ungültig".
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { kopfzeilen, legeMeldungAb, merkeVersuch, unlesbar, type Abfrage } from "@/lib/db/ditix-eingang";

/**
 * Obergrenze für eine Meldung. Eine große Gruppenbestellung bleibt weit
 * darunter, aber wer den Schlüssel hat (oder ihn einmal hatte), soll die
 * Datenbank nicht mit Megabytes pro Aufruf füllen können.
 */
export const MAX_BYTES = 1024 * 1024;

export interface Optionen {
  /** Der Schlüssel aus dem Pfad, falls die Adresse ihn dort trägt. */
  pfadSchluessel?: string;
  /** Nur für Tests: eine andere Datenbank. */
  sql?: Abfrage;
}

type Ort = "header" | "adresse" | "pfad";

function schluesselVon(request: Request, pfadSchluessel?: string): { wert: string; ort: Ort } | null {
  const header = request.headers.get("x-ditix-schluessel");
  if (header) return { wert: header, ort: "header" };

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) return { wert: bearer, ort: "header" };

  const adresse = new URL(request.url).searchParams.get("schluessel");
  if (adresse) return { wert: adresse, ort: "adresse" };

  if (pfadSchluessel) return { wert: pfadSchluessel, ort: "pfad" };
  return null;
}

/**
 * Groß- und Kleinschreibung zählt beim Schlüssel nicht.
 *
 * Ditix hat die Adresse am 06.10.2026 komplett klein geschrieben gespeichert,
 * und der Schlüssel (Buchstaben in beiden Schreibweisen) passte nicht mehr:
 * Über 100 Anfragen von Ditix wurden mit "falscher Schlüssel" abgewiesen.
 * Adressen gelten bei vielen Systemen als nicht schreibungsempfindlich, und
 * der Schlüssel ist mit 43 Zeichen lang genug, dass das nichts schwächt
 * (grob 2^220 statt 2^256 Möglichkeiten).
 */
function stimmt(gesendet: string | undefined): boolean {
  const erwartet = process.env.DITIX_WEBHOOK_SCHLUESSEL?.toLowerCase();
  if (!erwartet || !gesendet) return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST: die eigentliche Meldung. */
export async function nimmAn(request: Request, opt: Optionen = {}): Promise<Response> {
  const k = schluesselVon(request, opt.pfadSchluessel);
  if (!stimmt(k?.wert)) {
    await merkeVersuch(request, k ? "falscher Schlüssel" : "kein Schlüssel", k?.ort ?? null, opt.sql);
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const angekuendigt = Number(request.headers.get("content-length"));
  if (Number.isFinite(angekuendigt) && angekuendigt > MAX_BYTES) {
    return NextResponse.json({ ok: false, fehler: "zu groß" }, { status: 413 });
  }

  // Erst als Text lesen: Ist es kein JSON, wollen wir trotzdem sehen, was kam.
  const rumpf = await request.text();
  if (rumpf.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, fehler: "zu groß" }, { status: 413 });
  }
  let roh: unknown;
  try {
    roh = JSON.parse(rumpf);
  } catch {
    roh = unlesbar(rumpf);
  }

  try {
    const a = await legeMeldungAb(roh, kopfzeilen(request.headers), opt.sql);
    return NextResponse.json({ ok: true, wiederholt: a.wiederholt });
  } catch (e) {
    console.error("[ditix-eingang]", e);
    return NextResponse.json({ ok: false, fehler: "konnte nicht abgelegt werden" }, { status: 500 });
  }
}

/**
 * GET und HEAD: "Ist die Adresse da?" Manche Systeme prüfen so, bevor sie
 * einen Webhook speichern. Die Antwort verrät nichts und legt nichts ab,
 * der Versuch wird nur (begrenzt) vermerkt, damit wir sehen, wie Ditix
 * prüft.
 */
export async function antwortAufPruefung(request: Request, opt: Optionen = {}): Promise<Response> {
  const k = schluesselVon(request, opt.pfadSchluessel);
  await merkeVersuch(request, request.method, k?.ort ?? null, opt.sql);
  return NextResponse.json({ ok: true, hinweis: "Dieser Webhook nimmt POST-Anfragen entgegen." });
}
