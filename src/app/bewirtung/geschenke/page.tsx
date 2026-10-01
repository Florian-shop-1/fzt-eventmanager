import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { euro } from "@/lib/bewirtung/db";
import {
  SACHBEZUG_GRENZE_CENT,
  geschenkeDesJahres,
  nachPersonUndMonat,
} from "@/lib/bewirtung/geschenke";

export const metadata = { title: "Geschenke | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const monatName = (m: string) => {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  const [j, mm] = m.split("-").map(Number);
  return `${MONATE[mm - 1]} ${j}`;
};

const datumKurz = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "ohne Datum");

/**
 * Geschenke, getrennt nach Mitarbeitern und Geschäftspartnern.
 *
 * Bei Mitarbeitern zählt die Freigrenze von 50 Euro im Monat je Person.
 * Sie ist eine Freigrenze und kein Freibetrag: Ein Cent darüber macht den
 * ganzen Monatsbetrag steuerpflichtig. Deshalb steht hier je Person und
 * Monat die Summe und nicht nur die Jahressumme (Florian, 01.10.2026).
 */
export default async function GeschenkeSeite({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  if (!darfBuchhaltung(await angemeldeterBenutzer())) redirect("/");
  const { jahr } = await searchParams;

  const jetzt = new Date().getFullYear();
  const j = /^\d{4}$/.test(jahr ?? "") ? Number(jahr) : jetzt;

  const alle = await geschenkeDesJahres(j);
  const mitarbeiter = nachPersonUndMonat(alle);
  const partner = alle.filter((p) => p.art === "partner");

  const summeMitarbeiter = alle
    .filter((p) => p.art === "mitarbeiter")
    .reduce((n, p) => n + p.bruttoCent, 0);
  const summePartner = partner.reduce((n, p) => n + p.bruttoCent, 0);
  const ueber = mitarbeiter.filter((m) => m.ueberGrenze);
  const ohneNamen = mitarbeiter.filter((m) => m.person === "ohne Namen");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Geschenke {j}</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Was an Mitarbeiter und an Geschäftspartner gegangen ist. Bei Mitarbeitern bleiben Sachbezüge
            bis {euro(SACHBEZUG_GRENZE_CENT)} im Monat je Person steuerfrei. Das ist eine Freigrenze: Ein
            Cent darüber macht den ganzen Monatsbetrag steuerpflichtig.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={`/bewirtung/geschenke?jahr=${j - 1}`} className="rounded-md border border-linie px-3 py-1.5">
            {j - 1}
          </Link>
          <Link href={`/bewirtung/geschenke?jahr=${j + 1}`} className="rounded-md border border-linie px-3 py-1.5">
            {j + 1}
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border-2 px-5 py-4" style={{ borderColor: "var(--linie)", background: "var(--flaeche)" }}>
          <div className="text-3xl font-semibold tabular-nums">{euro(summeMitarbeiter)}</div>
          <div className="mt-1 text-sm font-semibold uppercase tracking-wide">an Mitarbeiter</div>
          <div className="text-xs text-leise">{alle.filter((p) => p.art === "mitarbeiter").length} Belege</div>
        </div>
        <div className="rounded-xl border-2 px-5 py-4" style={{ borderColor: "var(--linie)", background: "var(--flaeche)" }}>
          <div className="text-3xl font-semibold tabular-nums">{euro(summePartner)}</div>
          <div className="mt-1 text-sm font-semibold uppercase tracking-wide">an Geschäftspartner</div>
          <div className="text-xs text-leise">{partner.length} Belege</div>
        </div>
        <div
          className="rounded-xl border-2 px-5 py-4"
          style={{
            borderColor: ueber.length ? "var(--warnung)" : "var(--gut)",
            background: ueber.length ? "var(--warnung-hell)" : "var(--gut-hell)",
          }}
        >
          <div
            className="text-3xl font-semibold tabular-nums"
            style={{ color: ueber.length ? "var(--warnung)" : "var(--gut)" }}
          >
            {ueber.length}
          </div>
          <div
            className="mt-1 text-sm font-semibold uppercase tracking-wide"
            style={{ color: ueber.length ? "var(--warnung)" : "var(--gut)" }}
          >
            über der Grenze
          </div>
          <div className="text-xs text-leise">
            {ueber.length ? "Monate, die versteuert werden müssen" : "alles im Rahmen"}
          </div>
        </div>
      </div>

      {ohneNamen.length > 0 && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>Bei einigen Geschenken fehlt der Name.</strong> Ohne Empfänger lässt sich die
          50-Euro-Grenze nicht prüfen. Trag am Beleg nach, für wen es war.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
          Mitarbeiter, je Person und Monat
        </h2>
        {mitarbeiter.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
            In diesem Jahr ist noch kein Geschenk an einen Mitarbeiter erfasst.
          </p>
        ) : (
          <ul className="space-y-2">
            {mitarbeiter.map((m) => (
              <li
                key={`${m.monat}|${m.person}`}
                className="rounded-lg border px-4 py-3 text-sm"
                style={{
                  borderColor: m.ueberGrenze ? "var(--warnung)" : "var(--linie)",
                  background: m.ueberGrenze ? "var(--warnung-hell)" : "var(--flaeche)",
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <strong>{m.person}</strong>{" "}
                    <span className="text-leise">{monatName(m.monat)}</span>
                  </div>
                  <div className="tabular-nums font-semibold" style={m.ueberGrenze ? { color: "var(--warnung)" } : undefined}>
                    {euro(m.summeCent)}
                    {m.ueberGrenze && <span className="ml-2 text-xs">über {euro(SACHBEZUG_GRENZE_CENT)}</span>}
                  </div>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-leise">
                  {m.posten.map((p) => (
                    <li key={p.id}>
                      <Link href={`/bewirtung/${p.id}`} className="underline">
                        {datumKurz(p.datum)} · {p.geschaeft || "ohne Geschäft"} · {euro(p.bruttoCent)}
                      </Link>
                      {p.status === "entwurf" && " (noch Entwurf)"}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {partner.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Geschäftspartner</h2>
          <ul className="space-y-1 text-sm">
            {partner.map((p) => (
              <li key={p.id} className="rounded-lg border border-linie bg-flaeche px-4 py-2">
                <Link href={`/bewirtung/${p.id}`} className="underline">
                  {datumKurz(p.datum)} · {p.fuer || "ohne Empfänger"}
                </Link>
                <span className="text-leise">
                  {" · "}
                  {p.geschaeft || "ohne Geschäft"} · {euro(p.bruttoCent)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
