import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { alleRechnungen, einstellung, umsaetze } from "@/lib/rechnung/db";
import { vorschlaege } from "@/lib/rechnung/abgleich";
import { euro, tagKurz } from "@/components/RechnungStatus";
import { Absendeknopf } from "@/components/Absendeknopf";
import { zeitpunkt } from "@/lib/zeit";
import { beiseitelegen, dateiEinlesen, kontoUmschalten, zuordnen } from "../rechnungen/aktionen";
import { konten } from "@/lib/rechnung/konten";

export const metadata = { title: "Zahlungseingänge | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Was auf dem Konto eingegangen ist, und wohin es gehört.
 *
 * Oben steht, was noch niemandem zugeordnet ist: Dort liegt die Arbeit.
 * Darunter die Liste aller Umsätze, damit man nachvollziehen kann, was
 * das Programm mit welcher Buchung gemacht hat.
 */
export default async function ZahlungseingaengeSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle) && !darfBuchhaltung(b)) redirect("/");
  const { meldung } = await searchParams;

  const [liste, rechnungen, e, kontenliste] = await Promise.all([
    umsaetze(),
    alleRechnungen(),
    einstellung(),
    konten(),
  ]);
  const neueKonten = kontenliste.filter((k) => !k.aktiv);
  const offen = liste.filter((u) => u.stand === "offen" && u.betragCent > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Zahlungseingänge</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            {kontenliste.filter((k) => k.aktiv).length > 1
              ? `${kontenliste.filter((k) => k.aktiv).length} Konten bei der ${e.bank}.`
              : `Konto ${e.kontoEndetAuf} bei der ${e.bank}.`}{" "}
            Gelesen wird nur, überwiesen wird von hier aus nichts.
          </p>
        </div>
        <Link href="/rechnungen" className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell">
          Zu den Rechnungen
        </Link>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
        <div>
          <strong>Bank zuletzt abgeglichen:</strong>{" "}
          {e.zuletztAm ? zeitpunkt(new Date(e.zuletztAm)) : "noch nie"}
          {e.zuletztAm && ` · ${e.zuletztUmsaetze} neue Umsätze`}
          {e.letzterFehler && (
            <div style={{ color: "var(--blocker)" }}>Letzter Fehler: {e.letzterFehler}</div>
          )}
          {e.freigabeNoetig && (
            <div style={{ color: "var(--warnung)" }}>
              Bankverbindung muss erneut bestätigt werden (TAN-Freigabe in der VR-App).
            </div>
          )}
        </div>
        <form action={dateiEinlesen} className="flex flex-wrap items-center gap-2">
          <input type="file" name="datei" accept=".csv,.xml,.sta,.txt,.mt940" className="text-sm" />
          {kontenliste.filter((k) => k.aktiv).length > 1 && (
            <select name="konto" className="text-sm" defaultValue="">
              <option value="">Konto wählen</option>
              {kontenliste
                .filter((k) => k.aktiv)
                .map((k) => (
                  <option key={k.endetAuf} value={k.endetAuf}>
                    {k.bezeichnung || "Konto"} ({k.endetAuf})
                  </option>
                ))}
            </select>
          )}
          <Absendeknopf text="Umsätze einlesen" laeuftText="Wird gelesen..." />
        </form>
      </section>

      {/* ---------------------------------------------------------------
          Die Konten des Bankzugangs. Ein neues steht gesperrt da, bis es
          jemand freischaltet (Florian, 29.09.2026).
          --------------------------------------------------------------- */}
      {neueKonten.length > 0 && (
        <section
          className="space-y-2 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong className="font-medium">
            {neueKonten.length === 1 ? "Ein neues Konto" : `${neueKonten.length} neue Konten`} beim Abruf
            gefunden
          </strong>
          <p className="text-leise">
            Die Umsätze werden erst eingelesen, wenn du das Konto freischaltest. So kann kein fremdes Konto
            versehentlich hier landen.
          </p>
          {neueKonten.map((k) => (
            <form key={k.endetAuf} action={kontoUmschalten} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="endetAuf" value={k.endetAuf} />
              <span className="tabular-nums">Konto auf {k.endetAuf}</span>
              <label className="block">
                <span className="mb-1 block text-xs text-leise">Wie soll es heißen?</span>
                <input
                  name="bezeichnung"
                  defaultValue={k.art === "kreditkarte" ? "Kreditkarte" : "Geschäftskonto"}
                  className="w-56"
                />
              </label>
              <Absendeknopf text="Freischalten" laeuftText="..." />
            </form>
          ))}
        </section>
      )}

      {kontenliste.filter((k) => k.aktiv).length > 0 && (
        <details className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          <summary className="cursor-pointer text-leise">
            Konten des Bankzugangs ({kontenliste.filter((k) => k.aktiv).length})
          </summary>
          <ul className="mt-3 space-y-2">
            {kontenliste
              .filter((k) => k.aktiv)
              .map((k) => (
                <li key={k.endetAuf} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-56">
                    <strong>{k.bezeichnung || "Konto"}</strong>{" "}
                    <span className="tabular-nums text-leise">auf {k.endetAuf}</span>
                    {k.art === "kreditkarte" && <span className="text-leise"> · Kreditkarte</span>}
                  </span>
                  <span className="text-xs text-leise">
                    {k.zuletztAm
                      ? `zuletzt ${zeitpunkt(new Date(k.zuletztAm))}, ${k.zuletztUmsaetze} neue Umsätze`
                      : "noch nie abgerufen"}
                  </span>
                  <form action={kontoUmschalten} className="ml-auto">
                    <input type="hidden" name="endetAuf" value={k.endetAuf} />
                    <input type="hidden" name="was" value="stilllegen" />
                    <button type="submit" className="text-xs text-leise underline">
                      stilllegen
                    </button>
                  </form>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-leise">
            Die vollständigen Kontonummern stehen nicht im Programm, nur die letzten vier Stellen. Der Zugang
            zur Bank liegt allein auf dem Rechner im Haus.
          </p>
        </details>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
          Nicht zugeordnet{offen.length > 0 && ` (${offen.length})`}
        </h2>
        {offen.length === 0 ? (
          <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
            Alles zugeordnet. Hier bleibt nur liegen, was das Programm nicht sicher zuordnen konnte.
          </p>
        ) : (
          offen.map((u) => {
            const passende = vorschlaege(u, rechnungen);
            return (
              <div key={u.id} className="rounded-lg border p-4" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <strong className="text-lg tabular-nums">{euro(u.betragCent)}</strong>{" "}
                    <span>{u.gegenname || "ohne Namen"}</span>
                    <div className="text-sm text-leise">
                      {tagKurz(u.buchungstag)}
                      {u.gegenIban ? ` · ${u.gegenIban}` : ""}
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-sm">
                  <span className="text-leise">Verwendungszweck:</span> {u.verwendungszweck || "leer"}
                </p>

                {passende.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium">Könnte gehören zu:</p>
                    {passende.map((v) => (
                      <form key={v.rechnung.id} action={zuordnen} className="flex flex-wrap items-center gap-2 text-sm">
                        <input type="hidden" name="umsatz" value={u.id} />
                        <input type="hidden" name="rechnung" value={v.rechnung.id} />
                        <span className="flex-1">
                          <strong>{v.rechnung.nummer}</strong> · {v.rechnung.kunde} · offen {euro(v.rechnung.offenCent)}
                          <span className="block text-xs text-leise">{v.gruende.join(", ")}</span>
                        </span>
                        <label className="block">
                          <input
                            name="betrag"
                            defaultValue={(Math.min(u.betragCent, v.rechnung.offenCent) / 100).toFixed(2)}
                            className="w-24 text-sm"
                            inputMode="decimal"
                            aria-label="Betrag"
                          />
                        </label>
                        <button type="submit" className="rounded-md px-3 py-1.5 font-medium text-white" style={{ background: "var(--gut)" }}>
                          Dieser Rechnung zuordnen
                        </button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-leise">Keine passende Rechnung gefunden.</p>
                )}

                <form action={beiseitelegen} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="umsatz" value={u.id} />
                  <input name="grund" maxLength={200} placeholder="Grund, zum Beispiel Trinkgeld oder Privateinlage" className="min-w-[14rem] flex-1 text-sm" />
                  <button type="submit" className="rounded-md border border-linie bg-flaeche px-3 py-1.5">
                    Gehört zu keiner Rechnung
                  </button>
                </form>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Alle Umsätze</h2>
        {liste.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
            Noch keine Umsätze eingelesen. Lade oben einen Kontoauszug hoch (CSV, CAMT oder MT940), oder richte den
            automatischen Abruf ein.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
            <table className="w-full text-sm">
              <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
                <tr>
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Absender</th>
                  <th className="px-4 py-2 font-medium">Verwendungszweck</th>
                  <th className="px-4 py-2 text-right font-medium">Betrag</th>
                  <th className="px-4 py-2 font-medium">Zuordnung</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((u) => (
                  <tr key={u.id} className="border-b border-linie last:border-0 align-top">
                    <td className="px-4 py-2 tabular-nums">{tagKurz(u.buchungstag)}</td>
                    <td className="px-4 py-2">{u.gegenname || <span className="text-leise">unbekannt</span>}</td>
                    <td className="px-4 py-2 text-leise">{u.verwendungszweck || "-"}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: u.betragCent < 0 ? "var(--text-leise)" : undefined }}>
                      {euro(u.betragCent)}
                    </td>
                    <td className="px-4 py-2">
                      {u.zuordnungen.length > 0 ? (
                        u.zuordnungen.map((z) => (
                          <div key={z.rechnungId}>
                            <Link href={`/rechnungen/${z.rechnungId}`} className="underline">
                              {z.nummer}
                            </Link>{" "}
                            <span className="text-xs text-leise">
                              {euro(z.betragCent)} {z.herkunft === "automatisch" ? "automatisch" : "manuell"}
                            </span>
                          </div>
                        ))
                      ) : u.stand === "ignoriert" ? (
                        <span className="text-leise">beiseitegelegt{u.ignoriertGrund ? `: ${u.ignoriertGrund}` : ""}</span>
                      ) : u.betragCent < 0 ? (
                        <span className="text-leise">Abbuchung</span>
                      ) : (
                        <span style={{ color: "var(--warnung)" }}>offen</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
