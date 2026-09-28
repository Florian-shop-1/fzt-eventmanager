"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KATEGORIEN, KATEGORIE_LABEL, type Kategorie } from "@/lib/hoerezu/kategorien";

type Status =
  | "gestoppt"
  | "hoert_zu"
  | "kein_mikrofon"
  | "mikrofon_nicht_freigegeben"
  | "spracherkennung_nicht_verfuegbar";

const STATUS_TEXT: Record<Status, string> = {
  gestoppt: "GESTOPPT",
  hoert_zu: "● HÖRT ZU",
  kein_mikrofon: "KEIN MIKROFON",
  mikrofon_nicht_freigegeben: "MIKROFON NICHT FREIGEGEBEN",
  spracherkennung_nicht_verfuegbar: "SPRACHERKENNUNG NICHT VERFÜGBAR",
};

const STATUS_FARBE: Record<Status, string> = {
  gestoppt: "#8a8474",
  hoert_zu: "#3ecf6e",
  kein_mikrofon: "#e0664f",
  mikrofon_nicht_freigegeben: "#e0664f",
  spracherkennung_nicht_verfuegbar: "#e0664f",
};

interface Ergebnis {
  kategorie: Kategorie;
  text: string;
}

/*
  Die Web Speech API hat keine offiziellen TypeScript-Typen im DOM-Lib
  (nur ein paar Hilfstypen wie SpeechRecognitionResult). Diese schlanken
  Typen beschreiben nur, was diese Komponente tatsächlich benutzt.
*/
interface SprachereignisTreffer {
  transcript: string;
}
interface SprachereignisErgebnis {
  isFinal: boolean;
  length: number;
  [index: number]: SprachereignisTreffer;
}
interface Sprachereignis {
  resultIndex: number;
  results: ArrayLike<SprachereignisErgebnis>;
}
interface SprachfehlerEreignis {
  error: string;
}
interface SpracherkennungsMotor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: Sprachereignis) => void) | null;
  onerror: ((event: SprachfehlerEreignis) => void) | null;
  onend: (() => void) | null;
}
interface FensterMitSpracherkennung extends Window {
  SpeechRecognition?: new () => SpracherkennungsMotor;
  webkitSpeechRecognition?: new () => SpracherkennungsMotor;
}

function spracherkennungsKlasse(): (new () => SpracherkennungsMotor) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as FensterMitSpracherkennung;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Wie lange nach dem letzten erkannten Satzstück gewartet wird, bevor der
 * gesammelte Text zur Auswertung geschickt wird. Das ist die einzige
 * Bremse gegen eine Claude-Anfrage bei jedem Zwischenwort: Erst wenn eine
 * Weile Ruhe ist, war die Antwort vermutlich vollständig (Florian, 28.09.2026).
 */
const STILLE_MS = 900;

/**
 * Live-Stichwort-Erkennung für den Bühnentechniker backstage.
 *
 * Web Speech API transkribiert kontinuierlich mit, ein schlanker
 * Debounce sammelt jeweils ein Antwortstück, und Claude filtert daraus
 * das Stichwort für eine der noch offenen Kategorien. Der Techniker
 * bedient dabei nichts außer Start und Stopp: keine Bestätigung, keine
 * Korrektur, nichts wird nachträglich überschrieben.
 */
