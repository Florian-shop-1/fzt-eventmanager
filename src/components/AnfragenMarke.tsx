"use client";

import { useEffect, useState } from "react";

/**
 * Das rote Zeichen an den Anfragen, wie bei WhatsApp (Florian, 28.10.2026).
 *
 * "immer wenn eine neue kommt, dann muss da ein zeichen dran sein wie bei whats app. für uns sehr wichtig."
 *
 * Gezählt wird, was noch niemand angefasst hat, also alles, was auf "Anfrage eingegangen" steht. Es verschwindet
 * deshalb nicht dadurch, dass jemand die Liste kurz aufmacht, sondern erst, wenn die Anfrage einen Stand bekommt,
 * und dann bei allen im Haus. Eine Anfrage, die angeschaut und wieder zugeklappt wurde, bleibt sichtbar liegen.
 *
 * Nachgefragt wird alle 20 Sekunden und zusätzlich, sobald der Eventmanager wieder nach vorne kommt. Dasselbe
 * Vorgehen wie beim WhatsApp-Melder: kein Dienst im Hintergrund, der für drei Leute am Schreibtisch nichts bringt.
 */

const ALLE_SEKUNDEN = 20;

export function useNeueAnfragen(aktiv: boolean): number {
  const [neu, setNeu] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let lebt = true;

    const nachsehen = async () => {
      try {
        const antwort = await fetch("/leads/stand", { cache: "no-store" });
        if (!antwort.ok || !lebt) return;
        const d = (await antwort.json()) as { neu?: number };
        setNeu(Number(d.neu) || 0);
      } catch {
        /* Netz kurz weg: beim nächsten Mal wieder */
      }
    };

    nachsehen();
    const uhr = setInterval(nachsehen, ALLE_SEKUNDEN * 1000);
    const beiRueckkehr = () => {
      if (!document.hidden) nachsehen();
    };
    document.addEventListener("visibilitychange", beiRueckkehr);

    return () => {
      lebt = false;
      clearInterval(uhr);
      document.removeEventListener("visibilitychange", beiRueckkehr);
    };
  }, [aktiv]);

  return neu;
}

/**
 * Die Zahl im roten Kreis.
 *
 * `schwebend` setzt sie an die obere rechte Ecke des Reiters, so wie das Zeichen an einem App-Symbol sitzt. Ohne
 * das steht sie in der Zeile, hinter dem Wort "Anfragen".
 */
export function AnfragenMarke({ zahl, schwebend = false }: { zahl: number; schwebend?: boolean }) {
  if (zahl <= 0) return null;
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums text-white ${
        schwebend ? "absolute -top-1.5 -right-1.5 ring-2 ring-white" : "ml-2 align-middle"
      }`}
      style={{ background: "#E5383B" }}
      aria-label={`${zahl} neue ${zahl === 1 ? "Anfrage" : "Anfragen"}`}
      title={`${zahl} ${zahl === 1 ? "Anfrage wartet" : "Anfragen warten"} auf Bearbeitung`}
    >
      {zahl > 99 ? "99+" : zahl}
    </span>
  );
}
