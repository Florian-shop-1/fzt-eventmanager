/**
 * Das Angebot als PDF herunterladen.
 *
 * Zwei Wege hinein:
 *  - `?id=` für das Büro, angemeldet. So sieht man vor dem Versand, was
 *    beim Kunden ankommt.
 *  - `?token=` mit dem Schlüssel aus dem Kundenlink. Damit kann der Kunde
 *    sein Angebot auch aus der Webansicht heraus speichern, ohne dass
 *    jemand ihm etwas schicken muss.
 *
 * `?probe=1` zeigt ein Musterangebot mit erfundenen Daten. Das ist zum
 * Anschauen des Layouts da, ohne dass ein echter Vorgang nötig ist
 * (Florian, 25.09.2026).
 */

import { holeAngebot, holeAngebotFuerKunden } from "@/lib/angebot/lesen";
import { angebotsPdf, type AngebotsPdfDaten } from "@/lib/angebot/pdf";
import { pdfDatenAusAngebot, pdfDateiname, probeAngebot } from "@/lib/angebot/pdfdaten";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(anfrage: Request): Promise<Response> {
  const adresse = new URL(anfrage.url);
  const id = adresse.searchParams.get("id");
  const token = adresse.searchParams.get("token");
  const probe = adresse.searchParams.get("probe");

  let daten: AngebotsPdfDaten | null = null;

  if (probe) {
    const benutzer = await angemeldeterBenutzer();
    if (!benutzer) return new Response("Nicht angemeldet.", { status: 401 });
    daten = await probeAngebot();
  } else if (id) {
    const benutzer = await angemeldeterBenutzer();
    if (!benutzer) return new Response("Nicht angemeldet.", { status: 401 });
    const a = await holeAngebot(id);
    if (!a) return new Response("Angebot nicht gefunden.", { status: 404 });
    daten = await pdfDatenAusAngebot(a);
  } else if (token) {
    // Der Kundenweg zählt als Öffnung, genau wie die Webansicht.
    const a = await holeAngebotFuerKunden(token, "PDF");
    if (!a) return new Response("Angebot nicht gefunden.", { status: 404 });
    daten = await pdfDatenAusAngebot(a);
  } else {
    return new Response("Kein Angebot angegeben.", { status: 400 });
  }

  const pdf = await angebotsPdf(daten);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfDateiname(daten.nummer)}"`,
      "Cache-Control": "no-store",
    },
  });
}
