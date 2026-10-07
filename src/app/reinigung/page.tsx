import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfZeitenAendern } from "@/lib/auth/sitzung";
import { dienstleister, monatsabrechnung } from "@/lib/stempel/dienstleister";
import { linkSicherstellen } from "@/lib/stempel/putzlink";
import { LinkKopieren } from "@/components/LinkKopieren";
import { linkNeu, personenAendern } from "./aktionen";

export const metadata = { title: "Reinigung | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Was die Putzfirma gearbeitet hat, zum Gegenhalten der Rechnung.
 *
 * Die Firma stempelt selbst und sagt beim Einstempeln, mit wie vielen
 * Leuten sie da ist. Hier steht beides zusammen mit dem Stundensatz:
 * "das kannst du dann entsprechend tracken und rechnung checken wenn
 * diese kommt" (Florian, 07.10.2026).
 *
 * Gerechnet wird mit Personenstunden, denn so wird abgerechnet: zwei
 * Leute drei Stunden sind sechs. Was noch offen ist, steht mit dabei und
 * zaehlt nicht mit, denn eine Schicht ohne Ende ist keine Zahl.
 *
 * Nur Florian, Kevin und Werner: Hier stehen Betraege.
 */

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function monatName(m: string): string {
  return new Date(`${m}-01T12:00:00Z`).toLocaleDateString("de-DE", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

function monatVerschoben(m: string, schritte: number): string {
  const [j, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(j, mo - 1 + schritte, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const eur = (cent: number) => (cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
const std = (h: number) =>
  `${Math.floor(h)}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0")}`;

export default async function ReinigungSeite({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; wer?: string; meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfZeitenAendern(b)) redirect("/");

  const { monat, wer, meldung } = await searchParams;
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(monat ?? "") ? monat! : heute;

  const firmen = await dienstleister();
  const gewaehlt = firmen.find((f) => f.id === wer) ?? firmen[0] ?? null;
  const abrechnung = gewaehlt ? await monatsabrechnung({ benutzerId: gewaehlt.id, monat: m }) : null;

  /*
    Der offene Link, auf dem die Leute selbst stempeln.

    Er wird beim ersten Aufruf dieser Seite angelegt und bleibt dann
    gleich: Ein Link, der sich staendig aendert, ist keiner, den man
    jemandem geben kann.
  */
  const schluessel = gewaehlt ? await linkSicherstellen(gewaehlt.id, b.name) : null;
  const linkAdresse = schluessel
    ? `${process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de"}/putzen/${schluessel}`
    : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reinigung</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Was die Firma gestempelt hat, mit der Zahl der Leute je Schicht. Zum Vergleichen, wenn die
          Rechnung kommt.
        </p>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {firmen.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Es ist noch keine Firma angelegt.
        </p>
      ) : (
        <>
          {firmen.length > 1 && (
            <div className="flex flex-wrap gap-2 text-sm">
              {firmen.map((f) => (
                <Link
                  key={f.id}
                  href={`/reinigung?monat=${m}&wer=${f.id}`}
                  className={`rounded-md border px-3 py-1.5 ${
                    f.id === gewaehlt?.id ? "border-gold bg-gold-hell font-medium" : "border-linie"
                  }`}
                >
                  {f.name}
                </Link>
              ))}
            </div>
          )}

          {schluessel && (
            <section className="space-y-2 rounded-lg border border-gold bg-gold-hell px-5 py-4 text-sm">
              <h2 className="font-semibold">Der Link zum Stempeln</h2>
              <p className="max-w-prose text-leise">
                Diesen Link an die Firma geben. Wer putzt, tippt darauf seinen Namen an und stempelt, ohne
                Anmeldung. Wer zum ersten Mal da ist, schreibt sich einmal hinein und steht danach in der
                Liste. Gestempelt wird nur auf dem Gelände.
              </p>
              <LinkKopieren link={linkAdresse} />
              <form action={linkNeu}>
                <input type="hidden" name="wer" value={gewaehlt?.id ?? ""} />
                <input type="hidden" name="monat" value={m} />
                <button type="submit" className="text-xs text-leise underline">
                  Neuen Link erzeugen, alten abschalten
                </button>
              </form>
            </section>
          )}

          <div className="flex items-center justify-between gap-2 text-sm">
            <Link
              href={`/reinigung?monat=${monatVerschoben(m, -1)}${gewaehlt ? `&wer=${gewaehlt.id}` : ""}`}
              className="underline"
            >
              ← {monatName(monatVerschoben(m, -1))}
            </Link>
            <strong>{monatName(m)}</strong>
            <Link
              href={`/reinigung?monat=${monatVerschoben(m, 1)}${gewaehlt ? `&wer=${gewaehlt.id}` : ""}`}
              className="underline"
            >
              {monatName(monatVerschoben(m, 1))} →
            </Link>
          </div>

          {!abrechnung || abrechnung.einsaetze.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
              In diesem Monat wurde nicht gestempelt.
            </p>
          ) : (
            <>
              <section className="rounded-lg border border-linie bg-flaeche px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <span className="text-sm text-leise">
                    {abrechnung.name}, {eur(abrechnung.satzCent)} € netto je Person und Stunde
                  </span>
                  <span className="ml-auto text-sm">
                    <strong className="tabular-nums">{std(abrechnung.personenstunden)}</strong>{" "}
                    Personenstunden
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{eur(abrechnung.summeCent)} €</span>
                </div>
                <p className="mt-2 text-xs text-leise">
                  Aus {std(abrechnung.stunden)} Stunden Anwesenheit.
                  {abrechnung.offen > 0 &&
                    ` ${abrechnung.offen} Schicht${abrechnung.offen === 1 ? "" : "en"} ohne Ausstempeln, nicht mitgerechnet.`}{" "}
                  Netto, die Rechnung kommt mit Umsatzsteuer.
                </p>
              </section>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
                    <th className="py-2">Tag</th>
                    <th>Wer</th>
                    <th>Von</th>
                    <th>Bis</th>
                    <th className="text-right">Dauer</th>
                    <th className="text-right">Leute</th>
                    <th className="text-right">Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {abrechnung.einsaetze.map((e, i) => (
                    <tr key={`${e.datum}-${e.von}-${i}`} className="border-b border-linie">
                      <td className="py-2">
                        {WOCHENTAGE[new Date(`${e.datum}T12:00:00Z`).getUTCDay()]},{" "}
                        {e.datum.split("-").reverse().join(".")}
                      </td>
                      <td>{e.name}</td>
                      <td className="tabular-nums">{e.von}</td>
                      <td className="tabular-nums">{e.bis ?? <span className="text-leise">offen</span>}</td>
                      <td className="text-right tabular-nums">
                        {e.bis ? std(e.minuten / 60) : <span className="text-leise">–</span>}
                      </td>
                      <td className="text-right">
                        {/*
                          Die Zahl laesst sich hier aendern: Wer am Handy
                          danebentippt, merkt es erst, wenn die Rechnung
                          kommt, und dann soll das Buero sie geradeziehen
                          koennen, statt sie zu glauben.
                        */}
                        <form action={personenAendern} className="flex items-center justify-end gap-1">
                          <input type="hidden" name="monat" value={m} />
                          <input type="hidden" name="wer" value={gewaehlt?.id ?? ""} />
                          <input type="hidden" name="datum" value={e.datum} />
                          <input type="hidden" name="von" value={e.von} />
                          <input
                            type="number"
                            name="personen"
                            min={1}
                            max={20}
                            defaultValue={e.personen}
                            className="w-14 text-right text-sm"
                            aria-label="Wie viele Leute"
                          />
                          <button type="submit" className="text-xs text-leise underline">
                            ok
                          </button>
                        </form>
                      </td>
                      <td className="text-right tabular-nums">
                        {e.kostenCent === null ? <span className="text-leise">–</span> : `${eur(e.kostenCent)} €`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
