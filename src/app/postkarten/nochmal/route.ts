import { NextResponse } from "next/server";

import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";

/**
 * Die letzte Aufnahme verwerfen und neu fotografieren.
 *
 * "es braucht auch einen zurück (bzw. nochmal) button, wenn man mit der
 * aufnahme nicht zufrieden ist! bitte einblenden nach dem scan"
 * (Florian, 02.11.2026).
 *
 * Seit die Karten nachts gelesen werden, sieht beim Scannen niemand
 * mehr, ob das Foto etwas taugt. Verwackelt, Schatten quer über der
 * Schrift, Finger im Bild: Das faellt erst am naechsten Morgen auf,
 * und dann steht die Karte nicht mehr auf dem Tisch.
 *
 * Verworfen wird nur, was noch wartet. Eine gelesene oder gar
 * freigegebene Karte faesst dieser Weg nicht an; dafuer gibt es die
 * Durchsicht im Buero.
 *
 * Geloescht wird nicht: Die Zeile bleibt als "verworfen" stehen. So
 * sieht man spaeter, dass zweimal fotografiert wurde, und die Lesung
 * in der Nacht laesst sie liegen. Eine neue Aufnahme derselben Karte
 * wird dadurch nicht blockiert, die Dublettenpruefung uebergeht
 * Verworfenes.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !["chef", "team", "foyer"].includes(benutzer.rolle)) {
    return NextResponse.json({ ok: false, fehler: "Nicht erlaubt." }, { status: 403 });
  }

  const d = (await request.json().catch(() => ({}))) as { id?: string };
  const id = String(d.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, fehler: "Keine Karte." }, { status: 400 });

  const z = (await db()`
    update postkarte
       set status = 'verworfen',
           batch_id = null,
           notiz = 'Aufnahme verworfen, noch einmal fotografiert'
     where id = ${id}::uuid and status = 'wartet'
     returning id
  `) as Array<{ id: string }>;

  if (z.length === 0) {
    return NextResponse.json(
      { ok: false, fehler: "Diese Aufnahme lässt sich nicht mehr verwerfen, sie wurde schon gelesen." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
