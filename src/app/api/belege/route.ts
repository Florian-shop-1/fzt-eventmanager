import { NextResponse } from "next/server";
import { postAbholen } from "@/lib/bewirtung/posteingang";
import { automatischZuordnen } from "@/lib/bewirtung/abgleich";
import { postlaufMerken } from "@/lib/bewirtung/eingangsrechnung";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";

/**
 * Holt die Rechnungen aus dem Postfach und legt sie als Belegentwurf an.
 *
 * Zwei Wege hinein: die Uhr bei Vercel mit dem CRON_SECRET, und die
 * Buchhaltung von Hand ueber den Knopf auf der Belegseite. Beide tun
 * dasselbe.
 *
 * Das Postfach wird ausschliesslich gelesen. Es wird nichts beantwortet,
 * verschoben oder geloescht.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  const vonDerUhr = geheimnis && request.headers.get("authorization") === `Bearer ${geheimnis}`;

  if (!vonDerUhr && !darfBuchhaltung(await angemeldeterBenutzer())) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const tage = Number(new URL(request.url).searchParams.get("tage")) || (vonDerUhr ? 3 : 14);

  try {
    const lauf = await postAbholen({ tage, wer: vonDerUhr ? "Posteingang" : "Posteingang (von Hand)" });
    // Was eindeutig zusammengehoert, gleich abhaken (Florian, 30.09.2026).
    const auto = await automatischZuordnen().catch(() => ({ zugeordnet: 0, namen: [] }));
    // Festhalten, dass der Lauf war und was er gefunden hat: Sonst sieht
    // morgens niemand, ob er ueberhaupt lief (Florian, 30.09.2026).
    await postlaufMerken({
      gesehen: lauf.gesehen,
      neu: lauf.neu,
      ohneAnhang: lauf.ohneAnhang,
      fehlerAnzahl: lauf.fehler,
      letzterFehler: lauf.meldungen.join(" | "),
    }).catch(() => undefined);
    console.log(
      `[belege] Posteingang: ${lauf.gesehen} Mails gesehen, ${lauf.neu} neue Belege, ` +
        `${lauf.ohneAnhang} ohne Anhang, ${lauf.fehler} Fehler`,
    );
    return NextResponse.json({ ok: true, ...lauf });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    await postlaufMerken({ gesehen: 0, neu: 0, ohneAnhang: 0, fehlerAnzahl: 1, letzterFehler: meldung }).catch(
      () => undefined,
    );
    console.error("[belege] Posteingang fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
