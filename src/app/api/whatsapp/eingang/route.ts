import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ereignisseLesen } from "@/lib/whatsapp/eingang";
import { ereignisseSpeichern } from "@/lib/db/whatsapp";
import { unterschriftStimmt } from "@/lib/whatsapp/unterschrift";
import { nachEingang } from "@/lib/whatsapp/nachlauf";

/**
 * Hier liefert Meta jede WhatsApp-Nachricht ab.
 *
 * Kein Mensch meldet sich an, deshalb steht die Adresse im Proxy bei den
 * offenen Seiten. Geschützt ist sie auf zwei Wegen:
 *
 *  GET   Beim Eintragen des Webhooks fragt Meta einmal das Prüfwort ab und
 *        erwartet die mitgeschickte Zahl zurück. Ohne das richtige Wort
 *        lässt sich hier nichts anmelden.
 *
 *  POST  Jedes Päckchen trägt eine Unterschrift mit dem App-Geheimnis.
 *        Stimmt sie nicht, wird es abgelehnt. Ohne gesetztes Geheimnis
 *        nimmt die Route grundsätzlich nichts an, statt versehentlich offen
 *        zu stehen.
 *
 * Ein Fehler beim Speichern antwortet mit 500. Dann wiederholt Meta die
 * Zustellung, und weil jede Nachricht nur einmal gespeichert wird, schadet
 * das nicht. Ein kaputtes Päckchen dagegen bekommt 200, sonst käme es
 * immer wieder.
 */

export const dynamic = "force-dynamic";

const HOECHSTENS_BYTES = 1_000_000;

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  const parameter = new URL(request.url).searchParams;
  const pruefwort = process.env.WHATSAPP_PRUEFWORT;

  if (
    pruefwort &&
    parameter.get("hub.mode") === "subscribe" &&
    gleich(parameter.get("hub.verify_token") ?? "", pruefwort)
  ) {
    // Meta will genau die Zahl zurück, als reinen Text.
    return new Response(parameter.get("hub.challenge") ?? "", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(request: Request) {
  const koerper = Buffer.from(await request.arrayBuffer());
  if (koerper.length > HOECHSTENS_BYTES) {
    return NextResponse.json({ ok: false, fehler: "zu gross" }, { status: 413 });
  }

  if (
    !unterschriftStimmt(
      koerper,
      request.headers.get("x-hub-signature-256"),
      process.env.WHATSAPP_APP_GEHEIMNIS,
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let paeckchen: unknown;
  try {
    paeckchen = JSON.parse(koerper.toString("utf8"));
  } catch {
    return NextResponse.json({ ok: true, hinweis: "kein JSON, übergangen" });
  }

  const ereignisse = ereignisseLesen(paeckchen);

  try {
    const neue = await ereignisseSpeichern(ereignisse);
    // Mail und automatische Antwort erst, wenn Meta seine Antwort hat.
    if (neue.length > 0) after(() => nachEingang(neue));
  } catch (e) {
    console.error("WhatsApp-Eingang nicht gespeichert:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ereignisse: ereignisse.length });
}
