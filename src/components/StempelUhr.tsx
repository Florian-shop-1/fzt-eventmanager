"use client";

/**
 * Die Stempeluhr am Handy.
 *
 * Ein großer Knopf, mehr nicht. Vor jedem Stempel holt sie die Position
 * und schickt sie mit; erlaubt wird der Stempel auf dem Server.
 *
 * Solange die Seite offen ist, meldet sie alle drei Minuten, wo das Handy
 * ist. Verlässt jemand eingestempelt das Gelände, erscheint hier ein
 * Hinweis, und Florian und Kevin bekommen eine Mail. Im Hintergrund, also
 * bei gesperrtem Handy, darf eine Webseite das GPS nicht abfragen. Diese
 * Lücke schließt der Lauf auf dem Server (siehe lib/stempel/wache.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Zustand = "aus" | "arbeit" | "pause";

const TEXTE: Record<Zustand, { titel: string; knopf: string; art: string; farbe: string }> = {
  aus: { titel: "Du bist ausgestempelt", knopf: "Kommen", art: "kommen", farbe: "var(--gut)" },
  arbeit: { titel: "Du arbeitest", knopf: "Gehen", art: "gehen", farbe: "var(--blocker)" },
  pause: { titel: "Du bist in der Pause", knopf: "Pause beenden", art: "pause_ende", farbe: "var(--gut)" },
};

export function StempelUhr({
  start,
  arbeitszeit,
  pausenzeit,
}: {
  start: Zustand;
  arbeitszeit: string;
  pausenzeit: string;
}) {
  const router = useRouter();
  const [zustand, setZustand] = useState<Zustand>(start);
  const [zeiten, setZeiten] = useState({ arbeit: arbeitszeit, pause: pausenzeit });
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const letzterPing = useRef(0);

  const position = useCallback(
    () =>
      new Promise<GeolocationPosition>((ok, nein) => {
        if (!navigator.geolocation) return nein(new Error("Dieses Gerät kennt keinen Standort."));
        navigator.geolocation.getCurrentPosition(ok, nein, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        });
      }),
    [],
  );

  async function stempeln(art: string) {
    setLaeuft(true);
    setFehler("");
    setMeldung("");
    try {
      const p = await position().catch(() => null);
      const antwort = await fetch("/stempeluhr/stempeln", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          art,
          lat: p?.coords.latitude,
          lon: p?.coords.longitude,
          genauigkeit: p?.coords.accuracy,
        }),
      });
      const e = (await antwort.json()) as {
        ok: boolean;
        fehler?: string;
        zustand?: Zustand;
        arbeitszeit?: string;
        pause?: string;
      };
      if (!e.ok) {
        setFehler(e.fehler ?? "Das hat nicht geklappt.");
        return;
      }
      setZustand(e.zustand ?? zustand);
      setZeiten({ arbeit: e.arbeitszeit ?? zeiten.arbeit, pause: e.pause ?? zeiten.pause });
      setMeldung(
        art === "kommen"
          ? "Willkommen! Deine Zeit läuft."
          : art === "gehen"
            ? "Feierabend, deine Zeit ist gespeichert."
            : art === "pause_start"
              ? "Pause läuft."
              : "Weiter geht's.",
      );
      router.refresh();
    } catch {
      setFehler("Der Standort ließ sich nicht abfragen. Bitte den Zugriff erlauben.");
    } finally {
      setLaeuft(false);
    }
  }

  // Solange die Seite offen ist: alle drei Minuten melden, wo wir sind.
  useEffect(() => {
    if (zustand === "aus") return;
    let gestoppt = false;
    const pruefen = async () => {
      if (gestoppt || Date.now() - letzterPing.current < 150000) return;
      letzterPing.current = Date.now();
      try {
        const p = await position();
        const antwort = await fetch("/stempeluhr/standort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            genauigkeit: p.coords.accuracy,
          }),
        });
        const e = (await antwort.json()) as { drin?: boolean; entfernung?: number };
        if (e.drin === false && !gestoppt) {
          setFehler(
            `Du bist rund ${e.entfernung} Meter vom Haus entfernt und noch eingestempelt. Bitte stempel aus.`,
          );
        }
      } catch {
        // Kein Signal: dann eben beim nächsten Mal.
      }
    };
    const t = setInterval(pruefen, 180000);
    const beimZurueckkommen = () => {
      if (document.visibilityState === "visible") void pruefen();
    };
    document.addEventListener("visibilitychange", beimZurueckkommen);
    return () => {
      gestoppt = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", beimZurueckkommen);
    };
  }, [zustand, position]);

  const t = TEXTE[zustand];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-linie bg-flaeche p-6 text-center">
        <p className="text-sm text-leise">{t.titel}</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums">{zeiten.arbeit}</p>
        <p className="text-sm text-leise">Stunden heute{zeiten.pause !== "0:00" && `, dazu ${zeiten.pause} Pause`}</p>

        <button
          type="button"
          onClick={() => stempeln(t.art)}
          disabled={laeuft}
          className="mt-5 w-full rounded-xl px-6 py-5 text-xl font-semibold text-white disabled:opacity-60"
          style={{ background: t.farbe }}
        >
          {laeuft ? "Einen Moment..." : t.knopf}
        </button>

        {zustand === "arbeit" && (
          <button
            type="button"
            onClick={() => stempeln("pause_start")}
            disabled={laeuft}
            className="mt-3 w-full rounded-xl border border-linie px-6 py-4 text-lg font-medium disabled:opacity-60"
          >
            Pause
          </button>
        )}
        {zustand === "pause" && (
          <button
            type="button"
            onClick={() => stempeln("gehen")}
            disabled={laeuft}
            className="mt-3 w-full rounded-xl border border-linie px-6 py-4 text-lg font-medium disabled:opacity-60"
          >
            Aus der Pause heraus gehen
          </button>
        )}
      </div>

      {meldung && (
        <p className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--gut-hell)", color: "var(--gut)" }}>
          {meldung}
        </p>
      )}
      {fehler && (
        <p className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--blocker-hell)", color: "var(--blocker)" }}>
          {fehler}
        </p>
      )}
      <p className="text-center text-xs text-leise">
        Zum Stempeln muss der Standort freigegeben sein. Gestempelt werden kann nur auf dem Gelände.
      </p>
    </div>
  );
}
