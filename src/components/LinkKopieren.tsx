"use client";

import { useState } from "react";

/** Ein Link zum Kopieren, mit Rückmeldung. */
export function LinkKopieren({ link }: { link: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setKopiert(true);
            setTimeout(() => setKopiert(false), 2500);
          } catch {
            // ohne Zwischenablage: Feld markieren, dann per Hand kopieren
          }
        }}
        className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
      >
        {kopiert ? "Kopiert" : "Link kopieren"}
      </button>
    </span>
  );
}
