"use client";

/**
 * Ein sichtbarer Druckknopf.
 *
 * Rechtsklick und Drucken tut es auch, aber nur wer weiß, dass eine Seite
 * zum Ausdrucken gedacht ist, kommt auf die Idee. Der Knopf sagt es.
 *
 * Er verschwindet im Ausdruck selbst, sonst stünde er auf dem Papier.
 */

import { useState } from "react";

export function DruckKnopf({
  text = "Drucken",
  hinweis,
}: {
  text?: string;
  /** Kleine Zeile daneben, etwa "am besten Hochformat". */
  hinweis?: string;
}) {
  const [geklickt, setGeklickt] = useState(false);

  return (
    <div className="print:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setGeklickt(true);
            window.print();
          }}
          className="inline-flex items-center gap-2 rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
        >
          <Drucker />
          {text}
        </button>
        {hinweis && <span className="text-xs text-leise">{hinweis}</span>}
      </div>

      {geklickt && <Vorschauhinweis />}
    </div>
  );
}

/**
 * Was tun, wenn die Druckvorschau nicht kommt?
 *
 * Der häufigste Grund liegt nicht an der Seite, sondern am Drucker: Ist
 * er über das Netzwerk eingebunden und gerade nicht erreichbar, etwa in
 * einem anderen WLAN, fragt der Browser ihn nach seinen Fähigkeiten und
 * wartet auf eine Antwort, die nicht kommt. Sichtbar wird das als
 * "Vorschau wird geladen", endlos.
 *
 * Der Ausweg ist immer derselbe und dauert zwei Klicks, deshalb steht er
 * hier. Er erscheint erst nach dem Klick auf Drucken: Wer keine Probleme
 * hat, soll ihn nicht lesen müssen.
 */
export function Vorschauhinweis() {
  return (
    <p className="mt-2 max-w-prose text-xs text-leise">
      Bleibt die Vorschau bei <em>„Vorschau wird geladen“</em> stehen, liegt es fast immer am
      Drucker, nicht an dieser Seite. Stell im Druckfenster oben bei <strong>Ziel</strong> auf{" "}
      <strong>„Als PDF speichern“</strong>. Dann kommt die Vorschau sofort, und aus dem PDF lässt
      sich anschließend in Ruhe drucken.
    </p>
  );
}

/** Schlichtes Druckersymbol, damit der Knopf auf einen Blick erkennbar ist. */
function Drucker() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}
