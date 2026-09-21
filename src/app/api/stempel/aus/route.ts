import { NextResponse } from "next/server";
import { benutzerZuSchluessel, standVon } from "@/lib/stempel/db";
import { automatischAusstempeln } from "@/lib/stempel/wache";

/**
 * Ausstempeln über den persönlichen Schlüssel, ohne Anmeldung.
 *
 * Damit löst das Handy den Feierabend selbst aus: Auf dem iPhone über
 * einen Kurzbefehl ("Wenn ich diesen Ort verlasse, Inhalte von URL
 * abrufen"), auf Android über eine Automation. Das ist der einzige Weg,
 * der auch dann noch greift, wenn der Eventmanager längst zu ist: Eine
 * Webseite darf im Hintergrund kein GPS lesen, das Betriebssystem schon.
 *
 * Bewusst nur Ausstempeln. Einstempeln bleibt an den geprüften Standort
 * gebunden, sonst könnte man sich vom Sofa aus zur Arbeit melden.
 *
 * Kommt der Aufruf, obwohl jemand gar nicht eingestempelt ist, passiert
 * nichts. Das ist der Normalfall: Der Kurzbefehl läuft jedes Mal, wenn
 * das Handy das Gelände verlässt, auch an freien Tagen.
 */

export const dynamic = "force-dynamic";

async function ausstempeln(token: string) {
  const b = await benutzerZuSchluessel(token);
  if (!b) {
    return NextResponse.json(
      { ok: false, text: "Dieser Schlüssel gilt nicht mehr. Bitte im Eventmanager einen neuen holen." },
      { status: 403 },
    );
  }

  const stand = await standVon(b.id);
  if (stand.zustand === "aus") {
    return NextResponse.json({ ok: true, gestempelt: false, text: "Du warst nicht eingestempelt." });
  }

  await automatischAusstempeln({ benutzerId: b.id, name: b.name, grund: "kurzbefehl" });
  const uhr = new Date().toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  });
  return NextResponse.json({ ok: true, gestempelt: true, text: `Ausgestempelt um ${uhr} Uhr. Schönen Feierabend!` });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  return ausstempeln(token);
}

/** Manche Automationen schicken lieber POST. Beides ist recht. */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  return ausstempeln(token);
}
