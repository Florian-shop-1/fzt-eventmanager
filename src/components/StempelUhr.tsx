"use client";

/**
 * Die Stempeluhr am Handy.
 *
 * Ein großer Knopf, mehr nicht. Vor jedem Stempel holt sie die Position
 * und schickt sie mit; erlaubt wird der Stempel auf dem Server.
 *
 * Bewusst ohne Stundenzahl: Die Mitarbeiter sehen hier nur, ob sie ein-
 * oder ausgestempelt sind. Die Summen sind Sache des Büros
 * (Florian, 21.09.2026).
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

const TEXTE: Record<Zustand, { titel: string; unter: string; knopf: string; art: string; farbe: string }> = {
  aus: {
    titel: "Du bist ausgestempelt",
    unter: "Schönen Dienst!",
    knopf: "EIN-stempeln",
    art: "kommen",
    farbe: "var(--gut)",
  },
  arbeit: {
    titel: "Du bist eingestempelt",
    unter: "Deine Arbeitszeit läuft.",
    knopf: "AUS-stempeln",
    art: "gehen",
    farbe: "var(--blocker)",
  },
  pause: {
    titel: "Du bist in der Pause",
    unter: "Lass es dir schmecken.",
    knopf: "Pause beenden",
    art: "pause_ende",
    farbe: "var(--gut)",
  },
};

export function StempelUhr({ start, pauseFaellig }: { start: Zustand; pauseFaellig?: boolean }) {
  const router = useRouter();
  const [zustand, setZustand] = useState<Zustand>(start);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [pause, setPause] = useState(Boolean(pauseFaellig));
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
      const e = (await antwort.json()) as { ok: boolean; fehler?: string; zustand?: Zustand };
      if (!e.ok) {
        setFehler(e.fehler ?? "Das hat nicht geklappt.");
        return;
      }
      setZustand(e.zustand ?? zustand);
      if (art === "pause_start") setPause(false);
      setMeldung(
        art === "kommen"
          ? "Eingestempelt. Schön, dass du da bist!"
          : art === "gehen"
            ? "Ausgestempelt. Deine Zeit ist gespeichert."
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
        const e = (await antwort.json()) as { drin?: boolean; entfernung?: number; pauseFaellig?: boolean };
        if (gestoppt) return;
        if (e.pauseFaellig) setPause(true);
        if (e.drin === false) {
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
  const laeuftGerade = zustand !== "aus";

  return (
    <div className="space-y-4">
      {/*
        Die Uhr soll sich von allem anderen abheben: dunkle Fläche, ein
        Knopf, der den halben Bildschirm füllt, ein Punkt, der zeigt,
        ob die Zeit läuft.
      */}
      <div
        className="rounded-3xl p-6 text-center shadow-lg"
        style={{
          background: "linear-gradient(160deg, var(--gold-hell), var(--flaeche) 65%)",
          border: "2px solid var(--gold)",
        }}
      >
        <p className="flex items-center justify-center gap-2 text-sm font-medium uppercase tracking-wide">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background: laeuftGerade ? "var(--gut)" : "var(--linie)",
              boxShadow: laeuftGerade ? "0 0 0 4px color-mix(in srgb, var(--gut) 25%, transparent)" : "none",
            }}
          />
          {t.titel}
        </p>
        <p className="mt-1 text-sm text-leise">{t.unter}</p>

        <button
          type="button"
          onClick={() => stempeln(t.art)}
          disabled={laeuft}
          className="mt-6 w-full rounded-2xl px-6 py-8 text-2xl font-bold uppercase tracking-wide text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
          style={{ background: t.farbe }}
        >
          {laeuft ? "Einen Moment..." : t.knopf}
        </button>

        {zustand === "arbeit" && (
          <button
            type="button"
            onClick={() => stempeln("pause_start")}
            disabled={laeuft}
            className="mt-3 w-full rounded-2xl border-2 border-linie bg-flaeche px-6 py-5 text-lg font-semibold disabled:opacity-60"
          >
            Pause
          </button>
        )}
        {zustand === "pause" && (
          <button
            type="button"
            onClick={() => stempeln("gehen")}
            disabled={laeuft}
            className="mt-3 w-full rounded-2xl border-2 border-linie bg-flaeche px-6 py-5 text-lg font-semibold disabled:opacity-60"
          >
            Aus der Pause heraus AUS-stempeln
          </button>
        )}
      </div>

      {pause && zustand === "arbeit" && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>Bitte Pause machen.</strong> Du arbeitest seit fast sechs Stunden ohne Pause. Länger ist in
          Deutschland nicht erlaubt (§ 4 Arbeitszeitgesetz), und daran müssen wir uns als Betrieb halten. Wenn es
          heute nicht anders ging, schreib bitte unten kurz dazu, woran es lag.
        </div>
      )}

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
