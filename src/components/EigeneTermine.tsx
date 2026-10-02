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
export function EigeneTermine({
  termine,
  zurueckZu,
  offen,
}: {
  termine: EigenerTermin[];
  zurueckZu: string;
  /**
   * Aufgeklappt anzeigen.
   *
   * Auf der eigenen Seite unter "Events" ist das Formular der Inhalt,
   * dort muss niemand erst aufklappen. Eingebettet in eine andere Seite
   * bleibt es zugeklappt (Florian, 28.09.2026).
   */
  offen?: boolean;
}) {
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const tag = (d: string) => d.split("-").reverse().join(".");

  return (
    <details
      id="termin"
      open={offen}
      className="scroll-mt-24 rounded-lg border border-linie bg-flaeche p-4 text-sm print:hidden"
    >
      <summary className={`cursor-pointer font-medium${offen ? " sr-only" : ""}`}>
        Termin ohne Ticketshop anlegen
      </summary>
      {!offen && (
        <p className="mt-2 text-leise">
          Für Abende, die nicht über den Ticketshop laufen: Das Haus ist exklusiv gebucht, die Firma bringt ihre Gäste
          selbst mit. Der Tag taucht danach überall auf, wo auch die anderen Vorstellungen stehen: Funktionsheet,
          Küchenblatt, Sitzplan, Einlass und Dienstplan. Menüs und Gruppen trägst du wie gewohnt weiter unten ein.
        </p>
      )}
      {offen && (
        <p className="text-leise">
          Der Tag steht danach im Funktionsheet, auf dem Küchenblatt, im Sitzplan, am Einlass und im Dienstplan.
          Menüs und Gruppen trägst du wie gewohnt im Funktionsheet ein.
        </p>
      )}

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

        {/*
          Mit Show oder nur das Haus.

          Ohne Show wird kein Showteam ausgeschrieben, dann steht im
          Dienstplan an dem Abend nichts. Technik kann trotzdem nötig
          sein, etwa Licht und ein Mikrofon für die Ansprache
          (Florian, 30.09.2026).
        */}
        <fieldset className="rounded-md border border-linie px-3 py-2">
          <legend className="px-1 text-xs text-leise">Was ist an dem Abend?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="mitShow" value="ja" defaultChecked />
            Mit Show. Das Showteam wird wie immer eingeteilt.
          </label>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="radio" name="mitShow" value="nein" />
            Ohne Show, nur das Haus vermietet. Kein Showteam nötig.
          </label>

          {/*
            Welche Show, das entscheidet über die Einteilung.

            Den Flo-Zirkus macht Ben allein, die Ulmfassbar braucht das
            ganze Showteam. Im Namen des Termins steht das nicht, also
            wird gefragt (Florian, 02.10.2026).
          */}
          <div className="mt-3 border-t border-linie pt-2">
            <span className="text-xs text-leise">Wenn mit Show: welche?</span>
            <div className="mt-1 flex flex-wrap gap-4">
              {[
                ["ulmfassbar", "ULMFASSBAR"],
                ["flozirkus", "Flo-Zirkus (macht Ben allein)"],
                ["andere", "Andere"],
              ].map(([wert, titel]) => (
                <label key={wert} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="showArt" value={wert} defaultChecked={wert === "ulmfassbar"} />
                  {titel}
                </label>
              ))}
            </div>
            <input className="mt-2" name="showName" maxLength={120} placeholder="Bei „Andere“: welche Show?" />
          </div>
        </fieldset>

        {/*
          Die Technik, und zwar wofür genau.

          "das muss so sein, dass der mitarbeiter der es anlegt gleich
          dran denkt" (Florian, 02.10.2026). Deshalb stehen die üblichen
          Fälle zum Anhaken da, statt eines leeren Feldes, vor dem man
          sitzt und nichts einfällt.
        */}
        <fieldset className="rounded-md border border-linie px-3 py-2">
          <legend className="px-1 text-xs text-leise">Braucht es einen Techniker?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="technik" value="ja" />
            <span>Ja, ein Techniker wird eingeteilt</span>
          </label>

          <div className="mt-2 space-y-1">
            <span className="text-xs text-leise">Wofür genau? Bitte alles anhaken, was zutrifft.</span>
            {[
              "Showroom einschalten und Licht einstellen",
              "Mikrofone für die Gäste",
              "Präsentation über den eigenen Laptop der Gäste (HDMI einstecken)",
              "Musik oder Einspieler vom Veranstalter",
              "Programmierung von Licht oder Ton",
            ].map((was) => (
              <label key={was} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="technikWas" value={was} className="mt-1" />
                <span>{was}</span>
              </label>
            ))}
            <input
              name="technikFrei"
              maxLength={300}
              placeholder="Sonst noch etwas? Zum Beispiel: Gäste brauchen 2 Mikrofone"
            />
          </div>

          {/*
            Wer dafür infrage kommt. Steht hier und nicht in einem
            Handbuch, weil hier die Entscheidung fällt.
          */}
          <p className="mt-2 rounded border border-linie px-2 py-1 text-xs text-leise">
            <strong>Wen einteilen?</strong> Für Einschalten und Licht ist Ben die erste Wahl. Geht es um
            Programmierung, muss Lenny (extern) gebucht werden oder Leeven, der sich inzwischen auch sehr
            gut auskennt. Für eine reine Präsentation reicht ein Techniker, das ist sehr einfach. Und wenn
            niemand kann: Den Showroom einschalten kann wirklich jeder.
          </p>
        </fieldset>

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
                  <label className="block">
                    <span className="mb-1 block text-xs text-leise">Abend</span>
                    <select name="mitShow" defaultValue={t.mitShow ? "ja" : "nein"} className="w-40">
                      <option value="ja">mit Show</option>
                      <option value="nein">ohne Show</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 pb-2 text-xs">
                    <input type="checkbox" name="technik" value="ja" defaultChecked={t.brauchtTechnik} />
                    Techniker
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
