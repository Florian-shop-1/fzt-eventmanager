import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { abendpreise } from "@/lib/ditix/preise";
import { showtageAbHeute } from "@/lib/ditix/spielplan";

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
    let herkunft: { datum: string; show: string } | null = null;

    if (!ziel && Number.isInteger(wochentag)) {
      const passend = (await showtageAbHeute(400)).find((t) => {
        if (new Date(`${t.datum}T12:00:00Z`).getUTCDay() !== wochentag) return false;
        return nachmittag ? t.uhrzeit < "17:00" : t.uhrzeit >= "17:00";
      });
      if (passend) {
        ziel = passend.ditixEventId;
        herkunft = { datum: passend.datum, show: passend.name };
      }
    }

    if (!ziel) return NextResponse.json({ preise: {}, herkunft: null });

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
