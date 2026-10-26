import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { karteAblegen, karteStand, schonUebertragen } from "@/lib/visitenkarte/db";
import { karteNachBrevo } from "@/lib/visitenkarte/brevo";
import { lesenEingerichtet, visitenkarteLesen } from "@/lib/visitenkarte/lesen";

/**
 * Nimmt das Foto einer Visitenkarte entgegen, liest sie und schickt sie
 * weiter.
 *
 * Gelesen wird sofort, nicht über Nacht: Florian steht mit der Karte in
 * der Hand da und will wissen, ob sie angekommen ist. Übertragen wird
 * ebenfalls sofort, ohne Knopfdruck (Florian, 25.10.2026). Was dabei
 * nicht durchgeht, bleibt im Eventmanager liegen und fällt dort auf.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOECHSTENS = 6 * 1024 * 1024;

export async function POST(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfKaufmaennisches(benutzer.rolle)) {
    return NextResponse.json({ ok: false, fehler: "Nicht erlaubt." }, { status: 403 });
  }
  if (!lesenEingerichtet()) {
    return NextResponse.json({ ok: false, fehler: "Zum Lesen fehlt der Schlüssel." }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const datei = form?.get("foto");
  if (!(datei instanceof File)) return NextResponse.json({ ok: false, fehler: "Kein Foto." }, { status: 400 });
  if (datei.size > HOECHSTENS) return NextResponse.json({ ok: false, fehler: "Das Foto ist zu groß." }, { status: 413 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(datei.type)) {
    return NextResponse.json({ ok: false, fehler: "Bitte ein Foto als JPEG oder PNG." }, { status: 415 });
  }

  try {
    const inhalt = Buffer.from(await datei.arrayBuffer());
    const daten = await visitenkarteLesen(inhalt.toString("base64"), datei.type);

    if (!daten.karteOk) {
      return NextResponse.json({
        ok: true,
        gelesen: false,
        hinweis: daten.hinweis || "Darauf ist keine Visitenkarte zu erkennen.",
      });
    }

    /*
      Das Foto bleibt liegen, bis jemand die Karte übernommen hat.

      Wer eine E-Mail-Adresse prüft, muss die Karte sehen. Erst danach ist
      das Bild entbehrlich, und wir räumen es weg.
    */
    const abgelegt = await put(`visitenkarten/${Date.now()}.jpg`, inhalt, {
      access: "public",
      contentType: datei.type,
      addRandomSuffix: true,
    });

    const karte = await karteAblegen({ daten, bildUrl: abgelegt.url, von: benutzer.name });
    const doppelt = daten.email ? await schonUebertragen(daten.email) : false;

    /*
      Sofort nach Brevo, ohne Knopf.

      "der einzige grund für den scan ist ja, dass wir die daten in
      brevo haben. also keine hürden bauen, die vergessen werden
      könnten" (Florian, 25.10.2026).

      Deshalb geht die Karte selbst hinaus, sobald eine brauchbare
      Adresse daraufsteht. Die Liste im Eventmanager ist danach kein
      Posteingang mehr, sondern eine Kontrolle: Wer etwas falsch
      gelesen sieht, berichtigt es dort, und die Berichtigung geht
      noch einmal an Brevo.

      Liegengeblieben wird nur, was wirklich niemand verschicken
      kann: keine Adresse auf der Karte, oder Brevo lehnt ab.
    */
    let uebertragen = false;
    let meldung = "";
    if (doppelt) {
      await karteStand(karte.id, "verworfen", "Diese Adresse stand schon in den Magic News.");
      meldung = "steht schon in den Magic News";
    } else {
      const ergebnis = await karteNachBrevo(karte);
      uebertragen = ergebnis.ok;
      meldung = ergebnis.meldung;
      await karteStand(karte.id, ergebnis.ok ? "uebertragen" : "neu", ergebnis.ok ? "" : ergebnis.meldung);
    }

    return NextResponse.json({
      ok: true,
      gelesen: true,
      doppelt,
      uebertragen,
      meldung,
      karte: {
        id: karte.id,
        name: [karte.vorname, karte.nachname].filter(Boolean).join(" "),
        firma: karte.firma,
        email: karte.email,
        sicherheit: karte.sicherheit,
      },
      hinweis: daten.hinweis || null,
    });
  } catch (f) {
    console.error("[visitenkarte] Hochladen:", f);
    return NextResponse.json(
      { ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }
}
