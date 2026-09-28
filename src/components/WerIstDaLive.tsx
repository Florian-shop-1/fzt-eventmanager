"use client";

/**
 * "Gerade eingestempelt", live. Für den Admin (Florian, 28.09.2026).
 *
 * Die erste Ansicht kommt vom Server, damit die Seite ohne Ruckeln steht.
 * Danach holt der Browser die Liste alle 20 Sekunden neu, solange die
 * Seite offen ist. Ein Punkt oben zeigt, dass es wirklich live ist.
 */

import { useEffect, useRef, useState } from "react";

interface Eintrag {
  benutzerId: string;
  name: string;
  seit: string;
  // Die Abfrage lässt "aus" schon weg, der Typ deckt trotzdem alle drei ab.
  zustand: "aus" | "arbeit" | "pause";
  minuten: number;
}

/** "7:45" aus Minuten, ohne die serverseitige Stempeluhr-Bibliothek zu laden. */
function stunden(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

const uhr = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

export function WerIstDaLive({ start }: { start: Eintrag[] }) {
  const [da, setDa] = useState<Eintrag[]>(start);
  const [live, setLive] = useState(true);
  const gestoppt = useRef(false);

  useEffect(() => {
    gestoppt.current = false;
    const holen = async () => {
      try {
        const antwort = await fetch("/api/stempel/wer-ist-da", { cache: "no-store" });
        if (!antwort.ok) throw new Error();
        const e = (await antwort.json()) as { ok: boolean; da?: Eintrag[] };
        if (gestoppt.current || !e.ok || !e.da) return;
        setDa(e.da);
        setLive(true);
      } catch {
        setLive(false);
      }
    };
    const t = setInterval(holen, 20000);
    const beimZurueckkommen = () => {
      if (document.visibilityState === "visible") void holen();
    };
    document.addEventListener("visibilitychange", beimZurueckkommen);
    return () => {
      gestoppt.current = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", beimZurueckkommen);
    };
  }, []);

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-leise">
        Gerade eingestempelt
        <span
          className="inline-block h-2 w-2 rounded-full"
          title={live ? "Aktualisiert sich von selbst" : "Verbindung unterbrochen, letzter Stand"}
          style={{ background: live ? "var(--gut)" : "var(--warnung)" }}
        />
      </h2>
      {da.length === 0 ? (
        <p className="text-sm text-leise">Im Moment ist niemand eingestempelt.</p>
      ) : (
        <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
          {da.map((p) => (
            <li key={p.benutzerId} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
              <span className="flex-1 font-medium">{p.name}</span>
              <span className="text-leise">
                seit {uhr(p.seit)}
                {p.zustand === "pause" && ", in der Pause"}
              </span>
              <span className="tabular-nums">{stunden(p.minuten)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
