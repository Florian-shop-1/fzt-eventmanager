"use client";

/**
 * Zeigt die Stempeluhr nur auf einem Handy.
 *
 * Die erste Prüfung macht der Server an der Browserkennung
 * (lib/stempel/geraet.ts). Die reicht nicht immer: Wer auf dem iPhone
 * einmal "Desktop-Website anfordern" eingeschaltet hat, meldet sich als
 * Mac, und dann steht da "Stempeln geht nur am Handy", obwohl das Handy
 * in der Hand liegt. Genau das ist Sabah passiert (Florian, 27.09.2026).
 *
 * Deshalb hier die zweite Prüfung, die nur der Browser beantworten kann:
 * Wie groß ist der Bildschirm wirklich, und ist es ein Finger oder eine
 * Maus? Ein Handy ist schmal und wird angetippt. Ein iPad bleibt damit
 * weiterhin draußen, denn es ist deutlich breiter, und das war der Sinn
 * der Regel: An einem fest stehenden Gerät könnte jemand für einen
 * anderen stempeln.
 *
 * Solange der Browser nichts gesagt hat, gilt das Ergebnis des Servers.
 * So sieht niemand kurz die falsche Anzeige.
 */

import { useEffect, useState, type ReactNode } from "react";

/** Breiter als das, und es ist kein Handy mehr. */
const HOECHSTE_BREITE = 560;

export function NurAmHandy({
  vomServer,
  children,
  sonst,
}: {
  /** Was die Browserkennung auf dem Server ergeben hat. */
  vomServer: boolean;
  children: ReactNode;
  sonst: ReactNode;
}) {
  const [handy, setHandy] = useState(vomServer);

  useEffect(() => {
    if (vomServer) return;

    try {
      const schmal = Math.min(window.screen.width, window.screen.height) <= HOECHSTE_BREITE;
      const finger = window.matchMedia("(pointer: coarse)").matches;
      if (schmal && finger) setHandy(true);
    } catch {
      // Kein Zugriff auf screen oder matchMedia: dann bleibt es beim
      // Ergebnis des Servers.
    }
  }, [vomServer]);

  return <>{handy ? children : sonst}</>;
}
