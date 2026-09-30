"use client";

import { useEffect, useState } from "react";
import type { Tipp } from "@/lib/tipps/filter";
import { TippInhalt } from "./TippsListe";

/**
 * Eine Anleitung Schritt für Schritt.
 *
 * Ein Video groß, darunter die Liste aller Schritte. Wer ein Video zu Ende
 * sieht, bekommt den nächsten Schritt von selbst vorgelegt, muss ihn aber
 * starten: Automatisch weiterlaufen würde man verpassen, während man das
 * Gesehene gerade ausprobiert (Florian, 29.09.2026).
 *
 * Wie weit jemand gekommen ist, merkt sich der Browser. Wer die Anleitung
 * abends im Haus durchgeht, verliert den Faden nicht, wenn zwischendurch
 * etwas dazwischenkommt.
 */
export function ReihenAnsicht({ reiheId, titel, schritte }: { reiheId: string; titel: string; schritte: Tipp[] }) {
  const [aktuell, setAktuell] = useState(0);
  const [gesehen, setGesehen] = useState<number[]>([]);
  const merker = `fzt_tipp_reihe_${reiheId}`;

  useEffect(() => {
    try {
      const roh = localStorage.getItem(merker);
      if (!roh) return;
      const stand = JSON.parse(roh) as { aktuell?: number; gesehen?: number[] };
      if (typeof stand.aktuell === "number" && stand.aktuell < schritte.length) setAktuell(stand.aktuell);
      if (Array.isArray(stand.gesehen)) setGesehen(stand.gesehen);
    } catch {
      // Ohne gespeicherten Stand faengt man eben vorne an.
    }
  }, [merker, schritte.length]);

  function merken(neuAktuell: number, neuGesehen: number[]) {
    try {
      localStorage.setItem(merker, JSON.stringify({ aktuell: neuAktuell, gesehen: neuGesehen }));
    } catch {
      // Privates Fenster oder gesperrter Speicher: dann eben ohne Merker.
    }
  }

  function zuSchritt(i: number) {
    setAktuell(i);
    merken(i, gesehen);
  }

  function fertiggesehen(i: number) {
    const neu = gesehen.includes(i) ? gesehen : [...gesehen, i];
    setGesehen(neu);
    merken(aktuell, neu);
  }

  const schritt = schritte[aktuell];
  if (!schritt) return null;
  const letzter = aktuell === schritte.length - 1;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm text-leise">
          Schritt {aktuell + 1} von {schritte.length}
          {gesehen.length > 0 && ` · ${gesehen.length} angesehen`}
        </p>
        <h2 className="text-xl font-semibold">{schritt.titel}</h2>
        {schritt.art === "video" || !schritt.art ? (
          <video
            key={schritt.id}
            controls
            autoPlay
            preload="metadata"
            className="w-full rounded-lg bg-black"
            src={schritt.videoUrl}
            onEnded={() => fertiggesehen(aktuell)}
          />
        ) : (
          /*
            Eine Datei oder eine Notiz laeuft nicht ab, deshalb gibt es
            hier keinen Haken von selbst. Man hakt sie ab, wenn man sie
            gelesen hat (Florian, 30.09.2026).
          */
          <div className="space-y-2">
            <TippInhalt tipp={schritt} />
            <button
              type="button"
              onClick={() => fertiggesehen(aktuell)}
              className="text-xs text-leise underline"
            >
              gelesen, abhaken
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => zuSchritt(aktuell - 1)}
          disabled={aktuell === 0}
          className="rounded-md border border-linie px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Zurück
        </button>
        {!letzter ? (
          <button
            type="button"
            onClick={() => zuSchritt(aktuell + 1)}
            className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-white"
          >
            Weiter zu Schritt {aktuell + 2}: {schritte[aktuell + 1].titel}
          </button>
        ) : (
          <span className="text-sm" style={{ color: "var(--gut)" }}>
            Das war der letzte Schritt. Jetzt kannst du {titel.toLowerCase()}.
          </span>
        )}
      </div>

      <ol className="space-y-1">
        {schritte.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => zuSchritt(i)}
              className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm ${
                i === aktuell ? "border-gold bg-gold-hell" : "border-linie"
              }`}
            >
              <span
                className="flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs tabular-nums"
                style={{
                  borderColor: gesehen.includes(i) ? "var(--gut)" : "var(--linie)",
                  background: gesehen.includes(i) ? "var(--gut-hell)" : "transparent",
                  color: gesehen.includes(i) ? "var(--gut)" : "inherit",
                }}
              >
                {gesehen.includes(i) ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">{s.titel}</span>
            </button>
          </li>
        ))}
      </ol>

      {gesehen.length >= schritte.length && (
        <button
          type="button"
          onClick={() => {
            setGesehen([]);
            zuSchritt(0);
            merken(0, []);
          }}
          className="text-xs text-leise underline"
        >
          Von vorn anfangen
        </button>
      )}
    </div>
  );
}
