import { NextResponse } from "next/server";
import { einstellungLesen, imHaus, stempelSetzen } from "@/lib/stempel/db";
import { MAX_PERSONEN } from "@/lib/stempel/dienstleister";
import {
  anzahlAendern,
  firmaZuSchluessel,
  laufendeSchicht,
  nameSaeubern,
} from "@/lib/stempel/putzlink";

/**
 * Ein Stempel vom offenen Link der Putzfirma.
 *
 * Drei Sachen kommen hier an: Einstempeln mit der Zahl der Leute,
 * Ausstempeln, und die Zahl nachträglich ändern, wenn später noch jemand
 * dazukommt oder früher geht.
 *
 * Geprüft wird, ob der Schlüssel gilt, ob der Stempel zur laufenden
 * Schicht passt und ob das Handy auf dem Gelände steht. Letzteres gilt
 * hier genauso wie für die eigenen Leute (Florian, 07.10.2026: "wichtig
 * ist auch hier, nur auf dem grundstück einstempeln").
 *
 * Ausstempeln geht von überall: Wer zu Hause merkt, dass er es vergessen
 * hat, soll es nachholen können. Dass er dabei nicht am Haus war, steht
 * am Stempel.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const daten = (await request.json().catch(() => null)) as
    | {
        schluessel?: string;
        was?: string;
        personen?: number;
        name?: string;
        lat?: number;
        lon?: number;
        genauigkeit?: number;
      }
    | null;

  const firma = await firmaZuSchluessel(String(daten?.schluessel ?? ""));
  if (!firma) {
    return NextResponse.json({ ok: false, fehler: "Dieser Link gilt nicht mehr." }, { status: 403 });
  }

  const was = daten?.was === "gehen" ? "gehen" : daten?.was === "anzahl" ? "anzahl" : "kommen";
  const schicht = await laufendeSchicht(firma.firmaId);

  /* ---- Die Zahl der Leute ändern, mitten in der Schicht ---- */
  if (was === "anzahl") {
    const personen = Number(daten?.personen);
    if (!schicht) {
      return NextResponse.json({ ok: false, fehler: "Gerade läuft keine Schicht." }, { status: 409 });
    }
    if (!Number.isInteger(personen) || personen < 1 || personen > MAX_PERSONEN) {
      return NextResponse.json({ ok: false, fehler: "Bitte eine Zahl antippen." }, { status: 400 });
    }
    await anzahlAendern(schicht.stempelId, firma.firmaId, personen);
    return NextResponse.json({ ok: true, schicht: await laufendeSchicht(firma.firmaId) });
  }

  /* ---- Ausstempeln ---- */
  if (was === "gehen") {
    if (!schicht) {
      return NextResponse.json(
        { ok: false, fehler: "Gerade läuft keine Schicht.", schicht: null },
        { status: 409 },
      );
    }
    const e = await einstellungLesen();
    const hatOrt = typeof daten?.lat === "number" && typeof daten?.lon === "number";
    const pruefung = hatOrt
      ? imHaus(e, { lat: daten!.lat!, lon: daten!.lon!, genauigkeit: daten!.genauigkeit ?? 9999 })
      : { drin: false, entfernungM: 0, grund: "Kein Standort verfügbar." };

    await stempelSetzen({
      benutzerId: firma.firmaId,
      // Derselbe Name wie beim Kommen, sonst findet die Abrechnung das Paar nicht.
      name: schicht.name || firma.firma,
      art: "gehen",
      lat: hatOrt ? daten!.lat! : null,
      lon: hatOrt ? daten!.lon! : null,
      genauigkeit: daten?.genauigkeit ?? null,
      entfernungM: hatOrt ? pruefung.entfernungM : null,
      imHaus: pruefung.drin,
      quelle: "putzlink",
      notiz: pruefung.drin
        ? ""
        : hatOrt
          ? `Ausgestempelt außerhalb des Geländes (rund ${pruefung.entfernungM} Meter entfernt)`
          : "Ausgestempelt ohne Standort",
    });

    return NextResponse.json({ ok: true, schicht: null });
  }

  /* ---- Einstempeln ---- */
  if (schicht) {
    return NextResponse.json(
      { ok: false, fehler: "Ihr seid schon eingestempelt.", schicht },
      { status: 409 },
    );
  }

  const personen = Number(daten?.personen);
  if (!Number.isInteger(personen) || personen < 1 || personen > MAX_PERSONEN) {
    return NextResponse.json({ ok: false, fehler: "Bitte antippen, wie viele ihr seid." }, { status: 400 });
  }

  const e = await einstellungLesen();
  const hatOrt = typeof daten?.lat === "number" && typeof daten?.lon === "number";
  const pruefung = hatOrt
    ? imHaus(e, { lat: daten!.lat!, lon: daten!.lon!, genauigkeit: daten!.genauigkeit ?? 9999 })
    : { drin: false, entfernungM: 0, grund: "Kein Standort verfügbar." };

  if (e.aktiv && !pruefung.drin) {
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

  /*
    Der Name ist freiwillig.

    Gebraucht wird er nicht, abgerechnet wird nach Köpfen und Stunden.
    Aber "wenn jemand anders kommt" (Florian, 07.10.2026), soll man es
    hinschreiben können, und dann steht es im Büro neben der Zeit.
  */
  const name = nameSaeubern(String(daten?.name ?? ""));

  await stempelSetzen({
    benutzerId: firma.firmaId,
    name: name.length >= 3 ? name : firma.firma,
    art: "kommen",
    lat: hatOrt ? daten!.lat! : null,
    lon: hatOrt ? daten!.lon! : null,
    genauigkeit: daten?.genauigkeit ?? null,
    entfernungM: hatOrt ? pruefung.entfernungM : null,
    imHaus: pruefung.drin,
    quelle: "putzlink",
    personen,
  });

  return NextResponse.json({ ok: true, schicht: await laufendeSchicht(firma.firmaId) });
}
