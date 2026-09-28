import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  einstellungLesen,
  imHaus,
  meldungMerken,
  schonGemeldet,
  standVon,
  stempelSetzen,
  stunden,
  type StempelArt,
} from "@/lib/stempel/db";
import { gelaendeVerlassen, standortUnklarMelden } from "@/lib/stempel/wache";
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
    : { drin: false, entfernungM: 0, grund: "Kein Standort verfügbar. Bitte Ortungsdienste einschalten und den Zugriff erlauben." };

  /*
    Eingestempelt wird immer, auch ohne oder mit schlechtem Standort
    (Florian, 28.09.2026). Bei manchen Handys geht das GPS im Gebäude
    einfach nicht, und dann vor der Tür stehen zu lassen wäre schlimmer
    als eine Zeit, die das Büro hinterher kurz prüft. Der Stempel merkt
    sich, ob der Standort gepasst hat, und Florian und Kevin bekommen
    Bescheid, damit sie es nachsehen können.
  */
  const mussImHaus = art !== "gehen";
  const standortUnklar = e.aktiv && mussImHaus && !pruefung.drin;

  const stempel = await stempelSetzen({
    benutzerId: b.id,
    name: b.name,
    art,
    lat: hatOrt ? daten!.lat! : null,
    lon: hatOrt ? daten!.lon! : null,
    genauigkeit: daten?.genauigkeit ?? null,
    entfernungM: hatOrt ? pruefung.entfernungM : null,
    imHaus: pruefung.drin,
    notiz: standortUnklar
      ? `Standort beim Stempeln unklar: ${pruefung.grund}`
      : !pruefung.drin && art === "gehen"
        ? "Ausgestempelt außerhalb des Geländes"
        : "",
  });

  if (standortUnklar) {
    // Auf den Kommen-Stempel der Schicht beziehen, damit nicht bei jedem
    // Stempel derselben Schicht erneut gemeldet wird.
    const kommenId = stand.stempelHeute.find((s) => s.art === "kommen")?.id ?? stempel.id;
    if (!(await schonGemeldet(kommenId, "standort_unklar"))) {
      await meldungMerken(kommenId, "standort_unklar");
      await standortUnklarMelden({ name: b.name, art, grund: pruefung.grund }).catch(() => undefined);
    }
  }

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
    // Kein Fehler, aber ein Hinweis: gestempelt wurde trotzdem.
    standortHinweis: standortUnklar ? pruefung.grund : null,
  });
}
