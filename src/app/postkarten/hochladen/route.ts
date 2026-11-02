import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { fotoAblegen } from "@/lib/postkarte/db";
import { lesenEingerichtet } from "@/lib/postkarte/lesen";

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
    /*
      Nur ablegen, nicht lesen.

      "bitte mach das so, dass du dir die fotos speicherst und dann den
      antrophic scanner wie bei den emojis einfach über nacht nutzt,
      weil es günstiger ist" (Florian, 02.11.2026). Im Batch kostet
      dieselbe Lesung die Haelfte, und gebraucht wird das Ergebnis erst
      am naechsten Tag.

      Fuer das Foyer heisst das: Der Scan ist sofort fertig und kann
      nicht mehr an einem leeren Guthaben scheitern. Wie gut eine Karte
      ist, steht am naechsten Morgen da.
    */
    const inhalt = Buffer.from(await datei.arrayBuffer());
    const abgelegt = await fotoAblegen({
      bild: inhalt,
      bildTyp: datei.type,
      von: benutzer.name,
      einwilligung: einwilligung === "unbekannt" ? "unbekannt" : "erteilt",
    });

    return NextResponse.json({
      ok: true,
      gelesen: true,
      dublette: abgelegt.schonDa,
      wartet: !abgelegt.schonDa,
      karte: { id: abgelegt.id },
      hinweis: null,
    });
  } catch (f) {
    console.error("[postkarte] Hochladen:", f);
    return NextResponse.json(
      { ok: false, fehler: lesbarerFehler(f) },
      { status: 500 },
    );
  }
}

/**
 * Aus einem Fehler des Lesedienstes einen Satz machen, den man versteht.
 *
 * "der scanner hat wohl probleme.. muss ich was aufladen bei
 * antrophic?" (Florian, 02.11.2026). Im Foyer stand funfmal
 * untereinander ein 400er mit JSON und einer request_id. Darin steckte
 * die Antwort, nur eben auf Englisch und zwischen geschweiften
 * Klammern: Das Guthaben war leer.
 *
 * Wer am Tablet steht, soll lesen, was zu tun ist, nicht die Antwort
 * eines fremden Servers.
 */
function lesbarerFehler(f: unknown): string {
  const roh = f instanceof Error ? f.message : String(f ?? "");
  if (/credit balance is too low|insufficient_quota|billing/i.test(roh)) {
    return "Das Guthaben beim Lesedienst ist aufgebraucht. Bitte im Büro Bescheid geben, "
      + "dann wird es aufgeladen. Die Karten bitte liegen lassen, sie gehen nicht verloren.";
  }
  if (/rate.?limit|429|overloaded/i.test(roh)) {
    return "Der Lesedienst ist gerade überlastet. Bitte in einer Minute noch einmal versuchen.";
  }
  if (/api.?key|authentication|401|403/i.test(roh)) {
    return "Der Zugang zum Lesedienst stimmt nicht. Bitte im Büro Bescheid geben.";
  }
  return roh || "Unbekannter Fehler";
}
