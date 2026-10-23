/**
 * Die Tickets der Postsendungen in einem PDF (Florian, 23.10.2026).
 *
 * Wie beim Gutschein druckt Kevin zwei Dinge: das Anschreiben auf den Briefbogen und die Tickets auf das Ticketpapier.
 * Die Tickets kommen aus FloTix, eine Seite je Ticket, ohne Preis, in der Reihenfolge der Liste.
 *
 *   /versand/tickets          alle offenen Ticketsendungen mit Anschrift
 *   /versand/tickets?nur=NR   genau diese Sendung
 */

import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { brauchtKlaerung, gehtInDiePost, holeSendungen } from "@/lib/shop/versand";
import { versandStaende } from "@/lib/db/buero";
import { flotixTicketDruck } from "@/lib/flotix/tuer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !["chef", "team", "foyer"].includes(benutzer.rolle)) {
    return NextResponse.json({ fehler: "nicht erlaubt" }, { status: 403 });
  }

  const nur = new URL(request.url).searchParams.get("nur")?.trim() ?? "";

  try {
    const [sendungen, staende] = await Promise.all([holeSendungen(), versandStaende()]);
    const tickets = sendungen.filter((s) => s.art === "tickets" && gehtInDiePost(s));
    const gewaehlt = nur
      ? tickets.filter((s) => s.bestellnummer === nur)
      : tickets.filter(
          (s) => !staende.get(s.bestellnummer)?.erledigtAm && !/versendet/i.test(s.status) && !brauchtKlaerung(s),
        );
    if (gewaehlt.length === 0) {
      return NextResponse.json({ fehler: "Keine Tickets zu drucken." }, { status: 404 });
    }

    const { pdf, ohneDruck } = await flotixTicketDruck(gewaehlt.map((s) => s.bestellnummer));
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Tickets-Versand.pdf"',
        "Cache-Control": "no-store",
        ...(ohneDruck.length > 0 ? { "X-Ohne-Druck": ohneDruck.join(",") } : {}),
      },
    });
  } catch (f) {
    return NextResponse.json({ fehler: f instanceof Error ? f.message : "Fehler" }, { status: 502 });
  }
}
