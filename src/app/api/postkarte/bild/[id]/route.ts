import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { bildHolen } from "@/lib/postkarte/db";

/**
 * Das Original einer Postkarte, mit Namen und Unterschrift darauf.
 *
 * Diese Adresse ist der einzige Weg zu dem Bild, und sie verlangt eine
 * Anmeldung. Deshalb liegt das Original in der Datenbank und nicht im
 * Blob-Speicher: Eine Blob-Adresse ist öffentlich, sobald jemand sie
 * kennt, und "kennt sie keiner" ist kein Datenschutz.
 *
 * Nicht zwischenspeichern, auch nicht im Browser des Teams.
 */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !["chef", "team", "foyer"].includes(benutzer.rolle)) {
    return NextResponse.json({ fehler: "Nicht erlaubt." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const bild = await bildHolen(id).catch(() => null);
  if (!bild) return NextResponse.json({ fehler: "Kein Bild." }, { status: 404 });

  return new NextResponse(new Uint8Array(bild.bild), {
    headers: {
      "content-type": bild.typ,
      "cache-control": "private, no-store",
    },
  });
}
