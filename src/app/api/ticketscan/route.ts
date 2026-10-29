import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { einlassVorstellungen, scanZuruecknehmen, ticketScannen, type Station } from "@/lib/flotix/einlass";

export const dynamic = "force-dynamic";

/**
 * Die Tür zum Ticketscan, von innen.
 *
 * Der Mitarbeiter ist hier angemeldet, nicht bei FloTix (Florian,
 * 29.10.2026). Diese Stelle prüft, wer er ist, und gibt die Anfrage dann
 * mit dem gemeinsamen Schlüssel weiter. Der Schlüssel bleibt auf dem
 * Server, im Handy landet er nie.
 */
const DARF = ["chef", "team", "gastro", "foyer"];

async function wer() {
  const b = await angemeldeterBenutzer();
  return b && DARF.includes(b.rolle) ? b : null;
}

export async function GET(anfrage: Request) {
  if (!(await wer())) return NextResponse.json({ fehler: "Nicht erlaubt." }, { status: 403 });
  const alle = new URL(anfrage.url).searchParams.get("alle") === "1";
  try {
    return NextResponse.json({ vorstellungen: await einlassVorstellungen(alle) });
  } catch (f) {
    return NextResponse.json({ fehler: (f as Error).message }, { status: 502 });
  }
}

export async function POST(anfrage: Request) {
  const b = await wer();
  if (!b) return NextResponse.json({ fehler: "Nicht erlaubt." }, { status: 403 });

  const d = (await anfrage.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (d.was === "zurueck") {
      const id = String(d.ticketId ?? "");
      const getan = await scanZuruecknehmen(id);
      return NextResponse.json(
        getan ? { ok: true } : { fehler: "Dieses Ticket ist nicht als benutzt markiert." },
        { status: getan ? 200 : 409 },
      );
    }

    const station = ["einlass", "restaurant", "theke"].includes(String(d.station))
      ? (String(d.station) as Station)
      : "einlass";
    return NextResponse.json(
      await ticketScannen({
        eingabe: String(d.eingabe ?? "").slice(0, 400),
        station,
        vorstellung: String(d.vorstellung ?? ""),
      }),
    );
  } catch (f) {
    return NextResponse.json({ fehler: (f as Error).message }, { status: 502 });
  }
}
