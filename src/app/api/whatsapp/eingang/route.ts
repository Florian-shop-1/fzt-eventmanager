import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ereignisseLesen } from "@/lib/whatsapp/eingang";
import { ereignisseSpeichern } from "@/lib/db/whatsapp";

/**
 * Hier liefert 360dialog jede WhatsApp-Nachricht ab.
 *
 * Kein Mensch meldet sich an, deshalb steht die Adresse im Proxy bei den
 * offenen Seiten. Geschützt ist sie über einen eigenen Schlüssel, den
 * 360dialog als Kopfzeile mitschickt. Eingetragen wird er dort über den
 * Knopf unter Einstellungen, WhatsApp. Ohne gesetzten Schlüssel nimmt die
 * Route grundsätzlich nichts an, statt versehentlich offen zu stehen.
 *
 * Ein Fehler beim Speichern antwortet mit 500. Dann wiederholt 360dialog
 * die Zustellung, und weil jede Nachricht nur einmal gespeichert wird,
 * schadet das nicht. Ein kaputtes Päckchen dagegen bekommt 200, sonst
 * käme es einen Tag lang immer wieder.
 */

export const dynamic = "force-dynamic";

const HOECHSTENS_BYTES = 1_000_000;

function istErlaubt(request: Request): boolean {
  const erwartet = process.env.WHATSAPP_WEBHOOK_SCHLUESSEL;
  const gesendet = request.headers.get("x-fzt-schluessel");
  if (!erwartet || !gesendet) return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(gesendet);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const roh = await request.text();
  if (roh.length > HOECHSTENS_BYTES) {
    return NextResponse.json({ ok: false, fehler: "zu gross" }, { status: 413 });
  }

  let paeckchen: unknown;
  try {
    paeckchen = JSON.parse(roh);
  } catch {
    return NextResponse.json({ ok: true, hinweis: "kein JSON, übergangen" });
  }

  const ereignisse = ereignisseLesen(paeckchen);

  try {
    await ereignisseSpeichern(ereignisse);
  } catch (e) {
    console.error("WhatsApp-Eingang nicht gespeichert:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ereignisse: ereignisse.length });
}
