/**
 * "Fehlt was auf der Checkliste?"
 *
 * Wer am Abend merkt, dass ein Handgriff fehlt, soll ihn sofort loswerden
 * koennen, statt ihn bis zur naechsten Besprechung mit sich herumzutragen
 * (Florian, 05.10.2026). Uebernommen wird der Vorschlag nicht von selbst:
 * Eine Liste, die jeder erweitert, ist nach einem Monat keine Liste mehr.
 * Florian liest sie und entscheidet.
 */

import type { Liste, Vorschlag } from "@/lib/showcheck/db";

export function CheckVorschlag({
  liste,
  abend,
  vorschlaege,
  chef,
  einreichen,
  abhaken,
}: {
  liste: Liste;
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
      {/*
        Drei Fragen statt einer.

        "Fehlt was?" hat nur Punkte dazugebracht, und eine Liste, die
        immer nur waechst, liest nach einem halben Jahr niemand mehr.
        Gefragt wird deshalb auch nach dem, was weg kann und was an der
        falschen Stelle steht: "was ist unwichtig und kann weg, was
        fehlt? was muss an andere stelle? dann kann ich das nach und
        nach einbauen" (Florian, 10.10.2026).
      */}
      <h2 className="text-sm font-semibold">Wie können wir die Liste besser machen?</h2>
      <p className="mt-1 max-w-prose text-sm text-leise">
        Du arbeitest damit, du merkst es zuerst. Drei Fragen, antworte auf das, was dir auffällt:
      </p>
      <ul className="mt-2 max-w-prose list-disc space-y-0.5 pl-5 text-sm text-leise">
        <li>Was fehlt?</li>
        <li>Was ist unwichtig geworden und kann weg?</li>
        <li>Was steht an der falschen Stelle, etwa zu früh oder zu spät am Abend?</li>
      </ul>
      <p className="mt-2 max-w-prose text-sm text-leise">
        Auch Kleinigkeiten. Was dir am Abend auffällt, vergisst du bis zum nächsten Mal wieder.
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
          placeholder={
            "Zum Beispiel: Der Punkt mit den Postkarten kann weg, das macht längst die Spätschicht. " +
            "Oder: Der Gong müsste vor den Tür-Check, sonst ist es zu spät."
          }
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
