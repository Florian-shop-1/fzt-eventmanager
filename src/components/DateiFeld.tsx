"use client";

/**
 * Eine Flaeche, auf die man Dateien ziehen kann.
 *
 * Vorher stand dort nur das schmale Feld des Browsers mit "Datei
 * auswaehlen". Wer ein Video daraufzog, bei dem passierte nichts: Der
 * Browser faengt ein fallengelassenes Video von sich aus nicht auf, er
 * oeffnet es im Zweifel in einem neuen Fenster. Es sah also aus, als
 * muesste es gehen, und ging nicht (Florian, 05.10.2026).
 *
 * Jetzt nimmt die Flaeche das Fallenlassen selbst an, zeigt waehrend des
 * Ziehens einen Rahmen und sagt danach, was sie bekommen hat. Auswaehlen
 * per Klick geht weiter wie vorher, nur ohne das nackte Browserfeld.
 */

import { useRef, useState, type DragEvent } from "react";

export function DateiFeld({
  accept,
  mehrere = false,
  beschriftung,
  hinweis,
  gewaehlt,
  onWahl,
  aus = false,
}: {
  accept: string;
  mehrere?: boolean;
  beschriftung: string;
  hinweis?: string;
  /** Was gerade gewaehlt ist, fuer die Anzeige darunter. */
  gewaehlt?: string[];
  onWahl: (dateien: File[]) => void;
  aus?: boolean;
}) {
  const [drueber, setDrueber] = useState(false);
  const feld = useRef<HTMLInputElement>(null);

  function annehmen(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    const dateien = [...liste];
    onWahl(mehrere ? dateien : dateien.slice(0, 1));
  }

  function fallenlassen(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrueber(false);
    if (aus) return;
    annehmen(e.dataTransfer?.files ?? null);
  }

  return (
    <div className="block">
      <span className="mb-1 block text-xs text-leise">{beschriftung}</span>

      <div
        onDragOver={(e) => {
          // Ohne das Abfangen oeffnet der Browser die Datei selbst.
          e.preventDefault();
          if (!aus) setDrueber(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!aus) setDrueber(true);
        }}
        onDragLeave={() => setDrueber(false)}
        onDrop={fallenlassen}
        onClick={() => !aus && feld.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!aus) feld.current?.click();
          }
        }}
        className="w-full cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm"
        style={{
          borderColor: drueber ? "var(--gold)" : "var(--linie)",
          background: drueber ? "var(--gold-hell)" : "transparent",
          opacity: aus ? 0.6 : 1,
        }}
      >
        <strong className="block">Datei hierher ziehen</strong>
        <span className="text-leise">oder hier tippen und auswählen</span>
        {hinweis && <span className="mt-1 block text-xs text-leise">{hinweis}</span>}

        <input
          ref={feld}
          type="file"
          accept={accept}
          multiple={mehrere}
          hidden
          onChange={(e) => {
            annehmen(e.target.files);
            // Zuruecksetzen, damit dieselbe Datei noch einmal gewaehlt
            // werden kann, wenn jemand sie vorher entfernt hat.
            e.target.value = "";
          }}
        />
      </div>

      {gewaehlt && gewaehlt.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-leise">
          {gewaehlt.map((n, i) => (
            <li key={`${n}-${i}`}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
