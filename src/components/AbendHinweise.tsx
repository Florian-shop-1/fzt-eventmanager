import { hinweiseDesTages } from "@/lib/db/abendhinweis";
import { hinweisEntfernen, hinweisSpeichern } from "@/app/funktionsheet/aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

/**
 * Hinweise zum Abend, von Hand eingetragen.
 *
 * Auf Papier stehen sie ganz oben, denn sie sind das, was nicht aus den
 * Buchungen hervorgeht: Platzierung, Absprachen, offene Fragen. Am
 * Bildschirm steht darunter ein Feld zum Ergänzen, für Büro, Chefs und das
 * Foyer. Beim Drucken verschwindet das Feld.
 */
export async function AbendHinweise({
  datum,
  darfBearbeiten,
  zurueckZu,
}: {
  datum: string;
  darfBearbeiten: boolean;
  /** Wohin nach dem Speichern, etwa "/funktionsheet?abend=..." */
  zurueckZu: string;
}) {
  const hinweise = await hinweiseDesTages(datum).catch(() => []);
  if (hinweise.length === 0 && !darfBearbeiten) return null;

  return (
    <section id="hinweise" className="mb-8 scroll-mt-24">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">Hinweise zum Abend</h2>

      {hinweise.length === 0 ? (
        <p className="text-sm text-leise print:hidden">Noch keine Hinweise eingetragen.</p>
      ) : (
        <ul className="space-y-3">
          {hinweise.map((h) => (
            <li key={h.id} className="border-l-4 pl-3" style={{ borderColor: "var(--gold)" }}>
              {h.titel && <div className="font-semibold">{h.titel}</div>}
              <div className="whitespace-pre-line text-sm">{h.text}</div>
              <div className="mt-1 text-xs text-leise">
                von {h.erstelltVon}
                {h.geaendertVon && `, zuletzt geändert von ${h.geaendertVon}`}
              </div>

              {darfBearbeiten && (
                <details className="mt-1 text-sm print:hidden">
                  <summary className="cursor-pointer text-xs text-leise underline">ändern</summary>
                  <form action={hinweisSpeichern} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="zurueckZu" value={zurueckZu} />
                    <input name="titel" defaultValue={h.titel} placeholder="Überschrift, zum Beispiel Firma Noerpel" />
                    <textarea name="text" defaultValue={h.text} rows={8} />
                    <div className="flex flex-wrap items-center gap-3">
                      <Absendeknopf text="Änderung speichern" laeuftText="..." />
                    </div>
                  </form>
                  <form action={hinweisEntfernen} className="mt-2">
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="zurueckZu" value={zurueckZu} />
                    <button type="submit" className="text-xs text-leise underline">
                      Hinweis löschen
                    </button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {darfBearbeiten && (
        <details className="mt-3 print:hidden">
          <summary className="cursor-pointer text-sm underline">Hinweis hinzufügen</summary>
          <form action={hinweisSpeichern} className="mt-2 max-w-2xl space-y-2">
            <input type="hidden" name="datum" value={datum} />
            <input type="hidden" name="zurueckZu" value={zurueckZu} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Überschrift (freiwillig)</span>
              <input name="titel" placeholder="zum Beispiel Firma Noerpel" maxLength={120} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">
                Text, gern so wie im Kalender. Zeilenumbrüche bleiben erhalten.
              </span>
              <textarea name="text" rows={8} placeholder={"Platzierung im Logenbereich\nMenüs werden noch mitgeteilt"} />
            </label>
            <Absendeknopf text="Hinweis speichern" laeuftText="Wird gespeichert..." />
          </form>
        </details>
      )}
    </section>
  );
}
