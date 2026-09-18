import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { kommendeTermine } from "@/lib/ditix/spielplan";
import { kommendeGaeste, type Gast } from "@/lib/db/gaesteliste";
import { datumMitWochentag } from "@/lib/zeit";
import { Absendeknopf } from "@/components/Absendeknopf";
import { gastEintragen, gastEntfernen } from "./aktionen";

export const metadata = { title: "Gästeliste | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Gästeliste: wer ohne Ticket in die Show kommt.
 *
 * Florian und Kevin tragen Name und Anzahl ein. Gesetzt wird vor Ort vom
 * Showteam, nach den Upgrades, in das, was frei ist. Dafür stehen die
 * Gäste auf dem Upgrade-Ausdruck mit Platzvorschlag und auf der
 * Einlassliste.
 */
export default async function GaestelisteSeite({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; meldung?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) redirect("/");
  const { v, meldung } = await searchParams;

  const [termine, gaeste] = await Promise.all([kommendeTermine(120).catch(() => []), kommendeGaeste()]);
  const jeVorstellung = new Map<string, Gast[]>();
  for (const g of gaeste) jeVorstellung.set(g.ditixEventId, [...(jeVorstellung.get(g.ditixEventId) ?? []), g]);
  const mitGaesten = termine.filter((t) => jeVorstellung.has(t.ditixEventId));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Gästeliste</h1>
        <p className="mt-1 text-sm text-leise">
          Wer ohne Ticket in die Show kommt. Name und Anzahl reichen. Einen Platz bekommen die Gäste
          vor Ort vom Showteam, nach den Upgrades, so wie frei ist. Dafür stehen sie auf dem
          Upgrade-Ausdruck mit einem Platzvorschlag und auf der Einlassliste.
        </p>
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--info)", background: "var(--info-hell)" }}>
          {meldung}
        </div>
      )}

      <form action={gastEintragen} className="grid gap-3 rounded-lg border border-linie bg-flaeche p-5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-leise">Vorstellung</span>
          <select name="vorstellung" defaultValue={v ?? termine[0]?.ditixEventId} required>
            {termine.map((t) => (
              <option key={t.ditixEventId} value={t.ditixEventId}>
                {datumMitWochentag(t.datum)}, {t.uhrzeit} Uhr, {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Name</span>
          <input name="name" required placeholder="zum Beispiel Familie Huber" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Showtickets</span>
          <input name="anzahl" type="number" min={1} max={30} defaultValue={2} required />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-leise">Notiz (freiwillig)</span>
          <input name="notiz" placeholder="zum Beispiel Presse, Freund von Florian, Gewinner" />
        </label>
        <div className="sm:col-span-2">
          <Absendeknopf text="Auf die Gästeliste" laeuftText="Wird eingetragen..." />
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Kommende Vorstellungen</h2>
        {mitGaesten.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linie px-4 py-6 text-center text-sm text-leise">
            Noch niemand auf der Gästeliste.
          </p>
        ) : (
          mitGaesten.map((t) => {
            const liste = jeVorstellung.get(t.ditixEventId) ?? [];
            const summe = liste.reduce((s, g) => s + g.anzahl, 0);
            return (
              <div key={t.ditixEventId} className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>
                    {datumMitWochentag(t.datum)}, {t.uhrzeit} Uhr
                  </strong>
                  <span className="text-leise">
                    {summe} {summe === 1 ? "Gast" : "Gäste"}
                  </span>
                </div>
                <ul className="mt-2 divide-y divide-linie">
                  {liste.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span>
                        <strong className="tabular-nums">{g.anzahl}×</strong> {g.name}
                        {g.notiz && <span className="text-leise"> · {g.notiz}</span>}
                        <span className="text-xs text-leise"> · eingetragen von {g.erstelltVon}</span>
                        {g.platz && (
                          <span className="text-xs" style={{ color: "var(--gut)" }}>
                            {" "}
                            · sitzt: {g.platz}
                          </span>
                        )}
                      </span>
                      <form action={gastEntfernen}>
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className="text-xs text-leise underline hover:text-text">
                          entfernen
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
