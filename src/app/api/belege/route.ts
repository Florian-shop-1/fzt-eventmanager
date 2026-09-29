import { NextResponse } from "next/server";
import { postAbholen } from "@/lib/bewirtung/posteingang";
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
    console.log(
      `[belege] Posteingang: ${lauf.gesehen} Mails gesehen, ${lauf.neu} neue Belege, ` +
        `${lauf.ohneAnhang} ohne Anhang, ${lauf.fehler} Fehler`,
    );
    return NextResponse.json({ ok: true, ...lauf });
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    console.error("[belege] Posteingang fehlgeschlagen:", meldung);
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
