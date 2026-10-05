/**
 * "Fehlt was auf der Checkliste?"
 *
 * Wer am Abend merkt, dass ein Handgriff fehlt, soll ihn sofort loswerden
 * koennen, statt ihn bis zur naechsten Besprechung mit sich herumzutragen
 * (Florian, 05.10.2026). Uebernommen wird der Vorschlag nicht von selbst:
 * Eine Liste, die jeder erweitert, ist nach einem Monat keine Liste mehr.
 * Florian liest sie und entscheidet.
 */

import type { Vorschlag } from "@/lib/showcheck/db";

export function CheckVorschlag({
  liste,
  abend,
  vorschlaege,
  chef,
  einreichen,
  abhaken,
}: {
  liste: "show" | "foyer";
  /** Zurueck zur richtigen Seite nach dem Abschicken. */
  abend: string;
  /** Nur fuer Florian: was bisher eingegangen ist. */
  vorschlaege: Vorschlag[];
  chef: boolean;
  einreichen: (f: FormData) => Promise<void>;
  abhaken: (f: FormData) => Promise<void>;
}) {
  const zeitpunkt = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section className="rounded-lg border border-dashed border-linie p-4 print:hidden">
      <h2 className="text-sm font-semibold">Fehlt was auf der Checkliste?</h2>
      <p className="mt-1 max-w-prose text-sm text-leise">
        Schreib es auf, dann schauen wir es uns an. Auch Kleinigkeiten: Was dir am Abend auffällt,
        vergisst du bis zum nächsten Mal wieder.
      </p>

      {/*
        Ein mehrzeiliges Feld, kein schmaler Einzeiler.

        Im Einzeiler lief der Satz nach links aus dem Bild, und wer einen
        ganzen Vorschlag schreibt, sieht seinen Anfang nicht mehr: "Ganz
        hinten, ich komm aber auch nicht mehr vor" (Mitarbeiterin im
        Foyer, 05.10.2026). Auf dem Handy, mit halber Tastatur im Weg,
        ist das unbrauchbar.
      */}
      <form action={einreichen} className="mt-3 space-y-2">
        <input type="hidden" name="liste" value={liste} />
        <input type="hidden" name="abend" value={abend} />
        <textarea
          name="text"
          rows={3}
          maxLength={1000}
          required
          placeholder="Zum Beispiel: Beim eingestellten Timer schaltet sich der Ofen nicht ein."
          className="w-full rounded-md border border-linie px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm">
          Abschicken
        </button>
      </form>

      {chef && vorschlaege.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {vorschlaege.map((v) => (
            <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 rounded-md border border-linie px-3 py-2">
              <span className="min-w-0 flex-1">{v.text}</span>
              <span className="text-xs text-leise">
                {v.von || "unbekannt"}, {zeitpunkt(v.angelegtAm)} Uhr
              </span>
              <form action={abhaken}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="liste" value={liste} />
                <input type="hidden" name="abend" value={abend} />
                <button type="submit" className="text-xs text-leise underline">
                  erledigt
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {chef && vorschlaege.length === 0 && (
        <p className="mt-3 text-xs text-leise">Gerade liegt nichts vor.</p>
      )}
    </section>
  );
}
