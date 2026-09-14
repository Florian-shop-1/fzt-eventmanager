import Link from "next/link";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { bewertungAktiv, bewertungsuebersicht } from "@/lib/db/bewertung";
import { bewertungenVerschicken, gestern } from "@/lib/bewertung/lauf";
import { SCHLECHT_BIS } from "@/lib/bewertung/meldung";
import { probeSchicken, schalterUmlegen, tagVerschicken } from "./aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";

export const metadata = { title: "Bewertungen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Bewertungsmail nach der Show: Schalter, Vorschau, Ergebnisse.
 *
 * Solange der Schalter aus ist, schickt die Uhr nichts. Die Seite zeigt
 * trotzdem, wen es am gewählten Tag getroffen hätte, damit man vor dem
 * Einschalten sieht, was passiert.
 */
export default async function BewertungSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; tag?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return null;
  const { meldung, tag: tagWahl } = await searchParams;
  const tag = tagWahl && /^\d{4}-\d{2}-\d{2}$/.test(tagWahl) ? tagWahl : gestern();

  const schalter = await bewertungAktiv();
  const vorschau = await bewertungenVerschicken(tag, true);
  const uebersicht = await bewertungsuebersicht();
  const summe = Object.values(uebersicht.verteilung).reduce((a, b) => a + b, 0);
  const schnitt = summe
    ? Object.entries(uebersicht.verteilung).reduce((a, [s, n]) => a + Number(s) * n, 0) / summe
    : null;

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bewertungen</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Am Morgen nach der Show um 10 Uhr bekommt jeder Gast mit bezahlter Shop-Buchung eine Mail
          mit fünf Sternen. Ab 4 Sternen zeigt die Seite Google und Tripadvisor, bis {SCHLECHT_BIS}{" "}
          Sterne ein Feld für Kritik. Schlechte Bewertungen erscheinen sofort im{" "}
          <Link href="/whatsapp" className="underline">
            Posteingang
          </Link>
          , mit Telefonnummer, und lösen eine Mail aus.
        </p>
      </header>

      {meldung && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </div>
      )}

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Automatischer Versand</h2>
            <p className="mt-1 max-w-prose text-leise">
              {schalter.aktiv ? "Eingeschaltet" : "Ausgeschaltet"}
              {schalter.geaendertVon &&
                `, zuletzt von ${schalter.geaendertVon} ${vorZeit(schalter.geaendertAm)}`}
              . Vor dem Einschalten in Brevo das Szenario „Danke für deinen Besuch“ abschalten,
              sonst bekommen Gäste zwei Mails.
            </p>
          </div>
          {benutzer.rolle === "chef" && (
            <form action={schalterUmlegen}>
              <input type="hidden" name="aktiv" value={schalter.aktiv ? "aus" : "an"} />
              <Absendeknopf text={schalter.aktiv ? "Ausschalten" : "Einschalten"} laeuftText="..." />
            </form>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Showtag</h2>
            <form className="mt-2 flex items-center gap-2">
              <input
                type="date"
                name="tag"
                defaultValue={tag}
                className="rounded-md border border-linie px-3 py-1.5"
              />
              <button type="submit" className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell">
                Anzeigen
              </button>
            </form>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={probeSchicken}>
              <input type="hidden" name="tag" value={tag} />
              <Absendeknopf text="Probemail an mich" laeuftText="Wird verschickt..." />
            </form>
            {benutzer.rolle === "chef" && vorschau.verschickt.length > 0 && (
              <form action={tagVerschicken}>
                <input type="hidden" name="tag" value={tag} />
                <Absendeknopf
                  text={`Jetzt an ${vorschau.verschickt.length} Gäste schicken`}
                  laeuftText="Wird verschickt..."
                />
              </form>
            )}
          </div>
        </div>
        <p className="mt-4 text-leise">
          {vorschau.gefunden} Buchungen an diesem Tag, {vorschau.verschickt.length} würden die Mail
          bekommen.
        </p>
        {vorschau.uebersprungen.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-leise">
            {vorschau.uebersprungen.map((u, i) => (
              <li key={i}>
                {u.email}: {u.grund}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="font-semibold">Ergebnisse der letzten 60 Tage</h2>
        <p className="mt-1 text-leise">
          {uebersicht.verschickt} Mails verschickt, {uebersicht.bewertet} bewertet
          {schnitt !== null && `, im Schnitt ${schnitt.toFixed(1).replace(".", ",")} Sterne`}.
        </p>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          {[5, 4, 3, 2, 1].map((s) => (
            <div key={s} className="rounded-md border border-linie py-2">
              <div className="text-xs text-leise">{s} ★</div>
              <div className="text-lg font-semibold tabular-nums">{uebersicht.verteilung[s]}</div>
            </div>
          ))}
        </div>
        {uebersicht.letzte.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs text-leise">
                <tr>
                  <th className="py-1">Wann</th>
                  <th>Gast</th>
                  <th>Abend</th>
                  <th>Sterne</th>
                  <th>Kritik</th>
                </tr>
              </thead>
              <tbody>
                {uebersicht.letzte.map((b) => (
                  <tr key={b.id} className="border-t border-linie align-top">
                    <td className="py-2 pr-2 text-xs text-leise">
                      {b.sterneAmText ? vorZeit(b.sterneAmText) : ""}
                    </td>
                    <td className="pr-2">{b.name}</td>
                    <td className="pr-2 text-xs text-leise">{b.datum}</td>
                    <td
                      className="pr-2 tabular-nums"
                      style={{ color: (b.sterne ?? 5) <= SCHLECHT_BIS ? "var(--blocker)" : undefined }}
                    >
                      {"★".repeat(b.sterne ?? 0)}
                    </td>
                    <td className="text-xs">
                      {b.kritik ?? ""}
                      {b.unterhaltung && (
                        <Link href={`/whatsapp?mit=${b.unterhaltung}`} className="ml-1 underline">
                          im Posteingang
                        </Link>
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
