"use client";

/**
 * Die stille Wache: Wer eingestempelt ist, meldet alle paar Minuten, wo er ist.
 *
 * Bisher tat das nur die Stempeluhr, solange sie offen war. Wer sie zumachte
 * und nach Hause ging, blieb unbemerkt eingestempelt (Florian, 21.09.2026).
 * Diese Wache hängt deshalb im Rahmen des ganzen Programms: Solange
 * irgendeine Seite offen ist, merkt der Server, wenn jemand das Gelände
 * verlässt.
 *
 * Ausgestempelt wird dabei niemand mehr automatisch (Florian, 29.09.2026):
 * Es geht nur eine Erinnerung raus, an die Person und ans Büro. Ohne
 * Anzeige, ohne Knopf hier.
 *
 * Was NICHT geht, und zwar an keinem Browser: Standort im Hintergrund. Ist
 * das Handy gesperrt oder der Eventmanager geschlossen, weiß niemand, wo
 * jemand ist. Dafür gibt es den nächtlichen Lauf auf dem Server, der genauso
 * nur erinnert (siehe lib/stempel/wache.ts).
 */

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Alle fünf Minuten reicht: Es geht um Feierabend, nicht um Sekunden. */
const ABSTAND_MS = 300000;

export function StempelWache() {
  const router = useRouter();
  const zuletzt = useRef(0);

  const melden = useCallback(async () => {
    if (Date.now() - zuletzt.current < ABSTAND_MS) return;
    zuletzt.current = Date.now();
    if (!navigator.geolocation) return;

    const p = await new Promise<GeolocationPosition | null>((ok) => {
      navigator.geolocation.getCurrentPosition(
        (x) => ok(x),
        () => ok(null),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 },
      );
    });
    if (!p) return;

    try {
      const antwort = await fetch("/stempeluhr/standort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          genauigkeit: p.coords.accuracy,
        }),
      });
      const e = (await antwort.json()) as { gemeldet?: boolean };
      // Es wurde erinnert (Mail an Person und Büro): Seite neu laden, damit
      // ein sichtbarer Hinweis sofort erscheint, falls es einen gibt.
      if (e.gemeldet) router.refresh();
    } catch {
      // Kein Netz oder kein Signal: dann eben beim nächsten Mal.
    }
  }, [router]);

  useEffect(() => {
    void melden();
    const t = setInterval(() => void melden(), 60000);
    const beimZurueckkommen = () => {
      if (document.visibilityState === "visible") void melden();
    };
    document.addEventListener("visibilitychange", beimZurueckkommen);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beimZurueckkommen);
    };
  }, [melden]);

  return null;
}
