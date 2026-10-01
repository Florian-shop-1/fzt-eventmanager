"use client";

/**
 * Stelle wählen, Tätigkeit und Aufgaben füllen sich mit.
 *
 * Für jede Stelle steht fest, was im Vertrag darüber steht (Florian,
 * 01.10.2026). Wer "Show" wählt, bekommt die Showformulierung, wer
 * "Foyer" wählt, die Foyerformulierung. Beides bleibt danach änderbar:
 * Es ist ein Vorschlag und keine Vorschrift.
 *
 * Deshalb wird nur überschrieben, was noch unverändert ist. Wer erst
 * etwas Eigenes tippt und dann die Stelle umstellt, verliert seinen Text
 * nicht.
 */

import { useState } from "react";
import { STELLEN } from "@/lib/personal/stellen";

export function StellenWahl() {
  const [position, setPosition] = useState("");
  const [taetigkeit, setTaetigkeit] = useState("");
  const [aufgaben, setAufgaben] = useState("");
  const [angefasst, setAngefasst] = useState({ taetigkeit: false, aufgaben: false });

  function stelleGewaehlt(wert: string) {
    setPosition(wert);
    const s = STELLEN.find((x) => x.wert === wert);
    if (!s) return;
    if (!angefasst.taetigkeit) setTaetigkeit(s.taetigkeit);
    if (!angefasst.aufgaben) setAufgaben(s.aufgaben);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Stelle</span>
          <select name="position" value={position} onChange={(e) => stelleGewaehlt(e.target.value)}>
            <option value="">bitte wählen</option>
            {STELLEN.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.wert}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Tätigkeitsbezeichnung (steht im Vertrag)</span>
          <input
            name="taetigkeit"
            value={taetigkeit}
            onChange={(e) => {
              setTaetigkeit(e.target.value);
              setAngefasst((a) => ({ ...a, taetigkeit: true }));
            }}
            maxLength={120}
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-leise">Aufgaben (steht im Vertrag)</span>
        <textarea
          name="aufgaben"
          rows={2}
          maxLength={600}
          value={aufgaben}
          onChange={(e) => {
            setAufgaben(e.target.value);
            setAngefasst((a) => ({ ...a, aufgaben: true }));
          }}
          required
        />
      </label>
    </>
  );
}
