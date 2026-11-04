import { NextResponse } from "next/server";
import { gastKlickMerken } from "@/lib/db/gaesteliste";

/**
 * Der Weg zur Bewertungsplattform, mit Zwischenstopp.
 *
 * Die schöne Seite liegt im Shop, unter florianzimmertheater.de/bewerten.
 * Dort möchten wir keinen Schlüssel zur Eventmanager-Datenbank liegen
 * haben, nur damit ein Klick vermerkt wird. Deshalb zeigen die beiden
 * Knöpfe dort auf diese Adresse: Sie merkt sich den Klick und schickt
 * den Gast sofort weiter.
 *
 * Das ist zugleich das bessere Mass. Gezählt wird nicht, wer die Mail
 * geöffnet hat, sondern wer wirklich losgegangen ist, um zu bewerten.
 * Nur an die anderen geht am nächsten Tag die Erinnerung
 * (Florian, 04.11.2026).
 *
 * Ein unbekannter Schlüssel führt trotzdem zur Plattform. Wer bewerten
 * will, soll bewerten können; unsere Buchführung ist nicht sein Problem.
 */

export const dynamic = "force-dynamic";

const ZIELE: Record<string, string> = {
  google: "https://search.google.com/local/writereview?placeid=ChIJM7SUXk3fm0cRLDoip8t0DRQ",
  tripadvisor:
    "https://www.tripadvisor.de/UserReviewEdit-g198468-d24151397-Florian_Zimmer_Theater-Neu_Ulm_Swabia_Bavaria.html",
};

export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ token: string; ziel: string }> },
) {
  const { token, ziel } = await params;
  const adresse = ZIELE[ziel.toLowerCase()];
  if (!adresse) return NextResponse.json({ ok: false, fehler: "unbekanntes Ziel" }, { status: 404 });

  await gastKlickMerken(token).catch(() => null);

  // 302 und nicht 308: Der Browser soll das nicht dauerhaft merken,
  // sonst zaehlt der zweite Besuch nie mehr mit.
  return NextResponse.redirect(adresse, 302);
}
