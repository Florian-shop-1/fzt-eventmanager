import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { antragStellen, letzteStempel } from "@/lib/stempel/db";
import { wegPruefen } from "@/lib/stempel/plausibel";
import { melden } from "@/lib/stempel/wache";

/**
 * "Wann hast du die Arbeitszeit beendet?"
 *
 * Die Frage kommt sofort, wenn jemand außerhalb des Geländes
 * ausstempelt. Bisher zeigte die Uhr nur einen Hinweis und sprang zum
 * Nachmelde-Formular weiter unten; gefragt wurde nirgends, und
 * entsprechend selten kam eine Antwort (Florian, 06.10.2026).
 *
 * Die Antwort wird nicht einfach übernommen, sondern als Änderungswunsch
 * eingetragen, wie jede andere Zeitkorrektur auch: Das Büro entscheidet,
 * nicht der Mitarbeiter. Dazu kommt der Abgleich mit dem gemessenen
 * Abstand, siehe lib/stempel/plausibel.ts.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b) return NextResponse.json({ ok: false, fehler: "Bitte neu anmelden." }, { status: 401 });

  const daten = (await request.json().catch(() => null)) as { uhrzeit?: string; text?: string } | null;
  const uhrzeit = String(daten?.uhrzeit ?? "").trim();
  const notiz = String(daten?.text ?? "").trim().slice(0, 300);

  if (!/^\d{1,2}:\d{2}$/.test(uhrzeit)) {
    return NextResponse.json({ ok: false, fehler: "Bitte eine Uhrzeit wie 23:10 angeben." }, { status: 400 });
  }

  // Der Stempel, um den es geht: das letzte Gehen dieser Person.
  const letzte = await letzteStempel(b.id, 10);
  const gehen = letzte.find((s) => s.art === "gehen");
  if (!gehen) {
    return NextResponse.json({ ok: false, fehler: "Dazu finden wir keinen Stempel." }, { status: 409 });
  }

  const gestempelt = new Date(gehen.zeitpunkt);
  const tag = gestempelt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const [stunde, minute] = uhrzeit.split(":").map(Number);
  if (stunde > 23 || minute > 59) {
    return NextResponse.json({ ok: false, fehler: "Diese Uhrzeit gibt es nicht." }, { status: 400 });
  }

  /*
    Die Uhrzeit gehört zu dem Tag, an dem gestempelt wurde. Nach
    Mitternacht ausgestempelt und "23:40" angegeben heißt: der Tag davor.
  */
  const ende = new Date(`${tag}T${String(stunde).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  if (ende.getTime() > gestempelt.getTime() + 60 * 60 * 1000) ende.setDate(ende.getDate() - 1);

  const pruefung = wegPruefen({
    entfernungM: gehen.entfernungM,
    gestempeltAm: gestempelt,
    endeLaut: ende,
  });

  const abstand =
    gehen.entfernungM === null
      ? "Abstand beim Stempeln unbekannt"
      : `beim Stempeln rund ${gehen.entfernungM} Meter vom Theater entfernt`;

  const zusammenfassung = [
    `Gehen: ${uhrzeit} Uhr`,
    `Ausgestempelt außerhalb des Geländes, ${abstand}`,
    notiz,
    pruefung.plausibel ? "" : `Passt nicht zusammen: ${pruefung.hinweis}`,
  ]
    .filter(Boolean)
    .join(" · ");

  await antragStellen({
    benutzerId: b.id,
    name: b.name,
    art: "aenderung",
    tag,
    text: zusammenfassung,
    vorschlagGehen: ende.toISOString(),
  });

  await melden(
    `${b.name} hat außerhalb des Geländes ausgestempelt`,
    [
      `Arbeitsende laut eigener Angabe: ${uhrzeit} Uhr.`,
      `Gestempelt um ${gestempelt.toLocaleTimeString("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
      })} Uhr, ${abstand}.`,
      notiz ? `Dazu geschrieben: ${notiz}` : "",
      pruefung.plausibel ? "" : `Das passt nicht zusammen: ${pruefung.hinweis}`,
      "",
      "Übernehmen oder ablehnen in der Stempeluhr unter „Änderungswünsche“.",
    ].filter(Boolean),
  ).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
