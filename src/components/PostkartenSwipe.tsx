"use client";

/**
 * Postkarten durchsehen wie bei Tinder.
 *
 * "sollte man sehen und ja nein machen können. auf dem handy am besten
 * swipen wie bei tinder, nach links heisst nein = papierkorb, nach
 * rechts heißt auf die wall of gästestimmen" (Florian, 30.10.2026).
 *
 * Gezeigt wird immer die Fassung, die hinausginge: das Original mit den
 * Schwärzungen darüber. Wer nach rechts wischt, hat also gesehen, was
 * auf der Wand steht, und genau dieses Bild wird dann erzeugt und
 * hochgeladen. Damit bleibt die Regel gewahrt, dass kein Modell allein
 * entscheidet, was im Netz landet: Der Mensch sieht es und bestätigt.
 *
 * Nach links heisst zurückhalten, nicht löschen. Die Karte bleibt im
 * Haus, sie geht nur nicht hinaus, und unter "Zurückgehalten" lässt
 * sich das jederzeit ansehen.
 *
 * Mit der Maus geht es genauso: ziehen, oder die beiden Knöpfe
 * darunter, oder die Pfeiltasten.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface SwipeFundstelle {
  art: string;
  text: string;
  x: number;
  y: number;
  b: number;
  h: number;
}

export interface SwipeKarte {
  id: string;
  zitat: string;
  zusammenfassung: string;
  bewertung: number;
  einwilligung: string;
  fundstellen: SwipeFundstelle[];
  hatBild: boolean;
}

/** Ab hier gilt eine Karte als Empfehlung (Florian, 30.10.2026). */
export const SCHWELLE = 8;

const SCHWELLWERT_ZIEHEN = 110;

