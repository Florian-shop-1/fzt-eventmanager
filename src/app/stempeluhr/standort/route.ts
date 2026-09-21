import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { einstellungLesen, imHaus, minutenOhnePause, standVon } from "@/lib/stempel/db";
import { PAUSE_NACH_MINUTEN, gelaendeVerlassen, pausenPflichtPruefen } from "@/lib/stempel/wache";

/**
 * Der regelmäßige Standort-Ping, solange die Stempeluhr offen ist.
 *
 * Wer eingestempelt ist und sich vom Gelände entfernt, wird hier bemerkt:
 * Florian und Kevin bekommen eine Mail, und im Browser erscheint der
 * Hinweis, doch bitte auszustempeln.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false }, { status: 401 });
  const d = (await request.json().catch(() => null)) as { lat?: number; lon?: number; genauigkeit?: number } | null;
  if (typeof d?.lat !== "number" || typeof d?.lon !== "number") return NextResponse.json({ ok: false }, { status: 400 });

  const e = await einstellungLesen();
  const stand = await standVon(b.id);
  const p = imHaus(e, { lat: d.lat, lon: d.lon, genauigkeit: d.genauigkeit ?? 9999 });

  // Der Ping ist auch der Moment, in dem die Pausenpflicht auffaellt:
  // Wer die Uhr offen hat, arbeitet gerade.
  const ohnePause = minutenOhnePause(stand);
  if (ohnePause >= PAUSE_NACH_MINUTEN) void pausenPflichtPruefen().catch(() => undefined);

  if (stand.zustand === "aus" || p.drin) {
    return NextResponse.json({
      ok: true,
      drin: p.drin,
      entfernung: p.entfernungM,
      pauseFaellig: ohnePause >= PAUSE_NACH_MINUTEN,
    });
  }

  const kommen = stand.stempelHeute.find((s) => s.art === "kommen");
  const gemeldet = kommen
    ? await gelaendeVerlassen({
        kommenId: kommen.id,
        name: b.name,
        seit: kommen.zeitpunkt,
        entfernungM: p.entfernungM,
      }).catch(() => false)
    : false;

  return NextResponse.json({
    ok: true,
    drin: false,
    entfernung: p.entfernungM,
    gemeldet,
    pauseFaellig: ohnePause >= PAUSE_NACH_MINUTEN,
  });
}
