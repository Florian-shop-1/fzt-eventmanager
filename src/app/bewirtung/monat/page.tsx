import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { euro, nachZahlweg, summen, vorkommendeGesellschaften, type Bewirtung } from "@/lib/bewirtung/db";
import { gesellschaftKurz, gesellschaftName, type Gesellschaft } from "@/lib/bewirtung/gesellschaft";
import { belegeDesMonats, monatLesen } from "@/lib/bewirtung/monat";
import { BewirtungsBlatt } from "@/components/BewirtungsBlatt";
import { DruckKnopf } from "@/components/DruckKnopf";

export const metadata = { title: "Bewirtung Monat | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Alles für einen Monat, so wie es ans Steuerbüro geht: je Firma eine
 * eigene Aufstellung mit Summen, danach je Beleg eine Seite mit Angaben
 * und Foto. Im Browser "Als PDF speichern" ergibt die Datei fürs
 * Steuerbüro.
 *
 * Die Firmen werden nirgends vermischt (Florian, 29.09.2026): Das
 * Theater, die Magic-Expert GbR und die True Talent GmbH führen getrennte
 * Bücher, und jede Aufstellung beginnt auf einer neuen Seite. Wer nur
 * eine Firma braucht, lädt sie unten einzeln als Tabelle herunter.
 */
export default async function MonatSeite({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) redirect("/");
  const { m } = await searchParams;
  const mo = monatLesen(m);
  if (!mo) redirect("/bewirtung");
  const alle = await belegeDesMonats(mo.jahr, mo.monat);
  const firmen = vorkommendeGesellschaften(alle);
  const titel = `Belege ${MONATE[mo.monat - 1]} ${mo.jahr}`;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/bewirtung?jahr=${mo.jahr}`} className="text-sm text-leise underline">
          zurück zur Übersicht
        </Link>
        <DruckKnopf text="Drucken oder als PDF speichern" hinweis="je Firma eine eigene Aufstellung" />
      </div>

      {firmen.length === 0 && (
        <p className="text-sm text-leise">In diesem Monat gibt es keine festgeschriebenen Belege.</p>
      )}

      {firmen.map((g, i) => (
        <Firmenblock
          key={g}
          g={g}
          belege={alle.filter((b) => b.gesellschaft === g)}
          titel={titel}
          monat={m ?? ""}
          ersteSeite={i === 0}
        />
      ))}
    </div>
  );
}

/** Die vollständige Aufstellung einer Firma, ab einer neuen Seite. */
function Firmenblock({
  g,
  belege,
  titel,
  monat,
  ersteSeite,
}: {
  g: Gesellschaft;
  belege: Bewirtung[];
  titel: string;
  monat: string;
  ersteSeite: boolean;
}) {
  const s = summen(belege, "bewirtung", g);
  const e = summen(belege, "einkauf", g);
  const zw = nachZahlweg(belege, g);

  return (
    <div className="space-y-8" style={ersteSeite ? undefined : { breakBefore: "page" }}>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{titel}</h1>
            <p className="mt-1 text-sm text-leise">{gesellschaftName(g)}</p>
          </div>
          <a href={`/bewirtung/export?m=${monat}&g=${g}`} className="text-sm underline print:hidden">
            CSV {gesellschaftKurz(g)}
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-linie text-left text-xs text-leise">
              <tr>
                <th className="py-1.5">Nr.</th>
                <th className="py-1.5">Datum</th>
                <th className="py-1.5">Art</th>
                <th className="py-1.5">Geschäft</th>
                <th className="py-1.5">Anlass bzw. Zweck</th>
                <th className="py-1.5">Bezahlt</th>
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
                  <td className="py-1.5">{b.art === "einkauf" ? `Einkauf${b.kategorie ? `, ${b.kategorie}` : ""}` : "Bewirtung"}</td>
                  <td className="py-1.5">{b.restaurant}</td>
                  <td className="py-1.5">{b.art === "einkauf" ? b.zweck : b.anlass}</td>
                  <td className="py-1.5">{b.zahlweg === "bar" ? "bar" : "Karte"}{b.privatAusgelegt ? ", privat" : ""}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(b.bruttoCent)}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(b.mwst7Cent + b.mwst19Cent)}</td>
                  <td className="py-1.5 text-right tabular-nums">{euro(b.trinkgeldCent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-leise">Einkäufe</h2>
        <dl className="mt-2 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-leise">Belege (ohne Stornos)</dt>
          <dd className="text-right">{e.anzahl}</dd>
          <dt className="text-leise">Beträge brutto</dt>
          <dd className="text-right tabular-nums">{euro(e.bruttoCent)}</dd>
          <dt className="text-leise">darin Vorsteuer</dt>
          <dd className="text-right tabular-nums">{euro(e.vorsteuerCent)}</dd>
          <dt className="font-medium">netto, voll abziehbar</dt>
          <dd className="text-right font-medium tabular-nums">{euro(e.abziehbarCent)}</dd>
        </dl>
        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-leise">Bezahlt</h2>
        <dl className="mt-2 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-leise">mit Karte</dt>
          <dd className="text-right tabular-nums">{euro(zw.karte)}</dd>
          <dt className="text-leise">bar</dt>
          <dd className="text-right tabular-nums">{euro(zw.bar)}</dd>
          <dt className="font-medium">privat ausgelegt, zu erstatten</dt>
          <dd className="text-right font-medium tabular-nums">{euro(zw.privat)}</dd>
        </dl>
        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-leise">Bewirtungen</h2>
        <dl className="mt-2 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
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
