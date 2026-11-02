import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { abendpreise } from "@/lib/ditix/preise";
import { preisquelleFuerWochentag } from "@/lib/angebot/preisquelle";

/**
 * Die Ticketpreise des gewählten Abends, für den Baukasten.
 *
 * "dort stehen auch nicht die richtigen preise für eine donnerstagsshow
 * ... oben sagst du ja schon donnerstag (günstiger) - zeigst aber die
 * preise vom samstag" (Florian, 30.10.2026).
 *
 * Im Baukasten standen die Preise aus dem Artikelstamm, also die
 * Listenpreise. Das Angebot rechnet aber mit den Preisen der passenden
 * Vorstellung, und die unterscheiden sich je Wochentag. Wer donnerstags
 * anbietet, sah also 139 Euro und verschickte 119.
 *
 * Gesucht wird nach derselben Regel wie beim Erstellen: die nächste
 * Vorstellung an diesem Wochentag zur passenden Tageszeit.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    return NextResponse.json({ fehler: "Nicht erlaubt." }, { status: 403 });
  }

  const u = new URL(request.url);
  const eventId = (u.searchParams.get("vorstellung") ?? "").trim();
  const wochentag = Number(u.searchParams.get("wochentag"));
  const nachmittag = u.searchParams.get("tageszeit") === "nachmittag";

  try {
    let ziel = eventId;
    let herkunft: { datum: string; show: string; weitWeg?: boolean } | null = null;

    if (!ziel && Number.isInteger(wochentag)) {
      // Dieselbe Regel wie beim Erstellen, siehe lib/angebot/preisquelle.ts.
      const quelle = await preisquelleFuerWochentag(wochentag, nachmittag);
      if (quelle) {
        ziel = quelle.ditixEventId;
        herkunft = { datum: quelle.datum, show: quelle.show, weitWeg: quelle.weitWeg };
      }
    }

    /*
      Nichts gefunden heisst: Listenpreise. Das steht jetzt in der
      Antwort, damit die Oberflaeche es hinschreiben kann statt still
      die Preise aus dem Artikelstamm zu zeigen (Florian, 02.11.2026).
    */
    if (!ziel) return NextResponse.json({ preise: {}, herkunft: null, keineVorstellung: true });

    const { cent } = await abendpreise(ziel);
    return NextResponse.json({
      preise: Object.fromEntries(cent),
      herkunft,
    });
  } catch {
    // Keine Preise ist kein Fehler: Dann gelten die aus dem Artikelstamm.
    return NextResponse.json({ preise: {}, herkunft: null });
  }
}
