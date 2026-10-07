import { NextResponse } from "next/server";
import { einstellungLesen, imHaus, stempelSetzen } from "@/lib/stempel/db";
import {
  firmaZuSchluessel,
  nameSaeubern,
  staende,
  standVonName,
} from "@/lib/stempel/putzlink";

/**
 * Ein Stempel vom offenen Link der Putzfirma.
 *
 * Geprüft wird dreierlei: ob der Schlüssel gilt, ob der Stempel zum
 * Zustand dieser Person passt, und ob das Handy auf dem Gelände steht.
 * Letzteres gilt hier genauso wie für die eigenen Leute (Florian,
 * 07.10.2026: "wichtig ist auch hier, nur auf dem grundstück
 * einstempeln").
 *
 * Ausstempeln geht wie überall von überall: Wer zu Hause merkt, dass er
 * es vergessen hat, soll es nachholen können. Dass er dabei nicht am
 * Haus war, steht am Stempel.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const daten = (await request.json().catch(() => null)) as
    | { schluessel?: string; name?: string; art?: string; lat?: number; lon?: number; genauigkeit?: number }
    | null;

  const firma = await firmaZuSchluessel(String(daten?.schluessel ?? ""));
  if (!firma) {
    return NextResponse.json({ ok: false, fehler: "Dieser Link gilt nicht mehr." }, { status: 403 });
  }

  const name = nameSaeubern(String(daten?.name ?? ""));
  if (name.length < 3) {
    return NextResponse.json({ ok: false, fehler: "Bitte den Namen schreiben." }, { status: 400 });
  }

  const art = daten?.art === "gehen" ? "gehen" : "kommen";
  const zustand = await standVonName(firma.firmaId, name);
  if (art === "kommen" && zustand === "arbeit") {
    return NextResponse.json(
      { ok: false, fehler: `${name} ist schon eingestempelt.`, leute: await staende(firma.firmaId) },
      { status: 409 },
    );
  }
  if (art === "gehen" && zustand === "aus") {
    return NextResponse.json(
      { ok: false, fehler: `${name} ist gerade nicht eingestempelt.`, leute: await staende(firma.firmaId) },
      { status: 409 },
    );
  }

  const e = await einstellungLesen();
  const hatOrt = typeof daten?.lat === "number" && typeof daten?.lon === "number";
  const pruefung = hatOrt
    ? imHaus(e, { lat: daten!.lat!, lon: daten!.lon!, genauigkeit: daten!.genauigkeit ?? 9999 })
    : { drin: false, entfernungM: 0, grund: "Kein Standort verfügbar." };

  if (art === "kommen" && e.aktiv && !pruefung.drin) {
    return NextResponse.json(
      {
        ok: false,
        sperre: hatOrt ? "zu_weit" : "kein_ort",
        fehler: hatOrt
          ? `Du bist rund ${pruefung.entfernungM} Meter vom Theater entfernt. Gestempelt wird nur vor Ort.`
          : "Wir können deinen Standort nicht sehen. Entweder sind die Ortungsdienste aus, oder der Browser darf nicht darauf zugreifen.",
      },
      { status: 403 },
    );
  }

  await stempelSetzen({
    benutzerId: firma.firmaId,
    name,
    art,
    lat: hatOrt ? daten!.lat! : null,
    lon: hatOrt ? daten!.lon! : null,
    genauigkeit: daten?.genauigkeit ?? null,
    entfernungM: hatOrt ? pruefung.entfernungM : null,
    imHaus: pruefung.drin,
    quelle: "putzlink",
    notiz:
      art === "gehen" && !pruefung.drin
        ? hatOrt
          ? `Ausgestempelt außerhalb des Geländes (rund ${pruefung.entfernungM} Meter entfernt)`
          : "Ausgestempelt ohne Standort"
        : "",
  });

  return NextResponse.json({ ok: true, leute: await staende(firma.firmaId) });
}
