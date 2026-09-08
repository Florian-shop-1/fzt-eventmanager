import { NextResponse } from "next/server";
import { taeglicherLauf } from "@/lib/mail/vorfreudelauf";

/**
 * Der Auslöser für den täglichen Versand.
 *
 * Wird von der Uhr bei Vercel gerufen (siehe vercel.json). Vercel schickt dabei
 * "Authorization: Bearer <CRON_SECRET>" mit; ohne diesen Nachweis passiert hier
 * nichts. Eine offene Adresse, die Mails an Gäste auslöst, wäre ein Geschenk an
 * jeden, der sie findet.
 *
 * Bewusst eine eigene Adresse und nicht Teil einer Seite: Ein Lauf, der an
 * einem Seitenaufruf hängt, läuft irgendwann versehentlich zweimal oder gar
 * nicht.
 *
 * Von Hand anstoßen geht im Programm unter /vorfreude. Dort sieht man vorher,
 * wen es treffen würde.
 */

export const dynamic = "force-dynamic";
// Der Lauf spricht mit dem Shop und mit Microsoft, für jede Buchung einzeln.
export const maxDuration = 300;

function istErlaubt(request: Request): boolean {
  const geheimnis = process.env.CRON_SECRET;
  // Ohne hinterlegtes Geheimnis bleibt die Adresse zu. Lieber verschickt
  // niemand Mails, als dass es jeder kann.
  if (!geheimnis) return false;
  return request.headers.get("authorization") === `Bearer ${geheimnis}`;
}

export async function GET(request: Request) {
  if (!istErlaubt(request)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  try {
    const ergebnis = await taeglicherLauf();
    // Landet in den Vercel-Logs. Wenn morgens jemand fragt, ob die Mails raus
    // sind, steht die Antwort dort.
    console.log(
      `[vorfreude] ${ergebnis.datum}: ${ergebnis.verschickt.length} verschickt, ` +
        `${ergebnis.uebersprungen.length} übersprungen, ${ergebnis.fehler.length} Fehler`,
    );
    return NextResponse.json({ ok: true, ...ergebnis });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[vorfreude] Lauf fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
