"use client";

/**
 * Die Uhr, die wirklich läuft.
 *
 * In einer E-Mail geht das nicht, dort läuft kein Javascript. Auf einer
 * Seite schon, und deshalb führt der Knopf in der Angebotsmail hierher:
 * Stunden, Minuten, Sekunden, jede Sekunde neu (Florian, 23.09.2026).
 *
 * Läuft die Frist ab, während jemand hinschaut, wechselt die Anzeige von
 * selbst auf "abgelaufen". Kein Neuladen nötig.
 */

import { useEffect, useState } from "react";

export function Countdown({ bis, onEnde }: { bis: string; onEnde?: () => void }) {
  const ziel = Date.parse(bis);
  const [jetzt, setJetzt] = useState<number | null>(null);

  useEffect(() => {
    // Erst nach dem ersten Aufbau rechnen: Server und Browser haben nie
    // exakt dieselbe Uhrzeit, und ein Unterschied im ersten Bild würde
    // React zu Recht bemängeln.
    setJetzt(Date.now());
    const uhr = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(uhr);
  }, []);

  useEffect(() => {
    if (jetzt !== null && jetzt >= ziel) onEnde?.();
  }, [jetzt, ziel, onEnde]);

  if (jetzt === null) return <div style={{ height: 96 }} aria-hidden />;

  const uebrig = Math.max(0, ziel - jetzt);
  const stunden = Math.floor(uebrig / 3600000);
  const minuten = Math.floor((uebrig % 3600000) / 60000);
  const sekunden = Math.floor((uebrig % 60000) / 1000);

  if (uebrig <= 0) {
    return (
      <p className="text-lg font-semibold" style={{ color: "#E2C97A" }}>
        Das Angebot ist abgelaufen.
      </p>
    );
  }

  return (
    <div className="flex items-end justify-center gap-3 tabular-nums">
      <Feld zahl={stunden} was="Stunden" />
      <Feld zahl={minuten} was="Minuten" />
      <Feld zahl={sekunden} was="Sekunden" />
    </div>
  );
}

function Feld({ zahl, was }: { zahl: number; was: string }) {
  return (
    <div className="text-center">
      {/* Dunkle Ziffernfelder mit goldener Linie, wie im Shop. */}
      <div
        className="rounded px-3 py-2 text-4xl font-semibold"
        style={{ background: "#080808", color: "#E2C97A", border: "1px solid rgba(201,168,76,0.35)", minWidth: 72 }}
      >
        {String(zahl).padStart(2, "0")}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide" style={{ color: "#A8A8A8" }}>
        {was}
      </div>
    </div>
  );
}
