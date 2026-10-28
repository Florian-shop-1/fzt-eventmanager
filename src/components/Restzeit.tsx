"use client";

/**
 * Wie lange die Plätze noch gehalten werden.
 *
 * "es könnte DEZENT die zeit daneben stehen, dass man bisschen druck
 * hat" (Florian, 28.10.2026). Dezent heisst hier: eine Zeile in der
 * Schriftgröße der Nebensätze, keine Farbe, kein Ticken auf die Sekunde.
 * Ein Countdown mit laufenden Sekunden wirkt wie ein Verkaufstrick und
 * passt nicht zu einem Angebot an eine Firma. Tage und Stunden genügen,
 * um den Punkt zu machen.
 *
 * Gerechnet wird erst im Browser. Auf dem Server stünde sonst eine
 * Zeitspanne, die beim Ansehen schon wieder eine andere ist.
 */

import { useEffect, useState } from "react";

function spanne(bis: Date): string | null {
  const rest = bis.getTime() - Date.now();
  if (rest <= 0) return null;

  const stunden = Math.floor(rest / 3_600_000);
  const tage = Math.floor(stunden / 24);
  if (tage >= 1) {
    const uebrig = stunden - tage * 24;
    return `noch ${tage} ${tage === 1 ? "Tag" : "Tage"}` +
      (uebrig > 0 ? ` und ${uebrig} ${uebrig === 1 ? "Stunde" : "Stunden"}` : "");
  }
  if (stunden >= 1) return `noch ${stunden} ${stunden === 1 ? "Stunde" : "Stunden"}`;
  const minuten = Math.max(1, Math.round(rest / 60_000));
  return `noch ${minuten} ${minuten === 1 ? "Minute" : "Minuten"}`;
}

export function Restzeit({ bis }: { bis: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const ziel = new Date(bis);
    const rechnen = () => setText(spanne(ziel));
    rechnen();
    const uhr = setInterval(rechnen, 60_000);
    return () => clearInterval(uhr);
  }, [bis]);

  if (!text) return null;
  return <span>{text}</span>;
}
