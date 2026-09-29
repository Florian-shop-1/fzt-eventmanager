/**
 * Die Stundenmeldung herunterladen: als PDF oder als Tabelle.
 *
 * `?zeitraum=2026-10&was=pdf|summen|protokoll`. Nur für die Leute, die
 * die Arbeitszeiten ohnehin sehen dürfen: Was hier herausgeht, sind
 * Namen und Arbeitszeiten von Mitarbeitern.
 */

import { angemeldeterBenutzer, darfZeitenAendern } from "@/lib/auth/sitzung";
import { angebotsAbsender } from "@/lib/angebot/pdfdaten";
import { zeitenImZeitraum } from "@/lib/lohn/auswertung";
import { dateiname, protokollListe, summenListe } from "@/lib/lohn/liste";
import { meldungLesen } from "@/lib/lohn/meldung";
import { lohnPdf } from "@/lib/lohn/pdf";
import { istZeitraumSchluessel, laufenderZeitraum, zeitraumVon } from "@/lib/lohn/zeitraum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(anfrage: Request): Promise<Response> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return new Response("Nicht angemeldet.", { status: 401 });
  if (!darfZeitenAendern(benutzer)) {
    return new Response("Arbeitszeiten sehen nur Werner, Kevin und Florian.", { status: 403 });
  }

  const adresse = new URL(anfrage.url);
  const roh = adresse.searchParams.get("zeitraum");
  const z = istZeitraumSchluessel(roh) ? zeitraumVon(roh) : laufenderZeitraum();
  const was = adresse.searchParams.get("was") ?? "pdf";

  const leute = await zeitenImZeitraum(z);

  if (was === "summen" || was === "protokoll") {
    const inhalt = was === "summen" ? summenListe(z, leute) : protokollListe(z, leute);
    return new Response(inhalt, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dateiname(z, was === "summen" ? "Liste" : "Protokoll", "csv")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const meldung = await meldungLesen(z.schluessel);
  const pdf = await lohnPdf({
    zeitraum: z,
    leute,
    absender: await angebotsAbsender(),
    bestaetigtVon: meldung.bestaetigtVon,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${dateiname(z, "Meldung", "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
