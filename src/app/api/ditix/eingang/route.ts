import { NextResponse } from "next/server";
import { angemeldeterBenutzer, darfGeld } from "@/lib/auth/sitzung";
import { letzteMeldungen, uebersicht } from "@/lib/db/ditix-eingang";

/**
 * Die mitgeschriebenen Ditix-Meldungen ansehen (angemeldet).
 *
 *   /api/ditix/eingang              die letzten 20 Meldungen im Wortlaut
 *   /api/ditix/eingang?limit=100    mehr davon (höchstens 200)
 *   /api/ditix/eingang?kurz=1       nur Kennungen: Zeit, Art, Bestellnummer,
 *                                   message_id. Genau das, was man mit der
 *                                   Ausführungsliste von Make abgleicht.
 *   /api/ditix/eingang?struktur=1   wie die Meldungen aufgebaut sind: alle
 *                                   Felder mit Typ und Häufigkeit
 *
 * In den Meldungen stehen Namen, Adressen und Beträge. Deshalb gilt dieselbe
 * Regel wie für alles, wo Geld steht (darfGeld): nur die drei Personen, die
 * Florian dafür bestimmt hat, auch keine Externen mit Büro-Rolle.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const b = await angemeldeterBenutzer();
  if (!b || !darfGeld(b)) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const adresse = new URL(request.url);
  const limit = Number(adresse.searchParams.get("limit")) || 20;

  try {
    if (adresse.searchParams.get("struktur")) {
      return NextResponse.json({ ok: true, ...(await uebersicht(Math.max(limit, 200))) });
    }

    const liste = await letzteMeldungen(limit);
    if (adresse.searchParams.get("kurz")) {
      return NextResponse.json({
        ok: true,
        anzahl: liste.length,
        meldungen: liste.map((m) => ({
          empfangenAm: m.empfangenAm,
          art: m.eventType,
          bestellung: m.orderId,
          nachrichtId: m.nachrichtId,
          mal: m.mal,
        })),
      });
    }
    return NextResponse.json({ ok: true, anzahl: liste.length, meldungen: liste });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : "Unbekannter Fehler";
    return NextResponse.json({ ok: false, fehler: meldung }, { status: 500 });
  }
}
