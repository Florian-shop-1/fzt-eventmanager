"use client";

/**
 * Das Antwortfeld im Posteingang, mit fertigen Textvorschlägen darüber.
 *
 * Die Fragen der Gäste wiederholen sich. Passt ein Baustein zur Frage,
 * steht er gleich im Feld, und über dem Feld liegen die anderen zum
 * Umschalten (Florian, 04.10.2026). Geschickt wird nie etwas von selbst:
 * Der Text lässt sich überschreiben wie jeder andere auch.
 */

import { useState } from "react";

export interface Textvorschlag {
  titel: string;
  text: string;
}

export function Antworttext({
  name,
  vorschlaege,
  standard,
  rows = 4,
  platzhalter,
}: {
  /** Feldname im Formular, meist "text". */
  name: string;
  vorschlaege: Textvorschlag[];
  /** Was im Feld steht, wenn kein Vorschlag passt. */
  standard: string;
  rows?: number;
  platzhalter?: string;
}) {
  const [text, setText] = useState(vorschlaege[0]?.text ?? standard);
  const [gewaehlt, setGewaehlt] = useState(vorschlaege.length > 0 ? 0 : -1);

  return (
    <div className="space-y-2">
      {vorschlaege.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-leise">Vorschlag:</span>
          {vorschlaege.map((v, i) => (
            <button
              key={v.titel}
              type="button"
              onClick={() => {
                setText(v.text);
                setGewaehlt(i);
              }}
              className="rounded-md border px-2 py-1 text-xs"
              style={{
                borderColor: gewaehlt === i ? "var(--gold)" : "var(--linie)",
                background: gewaehlt === i ? "var(--gold-hell)" : "transparent",
              }}
            >
              {v.titel}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setText(standard);
              setGewaehlt(-1);
            }}
            className="text-xs text-leise underline"
          >
            leeres Feld
          </button>
        </div>
      )}

      <textarea
        name={name}
        rows={rows}
        required
        value={text}
        placeholder={platzhalter}
        onChange={(e) => {
          setText(e.target.value);
          setGewaehlt(-1);
        }}
        className="w-full rounded-md border border-linie px-3 py-2 text-sm"
      />
    </div>
  );
}
