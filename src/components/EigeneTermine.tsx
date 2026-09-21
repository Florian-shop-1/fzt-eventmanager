import { terminAendern, terminAnlegen, terminEntfernen } from "@/app/funktionsheet/aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";
import type { EigenerTermin } from "@/lib/db/eigenertermin";

/**
 * Einen Termin aufmachen, den es im Ticketshop nicht gibt.
 *
 * Gedacht für das exklusiv gebuchte Haus: Eine Firma mietet das Theater,
 * es werden keine Karten verkauft, in Ditix steht nichts. Sobald der
 * Termin hier angelegt ist, gibt es für diesen Tag ein Funktionsheet, ein
 * Küchenblatt, einen Sitzplan und eine Zeile im Dienstplan.
 *
 * Nur für Florian und Kevin (siehe darfTermineAnlegen).
 */
export function EigeneTermine({ termine, zurueckZu }: { termine: EigenerTermin[]; zurueckZu: string }) {
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const tag = (d: string) => d.split("-").reverse().join(".");

  return (
    <details id="termin" className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm print:hidden">
      <summary className="cursor-pointer font-medium">Termin ohne Ticketshop anlegen</summary>
      <p className="mt-2 text-leise">
        Für Abende, die nicht über den Ticketshop laufen: Das Haus ist exklusiv gebucht, die Firma bringt ihre Gäste
        selbst mit. Der Tag taucht danach überall auf, wo auch die anderen Vorstellungen stehen: Funktionsheet,
        Küchenblatt, Sitzplan, Einlass und Dienstplan. Menüs und Gruppen trägst du wie gewohnt weiter unten ein.
      </p>

      <form action={terminAnlegen} className="mt-3 space-y-3">
        <input type="hidden" name="zurueckZu" value={zurueckZu} />
        <input type="hidden" name="anker" value="termin" />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Datum</span>
            <input type="date" name="datum" min={heute} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Beginn</span>
            <input type="time" name="uhrzeit" defaultValue="20:00" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Anlass</span>
            <input name="name" required maxLength={120} placeholder="zum Beispiel Exklusiv: Firma Noerpel" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Notiz, freiwillig</span>
          <input name="notiz" maxLength={300} placeholder="zum Beispiel Haus komplett gebucht, kein Kartenverkauf" />
        </label>
        <Absendeknopf text="Termin anlegen" laeuftText="Wird angelegt..." />
      </form>

      {termine.length > 0 && (
        <div className="mt-4 border-t border-linie pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-leise">Eigene Termine</p>
          <ul className="space-y-3">
            {termine.map((t) => (
              <li key={t.id}>
                <form action={terminAendern} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="zurueckZu" value={zurueckZu} />
                  <input type="hidden" name="anker" value="termin" />
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Datum</span>
                    <input type="date" name="datum" defaultValue={t.datum} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Beginn</span>
                    <input type="time" name="uhrzeit" defaultValue={t.uhrzeit} className="w-28" />
                  </label>
                  <label className="block min-w-[12rem] flex-1">
                    <span className="mb-1 block text-xs text-leise">Anlass</span>
                    <input name="name" defaultValue={t.name} maxLength={120} />
                  </label>
                  <label className="block min-w-[12rem] flex-1">
                    <span className="mb-1 block text-xs text-leise">Notiz</span>
                    <input name="notiz" defaultValue={t.notiz} maxLength={300} />
                  </label>
                  <button type="submit" className="rounded-md border border-linie px-3 py-1.5">
                    Speichern
                  </button>
                </form>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-leise">
                  <a href={`/funktionsheet?abend=${t.eventId}`} className="underline">
                    Funktionsheet vom {tag(t.datum)}
                  </a>
                  {t.angelegtVon && <span>angelegt von {t.angelegtVon}</span>}
                  <form action={terminEntfernen}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="zurueckZu" value={zurueckZu} />
                    <input type="hidden" name="anker" value="termin" />
                    <button type="submit" className="underline">
                      Termin entfernen
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
