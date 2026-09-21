import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { foyerLeute, foyerPlan, offeneFreigaben } from "@/lib/foyer/dienstplan";
import { datumMitWochentag } from "@/lib/zeit";
import { Absendeknopf } from "@/components/Absendeknopf";
import { eintragen, festMarkieren, freigeben, zeiten } from "./aktionen";

export const metadata = { title: "Foyer-Dienstplan | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Foyerdienst, geplant von Sarah.
 *
 * Zwei Plätze je Showtag mit vorgerechneten Zeiten. Die feste
 * Mitarbeiterin trägt Sarah einfach ein; jede Aushilfe geht als Anfrage
 * an Kevin und Florian und gilt erst mit deren Freigabe
 * (Florian, 22.09.2026).
 */
export default async function FoyerPlanSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!["chef", "team", "foyer"].includes(b.rolle)) redirect("/");
  const { meldung } = await searchParams;

  const [tage, leute, offen] = await Promise.all([foyerPlan(), foyerLeute(), offeneFreigaben()]);
  const buero = darfKaufmaennisches(b.rolle);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Foyer-Dienstplan</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Zwei Leute je Showtag. Die Zeiten rechnet das Programm aus dem Spielplan: erste Person zwei Stunden vor
          der ersten Show, zweite 45 Minuten später, Schluss rund drei Stunden nach Beginn der letzten Show. An
          Tagen mit Flo-Zirkus reicht anderthalb Stunden Vorlauf. Passt es einmal nicht, änderst du die Zeiten
          einfach am Tag.
        </p>
        <p className="mt-2 max-w-prose text-sm text-leise">
          Die feste Mitarbeiterin kannst du direkt eintragen. Jede Aushilfe geht als Anfrage an Kevin und Florian;
          sie bekommt ihre Mail erst, wenn einer von beiden freigegeben hat.
        </p>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      {buero && offen.length > 0 && (
        <section className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          <h2 className="font-semibold">
            {offen.length} {offen.length === 1 ? "Aushilfe wartet" : "Aushilfen warten"} auf deine Freigabe
          </h2>
          {offen.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex-1">
                <strong>{d.name}</strong> · {datumMitWochentag(d.datum)}, {d.von} bis {d.bis} Uhr (Platz {d.nummer})
              </span>
              <form action={freigeben}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="wie" value="ja" />
                <button type="submit" className="rounded-md px-3 py-1.5 font-medium text-white" style={{ background: "var(--gut)" }}>
                  Freigeben
                </button>
              </form>
              <form action={freigeben}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="wie" value="nein" />
                <button type="submit" className="rounded-md border border-linie bg-flaeche px-3 py-1.5">
                  Ablehnen
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      {tage.length === 0 ? (
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
          In den nächsten Wochen stehen keine Shows im Spielplan.
        </p>
      ) : (
        <ul className="space-y-3">
          {tage.map((t) => (
            <li key={t.datum} className="rounded-lg border border-linie bg-flaeche p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <strong>{datumMitWochentag(t.datum)}</strong>
                <span className="text-sm text-leise">
                  {t.shows.map((s) => `${s.uhrzeit} Uhr`).join(" und ")} · {t.shows[0]?.name}
                </span>
                {t.pause && <span className="text-sm text-leise">Pause {t.pause}</span>}
              </div>

              <ul className="mt-2 space-y-2">
                {t.dienste.map((d) => (
                  <li key={d.nummer} className="flex flex-wrap items-center gap-2 border-t border-linie pt-2 text-sm">
                    <span className="w-24 shrink-0 font-medium">{d.nummer}. Person</span>

                    <form action={eintragen} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="datum" value={t.datum} />
                      <input type="hidden" name="nummer" value={d.nummer} />
                      <input type="hidden" name="von" value={d.von} />
                      <input type="hidden" name="bis" value={d.bis} />
                      <select name="benutzer" defaultValue={d.benutzerId ?? "offen"} className="text-sm">
                        <option value="offen">offen</option>
                        {leute.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.fest ? "" : " (Aushilfe)"}
                          </option>
                        ))}
                      </select>
                      <Absendeknopf text="Eintragen" laeuftText="..." />
                    </form>

                    <span className="text-leise">
                      {d.von || "?"} bis {d.bis || "?"} Uhr
                    </span>

                    {d.freigabe === "angefragt" && (
                      <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--warnung-hell)", color: "var(--warnung)" }}>
                        wartet auf Freigabe
                      </span>
                    )}
                    {d.freigabe === "frei" && (
                      <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--gut-hell)", color: "var(--gut)" }}>
                        freigegeben{d.freigabeVon ? ` von ${d.freigabeVon}` : ""}
                      </span>
                    )}
                    {d.freigabe === "abgelehnt" && (
                      <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--blocker-hell)", color: "var(--blocker)" }}>
                        nicht freigegeben
                      </span>
                    )}
                    {d.notiz && <span className="text-leise">· {d.notiz}</span>}
                  </li>
                ))}
              </ul>

              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-leise underline">Zeiten oder Notiz ändern</summary>
                {t.dienste.map((d) => (
                  <form key={d.nummer} action={zeiten} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="datum" value={t.datum} />
                    <input type="hidden" name="nummer" value={d.nummer} />
                    <span className="w-24 shrink-0">{d.nummer}. Person</span>
                    <label className="block">
                      <span className="mb-1 block text-xs text-leise">von</span>
                      <input type="time" name="von" defaultValue={d.von} className="w-28" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-leise">bis</span>
                      <input type="time" name="bis" defaultValue={d.bis} className="w-28" />
                    </label>
                    <label className="block min-w-[12rem] flex-1">
                      <span className="mb-1 block text-xs text-leise">Notiz</span>
                      <input name="notiz" defaultValue={d.notiz} maxLength={300} placeholder="zum Beispiel Pause während der Nachmittagsshow" />
                    </label>
                    <button type="submit" className="rounded-md border border-linie px-3 py-1.5">
                      Speichern
                    </button>
                  </form>
                ))}
              </details>
            </li>
          ))}
        </ul>
      )}

      <section id="leute" className="scroll-mt-24 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Wer im Foyer arbeitet</h2>
        <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
          {leute.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <span className="flex-1">{p.name}</span>
              <span className="text-leise">{p.fest ? "fest angestellt" : "Aushilfe, braucht Freigabe"}</span>
              {buero && (
                <form action={festMarkieren}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="fest" value={p.fest ? "nein" : "ja"} />
                  <button type="submit" className="text-xs text-leise underline">
                    {p.fest ? "als Aushilfe führen" : "als fest angestellt führen"}
                  </button>
                </form>
              )}
            </li>
          ))}
          {leute.length === 0 && <li className="px-4 py-2 text-leise">Noch niemand mit Foyer-Zugang.</li>}
        </ul>
        <p className="text-xs text-leise">
          Wer hier steht, hat einen Foyer-Zugang im Eventmanager. Neue Leute lädt Florian über die Einladungslinks
          ein. Ob jemand fest angestellt ist, tragen nur Kevin und Florian ein.
        </p>
      </section>
    </div>
  );
}
