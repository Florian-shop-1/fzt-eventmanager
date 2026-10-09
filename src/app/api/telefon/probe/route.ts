import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { antworten } from "@/lib/telefon/assistent";
import { gespraechBeginnen, verlaufMerken } from "@/lib/telefon/werkzeuge";

/**
 * Die Probe: mit dem Telefonassistenten reden, ohne Telefon.
 *
 * Dieselbe Mechanik wie beim echten Anruf, nur getippt statt gesprochen.
 * So laesst sich hoeren, ob er klingt wie das Haus, bevor er an eine
 * richtige Nummer darf (Florian, 09.10.2026).
 *
 * Nur fuer das Buero: Was hier laeuft, legt echte Rueckrufe an.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  let daten: { verlauf?: Anthropic.MessageParam[]; gesagt?: string; nummer?: string; gespraechId?: string | null };
  try {
    daten = await request.json();
  } catch {
    return NextResponse.json({ ok: false, fehler: "Keine Daten." }, { status: 400 });
  }

  const gesagt = String(daten.gesagt ?? "").trim().slice(0, 2000);
  if (!gesagt) return NextResponse.json({ ok: false, fehler: "Nichts gesagt." }, { status: 400 });

  const nummer = String(daten.nummer ?? "").trim().slice(0, 40);
  let gespraechId = daten.gespraechId ?? null;
  if (!gespraechId) {
    gespraechId = await gespraechBeginnen({ nummer, kanal: "test" }).catch(() => null);
  }

  try {
    const a = await antworten({
      verlauf: Array.isArray(daten.verlauf) ? daten.verlauf : [],
      gesagt,
      nummer,
      gespraechId,
    });
    if (gespraechId) void verlaufMerken(gespraechId, a.verlauf);
    return NextResponse.json({ ok: true, text: a.text, getan: a.getan, verlauf: a.verlauf, gespraechId });
  } catch (f) {
    console.error("[telefon] Probe fehlgeschlagen:", f);
    return NextResponse.json(
      { ok: false, fehler: f instanceof Error ? f.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }
}
