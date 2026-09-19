import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { bewirtungenDesJahres, euro, summen, type Bewirtung } from "@/lib/bewirtung/db";
import { BelegScanner } from "@/components/BelegScanner";

export const metadata = { title: "Bewirtung | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function datumKurz(iso: string | null): string {
  if (!iso) return "ohne Datum";
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/**
 * Bewirtungsbelege: scannen, ergänzen, festschreiben, aufaddieren.
 * Nur Florian und die Buchhaltung (sein Vater).
 */
export default async function BewirtungSeite({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) redirect("/");
  const { jahr: jahrRoh, meldung } = await searchParams;
  const diesesJahr = new Date().getFullYear();
  const jahr = Number(jahrRoh) >= 2020 && Number(jahrRoh) <= diesesJahr + 1 ? Number(jahrRoh) : diesesJahr;

  const alle = await bewirtungenDesJahres(jahr);
  const entwuerfe = alle.filter((x) => x.status === "entwurf");
  const belege = alle.filter((x) => x.status !== "entwurf");
  const s = summen(belege);

  const jeMonat = new Map<number, Bewirtung[]>();
  for (const x of belege) {
    const m = x.datum ? Number(x.datum.slice(5, 7)) : 0;
    jeMonat.set(m, [...(jeMonat.get(m) ?? []), x]);
  }
  const monate = [...jeMonat.keys()].sort((a, c) => c - a);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bewirtungsbelege</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Im Restaurant den Beleg fotografieren, Anlass und Teilnehmer eintragen, festschreiben.
            Alles wird aufaddiert und steht fürs Steuerbüro bereit.
          </p>
        </div>
        <BelegScanner />
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      {entwuerfe.length > 0 && (
        <section className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          <h2 className="font-semibold">Noch zu ergänzen ({entwuerfe.length})</h2>
          <ul className="space-y-1 text-sm">
            {entwuerfe.map((x) => (
              <li key={x.id}>
                <Link href={`/bewirtung/${x.id}`} className="underline">
                  {datumKurz(x.datum)} · {x.restaurant || "Restaurant unbekannt"} · {euro(x.bruttoCent)}
                </Link>
                <span className="text-leise"> · {!x.anlass ? "Anlass fehlt" : !x.teilnehmer ? "Teilnehmer fehlen" : "bereit zum Festschreiben"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Jahr {jahr}</h2>
          <nav className="flex gap-1 text-sm">
            {[diesesJahr - 1, diesesJahr].map((j) => (
              <Link
                key={j}
                href={`/bewirtung?jahr=${j}`}
                className={`rounded-md px-3 py-1.5 ${j === jahr ? "bg-text text-flaeche" : "border border-linie"}`}
              >
                {j}
              </Link>
            ))}
          </nav>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kachel zahl={String(s.anzahl)} was={s.anzahl === 1 ? "Beleg" : "Belege"} />
          <Kachel zahl={euro(s.bruttoCent + s.trinkgeldCent)} was="ausgegeben" hinweis={`davon ${euro(s.trinkgeldCent)} Trinkgeld`} />
          <Kachel zahl={euro(s.vorsteuerCent)} was="Vorsteuer" hinweis="voll abziehbar" />
          <Kachel zahl={euro(s.abziehbarCent)} was="Betriebsausgabe" hinweis={`70 % von ${euro(s.nettoCent)} netto`} betont />
        </div>
      </section>

      {monate.length === 0 ? (
        <p className="text-sm text-leise">In {jahr} gibt es noch keine festgeschriebenen Belege.</p>
      ) : (
        monate.map((m) => {
          const liste = jeMonat.get(m)!;
          const ms = summen(liste);
          const schluessel = `${jahr}-${String(m).padStart(2, "0")}`;
          return (
            <section key={m} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linie pb-1">
                <h3 className="font-semibold">
                  {m ? MONATE[m - 1] : "ohne Datum"}{" "}
                  <span className="font-normal text-leise">
                    · {ms.anzahl} {ms.anzahl === 1 ? "Beleg" : "Belege"} · {euro(ms.bruttoCent + ms.trinkgeldCent)}
                  </span>
                </h3>
                {m > 0 && (
                  <span className="flex gap-3 text-xs">
                    <Link href={`/bewirtung/monat?m=${schluessel}`} className="underline">
                      fürs Steuerbüro drucken
                    </Link>
                    <a href={`/bewirtung/export?m=${schluessel}`} className="underline">
                      CSV
                    </a>
                  </span>
                )}
              </div>
              <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche">
                {liste.map((x) => (
                  <li key={x.id}>
                    <Link href={`/bewirtung/${x.id}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-sm hover:bg-gold-hell">
                      <span className="w-24 font-mono text-xs text-leise">{x.nummer}</span>
                      <span className="w-20 tabular-nums">{datumKurz(x.datum)}</span>
                      <span className="min-w-0 flex-1">
                        <strong>{x.restaurant}</strong>
                        <span className="text-leise"> · {x.anlass}</span>
                      </span>
                      <span className={`tabular-nums ${x.status === "storniert" ? "line-through text-leise" : ""}`}>
                        {euro((x.bruttoCent ?? 0) + x.trinkgeldCent)}
                      </span>
                      {x.status === "storniert" && <span className="text-xs" style={{ color: "var(--blocker)" }}>storniert</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <summary className="cursor-pointer font-medium">Was das Finanzamt verlangt und wie es hier gelöst ist</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-leise">
          <li>
            <strong className="text-text">Maschineller Beleg</strong> des Restaurants mit Name und Anschrift, Datum,
            Speisen und Getränken einzeln, Betrag und Mehrwertsteuer. Seit 2018 mit Angaben der Kassen-TSE.
            Handschriftliche Quittungen reichen nur ausnahmsweise.
          </li>
          <li>
            <strong className="text-text">Ergänzt von dir:</strong> Anlass (konkret, etwa „Besprechung Firmenfeier
            Muster GmbH“, nicht nur „Geschäftsessen“) und alle Teilnehmer mit Namen, du selbst eingeschlossen.
            Seit 2023 darf das digital ergänzt werden.
          </li>
          <li>
            <strong className="text-text">Trinkgeld</strong> separat. Am besten lässt du es auf dem Beleg vermerken
            oder bezahlst es mit Karte.
          </li>
          <li>
            <strong className="text-text">Steuerlich:</strong> 70 % des Nettobetrags sind Betriebsausgabe, 30 % nicht.
            Die Vorsteuer ist voll abziehbar.
          </li>
          <li>
            <strong className="text-text">Aufbewahrung (GoBD):</strong> Festgeschriebene Belege lassen sich nicht mehr
            ändern oder löschen, nur mit Grund stornieren. Jedes Foto hat einen Fingerabdruck (SHA-256).
            Ob das Papieroriginal danach weg darf (ersetzendes Scannen), stimmt bitte mit dem Steuerbüro ab.
            Bis dahin die Papierbelege aufheben.
          </li>
        </ul>
      </details>
    </div>
  );
}

function Kachel({ zahl, was, hinweis, betont }: { zahl: string; was: string; hinweis?: string; betont?: boolean }) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{ borderColor: betont ? "var(--gold)" : "var(--linie)", background: betont ? "var(--gold-hell)" : "var(--flaeche)" }}
    >
      <div className="text-xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      {hinweis && <div className="text-xs text-leise">{hinweis}</div>}
    </div>
  );
}
