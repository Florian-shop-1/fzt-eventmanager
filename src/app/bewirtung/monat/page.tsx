import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { euro, summen } from "@/lib/bewirtung/db";
import { belegeDesMonats, monatLesen } from "@/lib/bewirtung/monat";
import { BewirtungsBlatt } from "@/components/BewirtungsBlatt";
import { DruckKnopf } from "@/components/DruckKnopf";

export const metadata = { title: "Bewirtung Monat | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Alles für einen Monat, so wie es ans Steuerbüro geht: vorne die
 * Aufstellung mit Summen, danach je Beleg eine Seite mit Angaben und Foto.
 * Im Browser "Als PDF speichern" ergibt die Datei fürs Steuerbüro.
 */
export default async function MonatSeite({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) redirect("/");
  const { m } = await searchParams;
  const mo = monatLesen(m);
  if (!mo) redirect("/bewirtung");
  const belege = await belegeDesMonats(mo.jahr, mo.monat);
  const s = summen(belege);
  const titel = `Bewirtungsbelege ${MONATE[mo.monat - 1]} ${mo.jahr}`;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/bewirtung?jahr=${mo.jahr}`} className="text-sm text-leise underline">
          zurück zur Übersicht
        </Link>
        <span className="flex items-center gap-4">
          <a href={`/bewirtung/export?m=${m}`} className="text-sm underline">
            CSV herunterladen
          </a>
          <DruckKnopf text="Drucken oder als PDF speichern" hinweis="je Beleg eine Seite" />
        </span>
      </div>

      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{titel}</h1>
        <p className="mt-1 text-sm text-leise">Florian Zimmer Theater GmbH, Neu-Ulm</p>
        <div className="overflow-x-auto">
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-linie text-left text-xs text-leise">
              <tr>
                <th className="py-1.5">Nr.</th>
                <th className="py-1.5">Datum</th>
                <th className="py-1.5">Restaurant</th>
                <th className="py-1.5">Anlass</th>
                <th className="py-1.5 text-right">Brutto</th>
                <th className="py-1.5 text-right">USt</th>
                <th className="py-1.5 text-right">Trinkgeld</th>
              </tr>
            </thead>
            <tbody>
              {belege.map((b) => (
                <tr key={b.id} className={`border-b border-linie align-top ${b.status === "storniert" ? "text-leise line-through" : ""}`}>
                  <td className="py-1.5 font-mono text-xs">{b.nummer}</td>
                  <td className="py-1.5 tabular-nums">{b.datum?.split("-").reverse().join(".")}</td>
                  <td className="py-1.5">{b.restaurant}</td>
                  <td className="py-1.5">{b.anlass}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(b.bruttoCent)}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(b.mwst7Cent + b.mwst19Cent)}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(b.trinkgeldCent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-leise">Belege (ohne Stornos)</dt>
          <dd className="text-right">{s.anzahl}</dd>
          <dt className="text-leise">Rechnungsbeträge brutto</dt>
          <dd className="text-right tabular-nums">{euro(s.bruttoCent)}</dd>
          <dt className="text-leise">darin Vorsteuer</dt>
          <dd className="text-right tabular-nums">{euro(s.vorsteuerCent)}</dd>
          <dt className="text-leise">Trinkgeld</dt>
          <dd className="text-right tabular-nums">{euro(s.trinkgeldCent)}</dd>
          <dt className="text-leise">Netto inkl. Trinkgeld</dt>
          <dd className="text-right tabular-nums">{euro(s.nettoCent)}</dd>
          <dt className="font-medium">davon abziehbar (70 %)</dt>
          <dd className="text-right font-medium tabular-nums">{euro(s.abziehbarCent)}</dd>
          <dt className="text-leise">nicht abziehbar (30 %)</dt>
          <dd className="text-right tabular-nums">{euro(s.nichtAbziehbarCent)}</dd>
        </dl>
      </section>

      {belege.map((b) => (
        <div key={b.id} className="border-t border-linie pt-8" style={{ breakBefore: "page" }}>
          <BewirtungsBlatt b={b} />
        </div>
      ))}
    </div>
  );
}
