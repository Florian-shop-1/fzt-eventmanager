import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  einstellungLesen,
  imHaus,
  standVon,
  stempelSetzen,
  stunden,
  type StempelArt,
} from "@/lib/stempel/db";
import { gelaendeVerlassen } from "@/lib/stempel/wache";
import { geraetPruefen } from "@/lib/stempel/geraet";

/**
 * Ein Stempel vom Handy: Art plus Position.
 *
 * Geprüft wird auf dem Server, nicht im Browser. Sonst könnte man die
 * Position einfach im Browser verändern und sich von zu Hause einstempeln.
 * (Ganz verhindern lässt sich Schummeln mit gefälschtem GPS nicht, aber
 * jede Prüfung gehört trotzdem hierher.)
 */

export const dynamic = "force-dynamic";

const ERLAUBT: StempelArt[] = ["kommen", "pause_start", "pause_ende", "gehen"];

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  // Nur am Handy. Geprueft auf dem Server, damit es nicht reicht, im
  // Browser einen Knopf sichtbar zu machen (Florian, 23.09.2026).
  const geraet = geraetPruefen(request.headers.get("user-agent"));
  if (!geraet.handy) {
    return NextResponse.json({ ok: false, fehler: geraet.grund }, { status: 403 });
  }

  const daten = (await request.json().catch(() => null)) as
    | { art?: string; lat?: number; lon?: number; genauigkeit?: number }
    | null;
  const art = daten?.art as StempelArt;
  if (!ERLAUBT.includes(art)) return NextResponse.json({ ok: false, fehler: "Unbekannter Stempel." }, { status: 400 });

  const e = await einstellungLesen();
  const stand = await standVon(b.id);

  // Reihenfolge prüfen, damit keine unsinnigen Folgen entstehen.
  const erlaubtJetzt: Record<string, StempelArt[]> = {
    aus: ["kommen"],
    arbeit: ["pause_start", "gehen"],
    pause: ["pause_ende", "gehen"],
  };
  if (!erlaubtJetzt[stand.zustand].includes(art)) {
    return NextResponse.json({ ok: false, fehler: "Das passt gerade nicht. Bitte die Seite neu laden." }, { status: 409 });
  }

  const hatOrt = typeof daten?.lat === "number" && typeof daten?.lon === "number";
  const pruefung = hatOrt
    ? imHaus(e, { lat: daten!.lat!, lon: daten!.lon!, genauigkeit: daten!.genauigkeit ?? 9999 })
    : { drin: false, entfernungM: 0, grund: "Ohne Standort geht das Stempeln nicht. Bitte den Zugriff auf den Standort erlauben." };

  // Ausstempeln ist immer erlaubt: Wer schon weg ist, soll seine Zeit
  // sauber beenden können. Der Stempel wird aber als "nicht im Haus"
  // gekennzeichnet, und Florian und Kevin bekommen Bescheid.
  const mussImHaus = art !== "gehen";
  if (e.aktiv && mussImHaus && !pruefung.drin) {
    return NextResponse.json({ ok: false, fehler: pruefung.grund, entfernung: pruefung.entfernungM }, { status: 403 });
  }

  const stempel = await stempelSetzen({
    benutzerId: b.id,
    name: b.name,
    art,
    lat: hatOrt ? daten!.lat! : null,
    lon: hatOrt ? daten!.lon! : null,
    genauigkeit: daten?.genauigkeit ?? null,
    entfernungM: hatOrt ? pruefung.entfernungM : null,
    imHaus: pruefung.drin,
    notiz: !pruefung.drin && art === "gehen" ? "Ausgestempelt außerhalb des Geländes" : "",
  });

  if (art === "gehen" && !pruefung.drin && hatOrt) {
    // Auf den Kommen-Stempel beziehen, damit dieselbe Schicht nicht zweimal
    // gemeldet wird, falls die Stempeluhr das schon getan hat.
    await gelaendeVerlassen({
      kommenId: stand.stempelHeute.find((s) => s.art === "kommen")?.id ?? stempel.id,
      benutzerId: b.id,
      name: b.name,
      // Hier hat er selbst gestempelt, es braucht keinen zweiten Stempel.
      schonGestempelt: true,
      seit: stand.stempelHeute.find((s) => s.art === "kommen")?.zeitpunkt ?? stempel.zeitpunkt,
      entfernungM: pruefung.entfernungM,
    }).catch(() => undefined);
  }

  const neu = await standVon(b.id);
  return NextResponse.json({
    ok: true,
    zustand: neu.zustand,
    arbeitszeit: stunden(neu.minutenHeute),
    pause: stunden(neu.pausenMinutenHeute),
    entfernung: pruefung.entfernungM,
  });
}
