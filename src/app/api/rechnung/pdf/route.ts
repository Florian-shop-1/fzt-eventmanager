/**
 * Die Rechnung als PDF herunterladen.
 *
 * `?id=` für das Büro, angemeldet. `?token=` mit dem Schlüssel aus dem
 * Kundenlink; dieser Aufruf wird als erste Öffnung vermerkt, damit man
 * vor dem Nachfassen weiß, ob die Rechnung angekommen ist.
 */

import { rechnungsPdfEvent } from "@/lib/rechnung/pdf-event";
import {
  rechnungsDateiname,
  rechnungsPdfDaten,
  rechnungsPdfDatenFuerKunden,
} from "@/lib/rechnung/pdfdaten";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(anfrage: Request): Promise<Response> {
  const adresse = new URL(anfrage.url);
  const id = adresse.searchParams.get("id");
  const token = adresse.searchParams.get("token");

  let daten = null;

  if (id) {
    const benutzer = await angemeldeterBenutzer();
    if (!benutzer) return new Response("Nicht angemeldet.", { status: 401 });
    daten = await rechnungsPdfDaten(id);
  } else if (token) {
    daten = await rechnungsPdfDatenFuerKunden(token);
  } else {
    return new Response("Keine Rechnung angegeben.", { status: 400 });
  }

  if (!daten) {
    return new Response("Diese Rechnung gibt es nicht, oder sie hat keine Positionen.", {
      status: 404,
    });
  }

  const pdf = await rechnungsPdfEvent(daten);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${rechnungsDateiname(daten.nummer)}"`,
      "Cache-Control": "no-store",
    },
  });
}
