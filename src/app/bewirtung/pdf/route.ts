/**
 * Die Belege eines Monats als PDF, für genau eine Firma.
 *
 * `?m=2026-09&g=true-talent`. Dieselbe Datei, die auch der Mail ans
 * Steuerbüro anhängt: Aufstellung, dann je Beleg eine Seite mit Foto.
 */

import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { gesellschaftKurz, istGesellschaft } from "@/lib/bewirtung/gesellschaft";
import { belegeDerFirma, fotosZu, monatLesen } from "@/lib/bewirtung/monat";
import { belegeMonatsPdf } from "@/lib/bewirtung/pdf-monat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export async function GET(anfrage: Request): Promise<Response> {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) return new Response("Nicht erlaubt", { status: 401 });

  const adresse = new URL(anfrage.url);
  const m = adresse.searchParams.get("m") ?? undefined;
  const mo = monatLesen(m);
  if (!mo) return new Response("Monat fehlt", { status: 400 });

  const g = adresse.searchParams.get("g");
  if (!istGesellschaft(g)) return new Response("Firma fehlt", { status: 400 });

  const belege = await belegeDerFirma(mo.jahr, mo.monat, g);
  const pdf = await belegeMonatsPdf({
    gesellschaft: g,
    monatName: `${MONATE[mo.monat - 1]} ${mo.jahr}`,
    belege,
    fotos: await fotosZu(belege),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="belege-${gesellschaftKurz(g).replace(/[^A-Za-z0-9-]/g, "")}-${m}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
