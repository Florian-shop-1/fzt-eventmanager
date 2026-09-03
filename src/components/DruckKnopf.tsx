"use client";

/**
 * Ein sichtbarer Druckknopf.
 *
 * Rechtsklick und Drucken tut es auch, aber nur wer weiß, dass eine Seite
 * zum Ausdrucken gedacht ist, kommt auf die Idee. Der Knopf sagt es.
 *
 * Er verschwindet im Ausdruck selbst, sonst stünde er auf dem Papier.
 */

export function DruckKnopf({
  text = "Drucken",
  hinweis,
}: {
  text?: string;
  /** Kleine Zeile daneben, etwa "am besten Hochformat". */
  hinweis?: string;
}) {
  return (
    <div className="flex items-center gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
      >
        <Drucker />
        {text}
      </button>
      {hinweis && <span className="text-xs text-leise">{hinweis}</span>}
    </div>
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