export function HoereZu() {
  const [status, setStatus] = useState<Status>("gestoppt");
  const [liveText, setLiveText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);

  const recognitionRef = useRef<SpracherkennungsMotor | null>(null);
  const sollHoerenRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pufferRef = useRef("");
  const ergebnisseRef = useRef<Ergebnis[]>([]);
  const laeuftGeradeRef = useRef(false);

  useEffect(() => {
    ergebnisseRef.current = ergebnisse;
  }, [ergebnisse]);

  useEffect(() => {
    // Prüft einmalig nach dem ersten Rendern, ob der Browser Spracherkennung
    // überhaupt anbietet (window ist erst im Browser bekannt, nicht beim
    // serverseitigen Rendern).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!spracherkennungsKlasse()) setStatus("spracherkennung_nicht_verfuegbar");
  }, []);

  const offeneKategorien = useCallback((): Kategorie[] => {
    const belegt = new Set(ergebnisseRef.current.map((e) => e.kategorie));
    return KATEGORIEN.filter((k) => !belegt.has(k));
  }, []);

  const auswerten = useCallback(async () => {
    const text = pufferRef.current.trim();
    pufferRef.current = "";
    const offen = offeneKategorien();
    if (!text || offen.length === 0 || laeuftGeradeRef.current) return;

    laeuftGeradeRef.current = true;
    try {
      const antwort = await fetch("/hoerezu/erkennen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, offen }),
      });
      const daten = await antwort.json().catch(() => null);
      const treffer = daten?.ergebnis as { kategorie: Kategorie; ergebnis: string } | null | undefined;
      if (treffer && offeneKategorien().includes(treffer.kategorie)) {
        setErgebnisse((vorher) =>
          vorher.some((e) => e.kategorie === treffer.kategorie)
            ? vorher
            : [...vorher, { kategorie: treffer.kategorie, text: treffer.ergebnis }],
        );
      }
    } catch {
      // Netzwerkfehler: der Live-Text läuft weiter, beim nächsten Antwortstück wird es erneut versucht.
    } finally {
      laeuftGeradeRef.current = false;
    }
  }, [offeneKategorien]);

  const planeAuswertung = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void auswerten();
    }, STILLE_MS);
  }, [auswerten]);

  const wakeLockAnfordern = useCallback(async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // Kein Wake Lock verfügbar oder verweigert: die Seite funktioniert trotzdem weiter.
    }
  }, []);

  useEffect(() => {
    const beiSichtbarkeitswechsel = () => {
      if (sollHoerenRef.current && document.visibilityState === "visible") {
        void wakeLockAnfordern();
      }
    };
    document.addEventListener("visibilitychange", beiSichtbarkeitswechsel);
    return () => document.removeEventListener("visibilitychange", beiSichtbarkeitswechsel);
  }, [wakeLockAnfordern]);

  const starten = useCallback(() => {
    const Ctor = spracherkennungsKlasse();
    if (!Ctor) {
      setStatus("spracherkennung_nicht_verfuegbar");
      return;
    }

    const erkennung = new Ctor();
    erkennung.lang = "de-DE";
    erkennung.continuous = true;
    erkennung.interimResults = true;

    erkennung.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const stueck = event.results[i];
        const text = stueck[0].transcript;
        if (stueck.isFinal) {
          pufferRef.current = `${pufferRef.current} ${text}`.trim();
          setLiveText((vorher) => `${vorher} ${text}`.trim());
          planeAuswertung();
        } else {
          interim += text;
        }
      }
      setInterimText(interim);
    };

    erkennung.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        sollHoerenRef.current = false;
        setStatus("mikrofon_nicht_freigegeben");
      } else if (event.error === "audio-capture") {
        sollHoerenRef.current = false;
        setStatus("kein_mikrofon");
      }
      // Andere Fehler (z. B. "no-speech", "network"): onend startet neu, solange sollHoerenRef true bleibt.
    };

    erkennung.onend = () => {
      setInterimText("");
      if (sollHoerenRef.current) {
        try {
          erkennung.start();
        } catch {
          setTimeout(() => {
            if (sollHoerenRef.current) {
              try {
                erkennung.start();
              } catch {
                // Nächster Restart-Versuch kommt über das nächste onend.
              }
            }
          }, 300);
        }
      } else {
        setStatus("gestoppt");
      }
    };

    recognitionRef.current = erkennung;
    sollHoerenRef.current = true;
    try {
      erkennung.start();
      setStatus("hoert_zu");
      void wakeLockAnfordern();
    } catch {
      sollHoerenRef.current = false;
      setStatus("gestoppt");
    }
  }, [planeAuswertung, wakeLockAnfordern]);

  const stoppen = useCallback(() => {
    sollHoerenRef.current = false;
    recognitionRef.current?.stop();
    setStatus("gestoppt");
    setInterimText("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    wakeLockRef.current?.release?.().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      sollHoerenRef.current = false;
      recognitionRef.current?.stop();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      wakeLockRef.current?.release?.().catch(() => undefined);
    };
  }, []);

  const hoertZu = status === "hoert_zu";
  const kannStarten = status !== "spracherkennung_nicht_verfuegbar";

  return (
    <div
      className="space-y-4 rounded-xl border p-4 sm:p-6"
      style={{ background: "#141210", borderColor: "#3a3226", color: "#f5f0e6" }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🎤 HÖRE ZU</h1>
          <p className="mt-1 text-sm font-semibold tracking-wide" style={{ color: STATUS_FARBE[status] }}>
            {STATUS_TEXT[status]}
          </p>
        </div>
        <button
          type="button"
          onClick={hoertZu ? stoppen : starten}
          disabled={!kannStarten}
          className="rounded-xl px-8 py-4 text-lg font-bold tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: hoertZu ? "#b3261e" : "#c9a84c",
            color: hoertZu ? "#fff" : "#1c1b19",
          }}
        >
          {hoertZu ? "⏹ STOP" : "🎤 START"}
        </button>
      </header>

      {ergebnisse.length >= 3 && (
        <p className="text-sm font-medium" style={{ color: "#3ecf6e" }}>
          Alle drei Antworten sind erkannt.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(220px,320px)_1fr]">
        <div className="order-2 flex flex-col gap-2 md:order-1">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#8a8474" }}>
            Live-Text
          </h2>
          <div
            className="h-36 overflow-y-auto rounded-lg border p-3 text-sm leading-relaxed md:h-full"
            style={{ borderColor: "#3a3226", background: "#1c1a16", color: "#c9c3b5" }}
          >
            {liveText || interimText ? (
              <>
                {liveText}
                {interimText && <span style={{ color: "#6f6a5c" }}> {interimText}</span>}
              </>
            ) : (
              <span style={{ color: "#5c564a" }}>Noch nichts gehört.</span>
            )}
          </div>
        </div>

        <div className="order-1 grid gap-3 sm:grid-cols-3 md:order-2 md:grid-cols-1">
          {[0, 1, 2].map((i) => {
            const e = ergebnisse[i];
            return (
              <div
                key={i}
                className="flex min-h-36 flex-col justify-center rounded-xl border-2 px-5 py-4 text-center"
                style={
                  e
                    ? { borderColor: "#c9a84c", background: "#2a2311" }
                    : { borderColor: "#3a3226", background: "#1c1a16", borderStyle: "dashed" }
                }
              >
                <div
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: e ? "#c9a84c" : "#5c564a" }}
                >
                  {e ? KATEGORIE_LABEL[e.kategorie] : "wartet …"}
                </div>
                {e && (
                  <div
                    className="mt-2 break-words text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl"
                    style={{ color: "#f5f0e6" }}
                  >
                    {e.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
