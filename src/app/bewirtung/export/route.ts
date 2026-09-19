import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { belegeDesMonats, monatLesen } from "@/lib/bewirtung/monat";

/**
 * Die Belege eines Monats als CSV fürs Steuerbüro. Semikolon und Komma als
 * Dezimaltrennzeichen, damit Excel sie auf deutschen Rechnern richtig öffnet.
 */

export const dynamic = "force-dynamic";

const betrag = (c: number | null) => ((c ?? 0) / 100).toFixed(2).replace(".", ",");
const feld = (s: string) => `"${s.replace(/"/g, '""').replace(/\r?\n/g, ", ")}"`;

export async function GET(request: Request) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) return new Response("Nicht erlaubt", { status: 401 });
  const m = new URL(request.url).searchParams.get("m") ?? undefined;
  const mo = monatLesen(m);
  if (!mo) return new Response("Monat fehlt", { status: 400 });
  const belege = await belegeDesMonats(mo.jahr, mo.monat);

  const kopf = [
    "Beleg-Nr.", "Datum", "Restaurant", "Anschrift", "Anlass", "Teilnehmer", "Brutto", "USt 7 %", "USt 19 %",
    "Netto", "Trinkgeld", "Abziehbar 70 %", "Nicht abziehbar 30 %", "Zahlart", "Status", "Storno-Grund", "SHA-256 Foto",
  ];
  const zeilen = belege.map((b) => {
    const netto = (b.bruttoCent ?? 0) - b.mwst7Cent - b.mwst19Cent + b.trinkgeldCent;
    const abziehbar = Math.round(netto * 0.7);
    return [
      feld(b.nummer ?? ""), b.datum?.split("-").reverse().join(".") ?? "", feld(b.restaurant), feld(b.anschrift),
      feld(b.anlass), feld(b.teilnehmer), betrag(b.bruttoCent), betrag(b.mwst7Cent), betrag(b.mwst19Cent),
      betrag(netto - b.trinkgeldCent), betrag(b.trinkgeldCent), betrag(abziehbar), betrag(netto - abziehbar),
      feld(b.zahlart), b.status, feld(b.stornoGrund ?? ""), b.fotoHash,
    ].join(";");
  });
  const csv = "﻿" + [kopf.join(";"), ...zeilen].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bewirtung-${m}.csv"`,
    },
  });
}
