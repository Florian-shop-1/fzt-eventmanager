import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { datenschutzFreigeben, karteHolen, standSetzen } from "@/lib/postkarte/db";

/**
 * Eine Karte für die Webseite freigeben.
 *
 * Hier kommt die geschwärzte Fassung an, die der Browser aus dem
 * Original und den Schwärzungsrechtecken gezeichnet hat. Erst dieses
 * Bild geht in den öffentlichen Speicher, das Original bleibt in der
 * Datenbank.
 *
 * Zwei Schlösser, und beide müssen auf sein:
 *
 *  - Es muss ein geschwärztes Bild mitkommen. Ohne Bild keine Freigabe,
 *    auch nicht für eine Karte, auf der die KI nichts gefunden hat.
 *  - Ein Mensch muss drücken. Die Bewertung der KI entscheidet nur, was
 *    vorgeschlagen wird, nie, was hinausgeht.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOECHSTENS = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfKaufmaennisches(benutzer.rolle)) {
    return NextResponse.json({ ok: false, fehler: "Nicht erlaubt." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") ?? "").trim();
  const bild = form?.get("geschwaerzt");
  if (!id) return NextResponse.json({ ok: false, fehler: "Keine Karte." }, { status: 400 });
  if (!(bild instanceof File)) {
    return NextResponse.json(
      { ok: false, fehler: "Ohne geschwärztes Bild keine Freigabe." },
      { status: 400 },
    );
  }
  if (bild.size > HOECHSTENS) {
    return NextResponse.json({ ok: false, fehler: "Das Bild ist zu groß." }, { status: 413 });
  }

  const karte = await karteHolen(id);
  if (!karte) return NextResponse.json({ ok: false, fehler: "Diese Karte gibt es nicht." }, { status: 404 });

  /*
    Alte Karten ohne Einwilligung gehen nicht von allein hinaus.

    "Ältere Postkarten ohne gesicherte Veröffentlichungserlaubnis
    zunächst ausschliesslich intern verarbeiten und zur Freigabe
    vormerken" (Florian, 27.10.2026). Freigeben darf sie trotzdem
    jemand, aber nur ausdrücklich, mit gesetztem Haken.
  */
  const trotzdem = String(form?.get("ohne_einwilligung") ?? "") === "ja";
  if (karte.einwilligung !== "erteilt" && !trotzdem) {
    return NextResponse.json(
      {
        ok: false,
        fehler:
          "Für diese Karte liegt keine Einwilligung vor. Freigabe nur mit ausdrücklicher Bestätigung.",
        einwilligungFehlt: true,
      },
      { status: 409 },
    );
  }

  try {
    const inhalt = Buffer.from(await bild.arrayBuffer());
    const abgelegt = await put(`postkarten/${id}.jpg`, inhalt, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: true,
    });

    await datenschutzFreigeben(id, abgelegt.url, benutzer.name);
    await standSetzen(id, "freigegeben");

    return NextResponse.json({ ok: true, bild: abgelegt.url });
  } catch (f) {
    console.error("[postkarte] Freigeben:", f);
    return NextResponse.json(
      { ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }
}
