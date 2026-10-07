import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { MAX_PERSONEN, personenMerken } from "@/lib/stempel/dienstleister";

/**
 * "Wie viele seid ihr heute?"
 *
 * Die Antwort hängt am Kommen-Stempel der Schicht. Ohne sie wird mit
 * einer Person gerechnet: lieber zu wenig in der Aufstellung des Büros
 * als eine Zahl, die niemand gesagt hat.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });
  if (b.rolle !== "reinigung") {
    return NextResponse.json({ ok: false, fehler: "Das ist hier nicht vorgesehen." }, { status: 403 });
  }

  const daten = (await request.json().catch(() => null)) as { id?: string; personen?: number } | null;
  const id = String(daten?.id ?? "");
  const personen = Number(daten?.personen);

  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ ok: false, fehler: "Unbekannter Stempel." }, { status: 400 });
  }
  if (!Number.isInteger(personen) || personen < 1 || personen > MAX_PERSONEN) {
    return NextResponse.json(
      { ok: false, fehler: `Bitte eine Zahl zwischen 1 und ${MAX_PERSONEN}.` },
      { status: 400 },
    );
  }

  const geklappt = await personenMerken({ stempelId: id, benutzerId: b.id, personen });
  if (!geklappt) {
    return NextResponse.json({ ok: false, fehler: "Dieser Stempel passt nicht mehr dazu." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
