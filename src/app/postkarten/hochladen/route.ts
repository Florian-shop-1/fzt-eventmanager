import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { karteAblegen } from "@/lib/postkarte/db";
import { lesenEingerichtet, postkarteLesen } from "@/lib/postkarte/lesen";

/**
 * Nimmt das Foto einer Gästepostkarte entgegen, liest sie und legt sie ab.
 *
 * Eine Karte je Aufruf. Beim Stapel schickt der Browser sie
 * nacheinander, und zwar aus einem Grund: So sieht man im Foyer nach
 * jeder Karte, was herausgekommen ist, statt nach zwanzig Karten eine
 * Fehlermeldung für alle zu bekommen.
 *
 * Gelesen wird sofort. Veröffentlicht wird nichts: Jede Karte landet im
 * Stand "gelesen" und wartet auf die Schwärzung und einen Menschen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HOECHSTENS = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !["chef", "team", "foyer"].includes(benutzer.rolle)) {
    return NextResponse.json({ ok: false, fehler: "Nicht erlaubt." }, { status: 403 });
  }
  if (!lesenEingerichtet()) {
    return NextResponse.json({ ok: false, fehler: "Zum Lesen fehlt der Schlüssel." }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const datei = form?.get("foto");
  /*
    Ausgelegt werden nur Karten mit dem Hinweis auf die Veroeffentlichung.
    "der mitarbeiter kriegt nur welche die OK sind" (Florian, 27.10.2026).
    Deshalb gilt beim Scannen die Einwilligung als erteilt; wer eine alte
    Karte ohne Hinweis einliest, schickt ausdruecklich "unbekannt" mit.
  */
  const einwilligung = String(form?.get("einwilligung") ?? "erteilt");
  if (!(datei instanceof File)) {
    return NextResponse.json({ ok: false, fehler: "Kein Foto." }, { status: 400 });
  }
  if (datei.size > HOECHSTENS) {
    return NextResponse.json({ ok: false, fehler: "Das Foto ist zu groß." }, { status: 413 });
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(datei.type)) {
    return NextResponse.json({ ok: false, fehler: "Bitte ein Foto als JPEG oder PNG." }, { status: 415 });
  }

  try {
    const inhalt = Buffer.from(await datei.arrayBuffer());
    const befund = await postkarteLesen(inhalt.toString("base64"), datei.type);

    if (!befund.karteOk) {
      return NextResponse.json({
        ok: true,
        gelesen: false,
        hinweis: befund.hinweis || "Darauf ist keine Gästepostkarte zu erkennen.",
      });
    }

    const karte = await karteAblegen({
      bild: inhalt,
      bildTyp: datei.type,
      befund,
      von: benutzer.name,
      einwilligung: einwilligung === "unbekannt" ? "unbekannt" : "erteilt",
    });

    return NextResponse.json({
      ok: true,
      gelesen: true,
      dublette: Boolean(karte.dubletteVon),
      karte: {
        id: karte.id,
        zitat: karte.zitat,
        bewertung: karte.bewertung,
        stimmung: karte.stimmung,
        begruendung: karte.begruendung,
        themen: karte.themen,
        datenschutz: karte.datenschutz,
        personenbezug: karte.personenbezug.length,
        status: karte.status,
      },
      hinweis: befund.hinweis || null,
    });
  } catch (f) {
    console.error("[postkarte] Hochladen:", f);
    return NextResponse.json(
      { ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }
}
