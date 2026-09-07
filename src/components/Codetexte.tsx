"use client";

/**
 * Die Textfelder des Codeversands, mit Vorlagenauswahl darüber.
 *
 * Warum die drei Felder in einer eigenen Komponente sitzen: Eine Auswahl
 * soll drei Felder auf einmal füllen. Das geht nur, wenn sie gemeinsam
 * einen Zustand haben. Der Rest des Formulars bleibt davon unberührt und
 * wird weiterhin auf dem Server gebaut.
 *
 * Geschickt wird immer, was in den Feldern steht. Die Vorlage ist ein
 * Startpunkt, kein Korsett: Wer den Text noch anpassen will, tippt
 * einfach hinein.
 */

import { useState } from "react";
import { CODEVORLAGEN, CODEVORLAGE_STANDARD } from "@/lib/mail/codevorlagen";

export function Codetexte() {
  const [gewaehlt, setGewaehlt] = useState(CODEVORLAGE_STANDARD.schluessel);
  const [betreff, setBetreff] = useState(CODEVORLAGE_STANDARD.betreff);
  const [einleitung, setEinleitung] = useState(CODEVORLAGE_STANDARD.einleitung);
  const [schluss, setSchluss] = useState(CODEVORLAGE_STANDARD.schluss);

  const vorlage = CODEVORLAGEN.find((v) => v.schluessel === gewaehlt);

  const wechseln = (schluessel: string) => {
    const neu = CODEVORLAGEN.find((v) => v.schluessel === schluessel);
    if (!neu) return;
    setGewaehlt(schluessel);
    setBetreff(neu.betreff);
    setEinleitung(neu.einleitung);
    setSchluss(neu.schluss);
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-leise">Vorlage</span>
        <select
          value={gewaehlt}
          onChange={(e) => wechseln(e.target.value)}
          className="mt-1 w-full rounded-md border border-linie bg-flaeche px-3 py-2"
        >
          {CODEVORLAGEN.map((v) => (
            <option key={v.schluessel} value={v.schluessel}>
              {v.name}
            </option>
          ))}
        </select>
        {vorlage && <span className="mt-1 block text-xs text-leise">{vorlage.wofuer}</span>}
      </label>

      <label className="block text-sm">
        <span className="text-leise">Betreff</span>
        <input
          type="text"
          name="betreff"
          value={betreff}
          onChange={(e) => setBetreff(e.target.value)}
          className="mt-1 w-full rounded-md border border-linie px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="text-leise">Einleitung, steht über den Codes</span>
        <textarea
          name="einleitung"
          rows={5}
          value={einleitung}
          onChange={(e) => setEinleitung(e.target.value)}
          className="mt-1 w-full rounded-md border border-linie px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="text-leise">Schluss, steht unter den Codes</span>
        <textarea
          name="schluss"
          rows={8}
          value={schluss}
          onChange={(e) => setSchluss(e.target.value)}
          className="mt-1 w-full rounded-md border border-linie px-3 py-2"
        />
        <span className="mt-1 block text-xs text-leise">
          Dazwischen stehen die Codes, je Vorrat mit seinem Einlösehinweis.
        </span>
      </label>
    </div>
  );
}
