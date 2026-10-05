import { NextResponse } from "next/server";
import { abgesagteEventIds } from "@/lib/absage/db";

/**
 * Welche Vorstellungen abgesagt sind.
 *
 * Fuer den Ticketshop: Eine Absage im Eventmanager nimmt die Show nicht
 * aus Ditix, der Verkauf wird dort von Hand geschlossen. Bis dahin, und
 * auch danach, soll sie wenigstens im Shop nicht mehr auftauchen
 * (Florian, 05.10.2026: "im frontend sollte die show auch verschwinden,
 * und da haben wir doch die kontrolle drüber").
 *
 * Offen und ohne Schluessel: Hier steht nur, welche Vorstellung ausfaellt,
 * und das ist keine Auskunft, die jemandem schadet. Wer sie liest, kann
 * nichts aendern.
 *
 * Faellt die Abfrage aus, soll der Shop sein Programm trotzdem zeigen.
 * Deshalb antwortet diese Adresse im Zweifel mit einer leeren Liste und
 * nie mit einem Fehler: Lieber eine Show zu viel im Programm als ein
 * leerer Spielplan.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ids = await abgesagteEventIds().catch(() => new Set<string>());

  return NextResponse.json(
    { abgesagt: [...ids] },
    {
      headers: {
        // Eine Minute reicht: Eine Absage ist selten, und der Shop fragt
        // bei jedem Seitenaufruf.
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        // Der Shop laeuft auf einer anderen Adresse.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
