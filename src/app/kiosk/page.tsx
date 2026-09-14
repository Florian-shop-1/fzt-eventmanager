import { stehtischeKommenderAbende, type KioskShow } from "@/lib/kiosk/stehtische";
import { datumMitWochentag, isoDatum, zeitpunkt } from "@/lib/zeit";

export const metadata = { title: "Food-Kiosk | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Seite für den Food-Kiosk.
 *
 * Arnivan bringt die Zauberschnitten (Pinsa) kurz vor der Pause an die
 * Stehtische. Er braucht zwei Dinge: wie viele Tische an welchem Abend,
 * und wann ungefähr die Pause ist. Mehr steht hier absichtlich nicht,
 * siehe lib/kiosk/stehtische.ts.
 *
 * Gedacht fürs Handy: eine Spalte, der heutige Abend groß oben.
 */
export default async function KioskSeite() {
  const { tage, fehler } = await stehtischeKommenderAbende();
  const heute = isoDatum(new Date());
  const heutigerTag = tage.find((t) => t.datum === heute);
  const spaeter = tage.filter((t) => t.datum !== heute);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Food-Kiosk</h1>
        <p className="mt-1 text-sm text-leise">
          Gebuchte Stehtische je Vorstellung. Auf jeden Tisch gehört eine Zauberschnitte (Pinsa)
          zum Teilen, bitte kurz vor der Pause an den Tisch bringen. Die Pause beginnt etwa 50
          Minuten bis eine Stunde nach Showbeginn.
        </p>
        <p className="mt-1 text-xs text-leise">
          Stand {zeitpunkt(new Date())}. Bis zum Abend können noch Tische dazukommen.
        </p>
      </header>

      {fehler && (
        <p
          className="rounded-lg border-2 px-4 py-3 text-sm"
          style={{ borderColor: "var(--blocker)", color: "var(--blocker)" }}
        >
          <strong>Die Buchungen konnten gerade nicht gelesen werden.</strong> Die Zahlen unten
          stimmen deshalb nicht. Bitte später noch einmal öffnen oder im Theater nachfragen.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-leise">Heute</h2>
        {heutigerTag ? (
          <div className="space-y-3">
            {heutigerTag.shows.map((s) => (
              <ShowKarte key={s.ditixEventId} show={s} gross />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-linie px-4 py-6 text-center text-sm text-leise">
            Heute ist keine Vorstellung.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-leise">
          Die nächsten vier Wochen
        </h2>
        {spaeter.length === 0 ? (
          <p className="text-sm text-leise">Keine weiteren Vorstellungen im Spielplan.</p>
        ) : (
          <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche">
            {spaeter.map((t) => (
              <li key={t.datum} className="px-4 py-3">
                <div className="text-sm font-medium">{datumMitWochentag(t.datum)}</div>
                <div className="mt-2 space-y-2">
                  {t.shows.map((s) => (
                    <ShowKarte key={s.ditixEventId} show={s} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ShowKarte({ show, gross = false }: { show: KioskShow; gross?: boolean }) {
  const aufteilung = show.nachArt
    .filter((a) => a.anzahl > 0)
    .map((a) => `${a.anzahl} ${a.art}`)
    .join(" · ");

  if (!gross) {
    return (
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <div className="min-w-0">
          <span className="tabular-nums">{show.uhrzeit}</span>{" "}
          <span className="text-leise">{show.name}</span>
          <div className="text-xs text-leise">
            Pause ca. {show.pauseAb} bis {show.pauseBis}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-lg font-semibold tabular-nums ${show.stehtische === 0 ? "text-leise" : ""}`}>
            {show.stehtische}
          </span>{" "}
          <span className="text-xs text-leise">{show.stehtische === 1 ? "Tisch" : "Tische"}</span>
          {aufteilung && <div className="text-xs text-leise">{aufteilung}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border px-5 py-4"
      style={
        show.stehtische > 0
          ? { borderColor: "var(--gold)", background: "var(--gold-hell)" }
          : { borderColor: "var(--linie)" }
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          Show um <strong className="tabular-nums">{show.uhrzeit}</strong>{" "}
          <span className="text-leise">{show.name}</span>
        </div>
        <div className="text-sm">
          Pause ca. <strong className="tabular-nums">{show.pauseAb}</strong> bis{" "}
          <strong className="tabular-nums">{show.pauseBis}</strong>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tabular-nums">{show.stehtische}</span>
        <span className="text-base">{show.stehtische === 1 ? "Stehtisch" : "Stehtische"}</span>
      </div>
      {aufteilung && <div className="mt-1 text-sm text-leise">{aufteilung}</div>}
      {show.stehtische === 0 && (
        <div className="mt-1 text-sm text-leise">Für diese Vorstellung ist nichts zu liefern.</div>
      )}
    </div>
  );
}
