"use client";

/**
 * Weitere Foyerplaetze, so viele wie gebraucht werden.
 *
 * Unter den festen Plaetzen steht ein Pluszeichen. Jeder Klick legt
 * einen weiteren Platz an, und darunter steht sofort wieder eines, ohne
 * dass vorher gespeichert werden muss: "wenn der dritte geklickt wurde,
 * dass er erscheint, muss wieder ein plus drunter sein, dass man
 * 'unendlich' einteilen kann" (Florian, 04.10.2026).
 *
 * Die Zeilen heissen wie die festen Plaetze (benutzerN, vonN, bisN), das
 * Formular des Tages schickt sie also einfach mit. Wer eine Zeile offen
 * laesst, bekommt keinen leeren Platz: Die Aktion raeumt sie weg.
 */

import { useState } from "react";

export interface FoyerLeute {
  id: string;
  name: string;
  fest: boolean;
}

export function FoyerZusatzPlaetze({
  abNummer,
  von,
  bis,
  leute,
}: {
  /** Nummer des naechsten freien Platzes. */
  abNummer: number;
  /** Vorgeschlagene Zeiten, dieselben wie bei der zweiten Person. */
  von: string;
  bis: string;
  leute: FoyerLeute[];
}) {
  const [anzahl, setAnzahl] = useState(0);
  // Mehr als zwanzig Leute stehen nicht im Foyer. Die Grenze gilt auch
  // beim Speichern, siehe app/foyer/plan/aktionen.ts.
  const platzFrei = abNummer + anzahl <= 20;

  return (
    <>
      {anzahl > 0 && (
        <ul className="space-y-2">
          {Array.from({ length: anzahl }, (_, i) => abNummer + i).map((n) => (
            <li key={n} className="flex flex-wrap items-center gap-2 border-t border-linie pt-2 text-sm">
              <span className="w-24 shrink-0 font-medium">{n}. Person</span>
              <input type="hidden" name={`von${n}`} value={von} />
              <input type="hidden" name={`bis${n}`} value={bis} />
              <select name={`benutzer${n}`} defaultValue="offen" className="text-sm">
                <option value="offen">offen</option>
                {leute.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.fest ? "" : " (Aushilfe)"}
                  </option>
                ))}
              </select>
              <span className="text-leise">
                {von || "?"} bis {bis || "?"} Uhr
              </span>
            </li>
          ))}
        </ul>
      )}

      {platzFrei && (
        <button
          type="button"
          onClick={() => setAnzahl((a) => a + 1)}
          className="mt-2 text-sm text-leise underline"
        >
          + weitere Mitarbeiter einteilen
        </button>
      )}

      {anzahl > 0 && (
        <p className="mt-1 text-xs text-leise">
          Nicht vergessen: &quot;Tag speichern&quot;, sonst bleibt die Einteilung nicht.
        </p>
      )}
    </>
  );
}