export function PostkartenSwipe({ karten }: { karten: SwipeKarte[] }) {
  const [nr, setNr] = useState(0);
  const [versatz, setVersatz] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<Array<{ id: string; wohin: "wand" | "zurueck" }>>([]);

  const leinwand = useRef<HTMLCanvasElement | null>(null);
  const start = useRef<number | null>(null);
  /* Zieht gerade jemand? Als Zustand, weil das Aussehen davon abhaengt. */
  const [zieht, setZieht] = useState(false);

  const karte = karten[nr] ?? null;

  /* Das Bild mit den Schwärzungen, so wie es hinausginge. */
  useEffect(() => {
    if (!karte?.hatBild) return;
    let abgebrochen = false;
    const bild = new Image();
    bild.crossOrigin = "anonymous";
    bild.onload = () => {
      if (abgebrochen) return;
      const l = leinwand.current;
      if (!l) return;
      l.width = bild.naturalWidth;
      l.height = bild.naturalHeight;
      const stift = l.getContext("2d");
      if (!stift) return;
      stift.drawImage(bild, 0, 0);
      stift.fillStyle = "#111111";
      for (const k of karte.fundstellen) {
        stift.fillRect(
          (k.x / 100) * l.width,
          (k.y / 100) * l.height,
          (k.b / 100) * l.width,
          (k.h / 100) * l.height,
        );
      }
    };
    bild.src = `/api/postkarte/bild/${karte.id}`;
    return () => {
      abgebrochen = true;
    };
  }, [karte]);

  const weiter = useCallback(
    (id: string, wohin: "wand" | "zurueck") => {
      setErledigt((b) => [...b, { id, wohin }]);
      setVersatz(0);
      setNr((n) => n + 1);
      setLaeuft(false);
    },
    [],
  );

  const nachLinks = useCallback(async () => {
    if (!karte || laeuft) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      const antwort = await fetch("/postkarten/entscheiden", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: karte.id, was: "zurueck" }),
      });
      if (!antwort.ok) throw new Error((await antwort.json().catch(() => ({}))).fehler ?? "Fehler");
      weiter(karte.id, "zurueck");
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : "Das ging nicht.");
      setLaeuft(false);
      setVersatz(0);
    }
  }, [karte, laeuft, weiter]);

  const nachRechts = useCallback(async () => {
    if (!karte || laeuft) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      const l = leinwand.current;
      if (!l || !karte.hatBild) throw new Error("Ohne Bild lässt sich nichts freigeben.");
      const blob = await new Promise<Blob | null>((f) => l.toBlob(f, "image/jpeg", 0.9));
      if (!blob) throw new Error("Das Bild ließ sich nicht erzeugen.");

      const form = new FormData();
      form.set("id", karte.id);
      form.set("geschwaerzt", new File([blob], `${karte.id}.jpg`, { type: "image/jpeg" }));
      // Der Wisch ist die ausdrückliche Bestätigung, auch für alte
      // Karten ohne schriftliche Einwilligung.
      if (karte.einwilligung !== "erteilt") form.set("ohne_einwilligung", "ja");

      const antwort = await fetch("/postkarten/freigeben", { method: "POST", body: form });
      const d = (await antwort.json().catch(() => ({}))) as { ok?: boolean; fehler?: string };
      if (!antwort.ok || !d.ok) throw new Error(d.fehler ?? "Die Freigabe ging nicht durch.");
      weiter(karte.id, "wand");
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : "Das ging nicht.");
      setLaeuft(false);
      setVersatz(0);
    }
  }, [karte, laeuft, weiter]);

  /* Pfeiltasten, für alle, die am Schreibtisch sitzen. */
  useEffect(() => {
    const hoeren = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") void nachLinks();
      if (e.key === "ArrowRight") void nachRechts();
    };
    window.addEventListener("keydown", hoeren);
    return () => window.removeEventListener("keydown", hoeren);
  }, [nachLinks, nachRechts]);

  if (!karte) {
    const wand = erledigt.filter((e) => e.wohin === "wand").length;
    return (
      <div className="rounded-lg border border-dashed border-linie p-8 text-center text-sm">
        {erledigt.length === 0 ? (
          "Hier wartet gerade nichts."
        ) : (
          <>
            <p className="text-base font-medium">Durch.</p>
            <p className="mt-1 text-leise">
              {wand} {wand === 1 ? "Karte" : "Karten"} auf der Wand, {erledigt.length - wand}{" "}
              zurückgehalten.
            </p>
          </>
        )}
      </div>
    );
  }

  const richtung = versatz > 40 ? "rechts" : versatz < -40 ? "links" : null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-leise">
        Karte {nr + 1} von {karten.length}. Nach rechts auf die Wand, nach links zurückhalten.
      </p>

      {meldung && (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
        >
          {meldung}
        </p>
      )}

      <div
        className="relative touch-pan-y select-none overflow-hidden rounded-xl border-2 bg-flaeche p-4"
        style={{
          borderColor:
            richtung === "rechts" ? "var(--gut)" : richtung === "links" ? "var(--blocker)" : "var(--linie)",
          transform: `translateX(${versatz}px) rotate(${versatz / 25}deg)`,
          transition: zieht ? undefined : "transform .2s",
          opacity: laeuft ? 0.5 : 1,
        }}
        onPointerDown={(e) => {
          if (laeuft) return;
          start.current = e.clientX;
          setZieht(true);
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current === null) return;
          setVersatz(e.clientX - start.current);
        }}
        onPointerUp={() => {
          const v = versatz;
          start.current = null;
          setZieht(false);
          if (v > SCHWELLWERT_ZIEHEN) void nachRechts();
          else if (v < -SCHWELLWERT_ZIEHEN) void nachLinks();
          else setVersatz(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setZieht(false);
          setVersatz(0);
        }}
      >
        {richtung && (
          <span
            className="absolute right-4 top-4 z-10 rounded-md px-3 py-1 text-sm font-semibold"
            style={{
              background: richtung === "rechts" ? "var(--gut)" : "var(--blocker)",
              color: "#fff",
            }}
          >
            {richtung === "rechts" ? "auf die Wand" : "zurückhalten"}
          </span>
        )}

        <div className="flex flex-wrap items-baseline gap-x-3 text-xs text-leise">
          <span
            className="rounded px-2 py-0.5"
            style={{
              background: karte.bewertung >= SCHWELLE ? "var(--gut-hell)" : "var(--warnung-hell)",
              color: karte.bewertung >= SCHWELLE ? "var(--gut)" : "var(--warnung)",
            }}
          >
            {karte.bewertung}/10
          </span>
          {karte.fundstellen.length > 0 && (
            <span>{karte.fundstellen.length} Stellen geschwärzt</span>
          )}
          {karte.einwilligung !== "erteilt" && <span>ohne schriftliche Einwilligung</span>}
        </div>

        {karte.zitat && <p className="mt-2 text-lg italic">„{karte.zitat}“</p>}
        {karte.zusammenfassung && (
          <p className="mt-1 text-sm text-leise">{karte.zusammenfassung}</p>
        )}

        <canvas
          ref={leinwand}
          className="mt-3 w-full rounded-md border border-linie bg-white"
          style={{ maxHeight: "55vh", objectFit: "contain" }}
        />
        <p className="mt-1 text-xs text-leise">
          So ginge sie hinaus. Die schwarzen Flächen sind endgültig, das Original bleibt im Haus.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void nachLinks()}
          disabled={laeuft}
          className="flex-1 rounded-lg border px-4 py-3 text-sm font-medium disabled:opacity-50"
          style={{ borderColor: "var(--blocker)", color: "var(--blocker)" }}
        >
          Zurückhalten
        </button>
        <button
          type="button"
          onClick={() => void nachRechts()}
          disabled={laeuft}
          className="flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--gut)" }}
        >
          Auf die Wand
        </button>
      </div>
    </div>
  );
}
