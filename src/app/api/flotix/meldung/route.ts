import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { KENNZEICHEN } from "@/lib/flotix/tuer";

/**
 * FloTix meldet, dass sich etwas geändert hat.
 *
 * "diese sollen möglichst schnell ohne delay im Eventmanager auftauchen"
 * (Florian, 20.10.2026). Der Eventmanager holt die Bestellungen bei
 * FloTix ab und speichert die Antwort zwischen, sonst geht jeder
 * Seitenaufruf im Haus einmal nach draußen. Diese Meldung wirft genau
 * diesen Zwischenspeicher weg: Die nächste Einlassliste, die jemand
 * aufschlägt, ist frisch, auch wenn die Buchung zehn Sekunden alt ist.
 *
 * Geschützt über denselben Schlüssel, mit dem der Eventmanager bei FloTix
 * liest (FLOTIX_KEY, Kopf x-eventmanager-key). Ohne Schlüssel in der
 * Umgebung lehnt die Route grundsätzlich ab, statt offen zu stehen.
 *
 * Antworten:
 *   200  Angenommen, Zwischenspeicher weggeworfen.
 *   401  Schlüssel fehlt oder stimmt nicht.
 *   503  Hier ist kein Schlüssel eingerichtet.
 *
 * Bleibt eine Meldung aus, hängt nichts länger als eine Minute hinterher:
 * So lange gilt der Zwischenspeicher auch ohne Meldung.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const erwartet = (process.env.FLOTIX_KEY ?? "").trim();
  if (erwartet.length < 16) {
    return NextResponse.json({ ok: false, fehler: "nicht eingerichtet" }, { status: 503 });
  }

  const mitgebracht = (request.headers.get("x-eventmanager-key") ?? "").trim();
  if (mitgebracht !== erwartet) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  /*
    Was in der Meldung steht, ist nur fürs Protokoll. Entschieden wird
    nichts davon: Der Eventmanager holt sich den neuen Stand selbst bei
    FloTix. So kann eine Meldung auch verloren gehen oder doppelt kommen,
    ohne dass Zahlen falsch werden.
  */
  const inhalt = (await request.json().catch(() => ({}))) as {
    grund?: string;
    bestellung?: string;
  };

  /*
    expire: 0, nicht "max".

    Mit "max" wuerde der naechste Aufruf noch den alten Stand sehen und
    erst im Hintergrund den neuen holen. Genau das soll hier nicht
    passieren: Wer nach der Buchung die Einlassliste aufschlaegt, soll
    den Gast sehen. Das kostet diesen einen Aufruf die Zeit fuer eine
    Abfrage bei FloTix, und das ist es wert. Die Next-Anleitung nennt
    diesen Weg ausdruecklich fuer Meldungen von aussen.
  */
  revalidateTag(KENNZEICHEN, { expire: 0 });
  console.log("[flotix] Meldung:", inhalt.grund ?? "ohne Grund", inhalt.bestellung ?? "");

  return NextResponse.json({ ok: true, grund: inhalt.grund ?? null });
}

/** Zum Nachsehen, ob die Adresse erreichbar ist. Legt nichts ab. */
export function GET() {
  const eingerichtet = (process.env.FLOTIX_KEY ?? "").trim().length > 15;
  return NextResponse.json({ ok: true, eingerichtet });
}
