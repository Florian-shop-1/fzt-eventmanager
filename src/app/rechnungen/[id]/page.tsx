import Link from "next/link";
import { rechnungPerMail, rechnungsMailtext } from "@/lib/rechnung/mailversand";
import { rechnungsPdfDaten } from "@/lib/rechnung/pdfdaten";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { ereignisse, rechnungLesen } from "@/lib/rechnung/db";
import { StatusSchild, euro, faelligText, tagKurz } from "@/components/RechnungStatus";
import { Absendeknopf } from "@/components/Absendeknopf";
import { zeitpunkt } from "@/lib/zeit";
import {
  faelligAendern,
  manuellBezahlt,
  rechnungStornieren,
  versandNachtragen,
  zahlungEntfernen,
} from "../aktionen";

export const metadata = { title: "Rechnung | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Eine Rechnung mit allem, was ihr widerfahren ist.
 *
 * Der Verlauf unten wird nur ergänzt, nie geändert: Wer wissen will, wann
 * die Mail rausging und wann das Geld kam, liest ihn von oben nach unten.
 */
export default async function RechnungSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle) && !darfBuchhaltung(b)) redirect("/");

  const { id } = await params;
  const { meldung } = await searchParams;
  const r = await rechnungLesen(id);
  if (!r) redirect("/rechnungen");
  const verlauf = await ereignisse(id);

  // Nur Rechnungen aus einem Angebot haben Positionen und damit ein PDF.
  const hatPositionen = (await rechnungsPdfDaten(id)) !== null;
  const vorschlag = await rechnungsMailtext({
    nummer: r.nummer,
    faelligAm: r.faelligAm,
    betragCent: r.betragCent,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/rechnungen" className="text-sm text-leise underline">
            Alle Rechnungen
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.nummer}</h1>
          <p className="text-sm text-leise">
            {r.kunde}
            {r.kundeEmail ? ` · ${r.kundeEmail}` : ""}
            {r.leistung ? ` · ${r.leistung}` : ""}
          </p>
        </div>
        <StatusSchild status={r.status} />
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {/*
        Das PDF und der Versand.

        Nur fuer Rechnungen mit Positionen, also die aus einem Angebot.
        Die Rechnungen aus dem Weinverkauf haben ihr eigenes PDF, und
        eine Rechnung ohne Positionen laesst sich nicht setzen
        (Florian, 25.09.2026).
      */}
      {hatPositionen && (
        <section className="space-y-3 rounded-lg border border-linie p-4">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/rechnung/pdf?id=${r.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-hintergrund"
            >
              Rechnung als PDF ansehen
            </a>
            {r.zuerstGeoeffnetAm && (
              <span className="text-xs text-leise">
                Vom Kunden geöffnet am {zeitpunkt(new Date(r.zuerstGeoeffnetAm))}
              </span>
            )}
            {r.dankMailAm && (
              <span className="text-xs" style={{ color: "var(--gut)" }}>
                Bestätigung nach Zahlungseingang ist raus
              </span>
            )}
          </div>

          <details className="rounded border border-gold bg-gold-hell/40 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gold-dunkel">
              {r.mailStatus === "gesendet" ? "Rechnung noch einmal verschicken" : "Rechnung per Mail verschicken"}
            </summary>

            <form action={rechnungPerMail.bind(null, r.id, r.vorgangId ?? "")} className="mt-3 space-y-2">
              <label className="block text-xs">
                <span className="text-leise">An</span>
                <input
                  type="email"
                  name="an"
                  defaultValue={r.kundeEmail}
                  className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="text-leise">Betreff</span>
                <input
                  type="text"
                  name="betreff"
                  defaultValue={vorschlag.betreff}
                  className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="text-leise">Text</span>
                <textarea
                  name="text"
                  rows={12}
                  defaultValue={vorschlag.text}
                  className="mt-1 w-full rounded-md border border-linie px-2 py-1.5 text-sm"
                />
              </label>
              <p className="text-xs text-leise">Die Rechnung hängt als PDF an.</p>
              <button
                type="submit"
                className="rounded-md bg-gold-dunkel px-3 py-1.5 text-sm font-medium text-weiss"
              >
                Jetzt verschicken
              </button>
            </form>
          </details>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <Feld titel="Rechnungsbetrag" wert={euro(r.betragCent)} />
        <Feld
          titel="Bezahlt"
          wert={euro(r.bezahltCent)}
          hinweis={
            r.ueberzahlungCent
              ? `Überzahlung ${euro(r.ueberzahlungCent)}`
              : r.offenCent > 0
                ? `offen ${euro(r.offenCent)}`
                : "vollständig"
          }
        />
        <Feld titel="Rechnungsdatum" wert={tagKurz(r.rechnungsdatum)} hinweis={`Zahlungsziel ${r.zahlungszielTage} Tage`} />
        <Feld titel="Fällig" wert={tagKurz(r.faelligAm)} hinweis={faelligText(r)} />
        <Feld
          titel="E-Mail"
          wert={
            r.mailStatus === "gesendet"
              ? "versendet"
              : r.mailStatus === "fehlgeschlagen"
                ? "Versand fehlgeschlagen"
                : "noch nicht versendet"
          }
          hinweis={
            r.mailStatus === "gesendet"
              ? `${r.versendetAm ? zeitpunkt(new Date(r.versendetAm)) : ""}${r.versendetAn ? ` an ${r.versendetAn}` : ""}`
              : (r.mailFehler ?? "")
          }
        />
        <Feld titel="Erstellt" wert={zeitpunkt(new Date(r.erstelltAm))} hinweis={r.erstelltVon ?? ""} />
      </section>

      {r.mailStatus === "fehlgeschlagen" && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}>
          <strong>Die Rechnung gilt nicht als versendet.</strong> Der letzte Versuch ist gescheitert
          {r.mailFehler ? `: ${r.mailFehler}` : ""}. Schick sie erneut und trag hier ein, an wen sie ging.
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Zahlungen</h2>
        {r.zahlungen.length === 0 ? (
          <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
            Noch keine Zahlung eingegangen.
          </p>
        ) : (
          <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
            {r.zahlungen.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="w-24 tabular-nums">{tagKurz(z.datum)}</span>
                <span className="w-28 text-right tabular-nums font-medium">{euro(z.betragCent)}</span>
                <span className="flex-1 text-leise">
                  {z.herkunft === "automatisch" ? "automatisch über den Bankabgleich" : "manuell eingetragen"}
                  {z.notiz ? ` · ${z.notiz}` : ""}
                </span>
                <form action={zahlungEntfernen}>
                  <input type="hidden" name="id" value={z.id} />
                  <input type="hidden" name="rechnung" value={r.id} />
                  <button type="submit" className="text-xs text-leise underline">
                    Zuordnung lösen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {r.status !== "PAID" && r.status !== "CANCELLED" && (
        <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
          <summary className="cursor-pointer font-medium">Zahlung von Hand eintragen</summary>
          <p className="mt-2 text-leise">
            Für Bargeld, eine Karte oder eine Überweisung, die das Programm nicht sicher zuordnen konnte. Sie wird
            ausdrücklich als „manuell eingetragen“ gekennzeichnet.
          </p>
          <form action={manuellBezahlt} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={r.id} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Betrag</span>
              <input name="betrag" defaultValue={(r.offenCent / 100).toFixed(2)} className="w-28" inputMode="decimal" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Datum</span>
              <input type="date" name="datum" defaultValue={new Date().toLocaleDateString("sv-SE")} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Zahlungsart</span>
              <select name="art" defaultValue="ueberweisung">
                <option value="ueberweisung">Überweisung</option>
                <option value="bar">Bar</option>
                <option value="karte">Karte</option>
                <option value="paypal">PayPal</option>
                <option value="verrechnung">Verrechnung</option>
              </select>
            </label>
            <label className="block min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs text-leise">Notiz</span>
              <input name="notiz" maxLength={200} placeholder="freiwillig" />
            </label>
            <Absendeknopf text="Eintragen" laeuftText="..." />
          </form>
        </details>
      )}

      <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <summary className="cursor-pointer font-medium">Fälligkeit, Versand, Storno</summary>
        <div className="mt-3 space-y-4">
          <form action={faelligAendern} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={r.id} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Fällig am</span>
              <input type="date" name="faellig" defaultValue={r.faelligAm} />
            </label>
            <button type="submit" className="rounded-md border border-linie px-3 py-1.5">
              Fälligkeit ändern
            </button>
          </form>

          <form action={versandNachtragen} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={r.id} />
            <label className="block min-w-[14rem] flex-1">
              <span className="mb-1 block text-xs text-leise">Versendet an</span>
              <input name="an" type="email" defaultValue={r.versendetAn ?? r.kundeEmail} />
            </label>
            <button type="submit" className="rounded-md border border-linie px-3 py-1.5">
              Als versendet vermerken
            </button>
          </form>

          {r.status !== "CANCELLED" && (
            <form action={rechnungStornieren} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={r.id} />
              <label className="block min-w-[14rem] flex-1">
                <span className="mb-1 block text-xs text-leise">Grund für den Storno</span>
                <input name="grund" maxLength={200} placeholder="zum Beispiel doppelt gestellt" />
              </label>
              <button type="submit" className="rounded-md border border-linie px-3 py-1.5" style={{ color: "var(--blocker)" }}>
                Rechnung stornieren
              </button>
            </form>
          )}
        </div>
      </details>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Verlauf</h2>
        <ol className="space-y-2 rounded-lg border border-linie bg-flaeche p-4 text-sm">
          {verlauf.map((e, i) => (
            <li key={i} className="flex flex-wrap gap-x-3">
              <span className="w-40 shrink-0 tabular-nums text-leise">{zeitpunkt(new Date(e.zeitpunkt))}</span>
              <span className="flex-1">{e.text}</span>
              <span className="text-xs text-leise">{e.wer}</span>
            </li>
          ))}
          {verlauf.length === 0 && <li className="text-leise">Noch nichts geschehen.</li>}
        </ol>
      </section>
    </div>
  );
}

function Feld({ titel, wert, hinweis }: { titel: string; wert: string; hinweis?: string }) {
  return (
    <div className="rounded-lg border border-linie bg-flaeche px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-leise">{titel}</div>
      <div className="text-lg font-semibold">{wert}</div>
      {hinweis && <div className="text-xs text-leise">{hinweis}</div>}
    </div>
  );
}
