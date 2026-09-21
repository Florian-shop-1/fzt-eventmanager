import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { bewirtungenDesJahres, euro, nachZahlweg, summen, type Bewirtung } from "@/lib/bewirtung/db";
import { BelegScanner } from "@/components/BelegScanner";

export const metadata = { title: "Belege | FZT Eventmanager" };
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
  const s = summen(belege, "bewirtung");
  const e = summen(belege, "einkauf");
  const zw = nachZahlweg(belege);
  const kategorien = new Map<string, number>();
  for (const x of belege) {
    if (x.status !== "fertig" || x.art !== "einkauf") continue;
    const k = x.kategorie || "Sonstiges";
    kategorien.set(k, (kategorien.get(k) ?? 0) + (x.bruttoCent ?? 0));
  }

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
          <h1 className="text-2xl font-semibold tracking-tight">Belege</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Beleg fotografieren, die KI erkennt Bewirtung oder Einkauf und liest alles aus. Du ergänzt
            nur, was fehlt, und schreibst fest. Alles wird aufaddiert und steht fürs Steuerbüro bereit.
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
                <span className="text-leise">
                  {" · "}
                  {!x.zahlweg
                    ? "Karte oder bar?"
                    : x.art === "einkauf"
                      ? x.zweck ? "bereit zum Festschreiben" : "wofür fehlt"
                      : !x.anlass ? "Anlass fehlt" : !x.teilnehmer ? "Teilnehmer fehlen" : "bereit zum Festschreiben"}
                </span>
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
        <h3 className="text-sm font-semibold uppercase tracking-wide text-leise">Bewirtungen</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kachel zahl={String(s.anzahl)} was={s.anzahl === 1 ? "Bewirtung" : "Bewirtungen"} />
          <Kachel zahl={euro(s.bruttoCent + s.trinkgeldCent)} was="ausgegeben" hinweis={`davon ${euro(s.trinkgeldCent)} Trinkgeld`} />
          <Kachel zahl={euro(s.vorsteuerCent)} was="Vorsteuer" hinweis="voll abziehbar" />
          <Kachel zahl={euro(s.abziehbarCent)} was="Betriebsausgabe" hinweis={`70 % von ${euro(s.nettoCent)} netto`} betont />
        </div>
        <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-leise">Einkäufe</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kachel zahl={String(e.anzahl)} was={e.anzahl === 1 ? "Einkauf" : "Einkäufe"} />
          <Kachel zahl={euro(e.bruttoCent)} was="ausgegeben" />
          <Kachel zahl={euro(e.vorsteuerCent)} was="Vorsteuer" hinweis="voll abziehbar" />
          <Kachel zahl={euro(e.abziehbarCent)} was="Betriebsausgabe" hinweis="netto, voll abziehbar" betont />
        </div>
        {kategorien.size > 0 && (
          <p className="text-xs text-leise">
            {[...kategorien].sort((a, c) => c[1] - a[1]).map(([k, c]) => `${k} ${euro(c)}`).join(" · ")}
          </p>
        )}
        <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-leise">Bezahlt</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kachel zahl={euro(zw.karte)} was="mit Karte" />
          <Kachel zahl={euro(zw.bar)} was="bar" />
          <Kachel zahl={euro(zw.privat)} was="privat ausgelegt" hinweis="erstattet dir die Firma" />
        </div>
      </section>

      {monate.length === 0 ? (
        <p className="text-sm text-leise">In {jahr} gibt es noch keine festgeschriebenen Belege.</p>
      ) : (
        monate.map((m) => {
          const liste = jeMonat.get(m)!;
          const schluessel = `${jahr}-${String(m).padStart(2, "0")}`;
          return (
            <section key={m} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linie pb-1">
                <h3 className="font-semibold">
                  {m ? MONATE[m - 1] : "ohne Datum"}{" "}
                  <span className="font-normal text-leise">
                    · {liste.filter((x) => x.status === "fertig").length === 1 ? "1 Beleg" : `${liste.filter((x) => x.status === "fertig").length} Belege`} ·{" "}
                    {euro(liste.filter((x) => x.status === "fertig").reduce((n, x) => n + (x.bruttoCent ?? 0) + x.trinkgeldCent, 0))}
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
                        <span
                          className="mr-2 rounded px-1.5 py-0.5 text-[11px]"
                          style={{ background: x.art === "einkauf" ? "var(--info-hell)" : "var(--gold-hell)" }}
                        >
                          {x.art === "einkauf" ? "Einkauf" : "Bewirtung"}
                        </span>
                        <strong>{x.restaurant}</strong>
                        <span className="text-leise"> · {x.art === "einkauf" ? x.zweck : x.anlass}</span>
                        <span className="text-leise"> · {x.zahlweg === "bar" ? "bar" : "Karte"}{x.privatAusgelegt ? ", privat" : ""}</span>
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
            <strong className="text-text">Einkäufe</strong> (Baumarkt, Büro, Tanken ...): Beleg, kurz wofür, Karte oder
            bar. Voll als Betriebsausgabe abziehbar. Ab 250 Euro brauchen Rechnungen den Namen der Firma,
            dafür an der Kasse eine Rechnung auf Florian Zimmer Theater GmbH verlangen.
          </li>
          <li>
            <strong className="text-text">Privat ausgelegt:</strong> Hast du mit eigenem Geld bezahlt, wird das
            getrennt summiert. Das erstattet dir die Firma.
          </li>
          <li>
            <strong className="text-text">Maschineller Beleg</strong> des Restaurants mit Name und Anschrift, Datum,
            Speisen und Getränken einzeln, Betrag und Mehrwertsteuer. Seit 2018 mit Angaben der Kassen-TSE.
            Handschriftliche Quittungen reichen nur ausnahmsweise.
          </li>
          <li>
            <strong className="text-text">Ergänzt von dir:</strong> Anlass (konkret, etwa „Besprechung Firmenfeier
            Muster GmbH“, nicht nur „Geschäftsessen“) und alle Teilnehmer mit Namen, du selbst eingeschlossen.
            Das darf digital ergänzt werden. Dazu unterschreibst du in der App mit dem Finger. Ob die
            Unterschrift bei digitalen Belegen zwingend ist, sehen Steuerberater unterschiedlich. Mit ihr bist du
            auf der sicheren Seite.
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
            Wird ein Beleg zweimal gescannt (gleiches Datum, gleicher Betrag), warnt die App.
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
