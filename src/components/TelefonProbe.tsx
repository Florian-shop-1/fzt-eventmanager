"use client";

/**
 * Mit dem Telefonassistenten reden, getippt.
 *
 * Links das Gespräch, rechts was er dabei getan hat: nachgeschlagen,
 * SMS geschickt, Rückruf notiert. Das Mitlaufen der Werkzeuge ist der
 * eigentliche Punkt dieser Seite, denn am Telefon hört man nur das
 * Ergebnis, nicht den Weg dorthin (Florian, 09.10.2026).
 */

import { useEffect, useRef, useState } from "react";

interface Zeile {
  wer: "gast" | "assistent";
  text: string;
  getan?: string[];
}

const BEGRUESSUNG =
  "Florian Zimmer Theater, hier ist der digitale Assistent. Was kann ich für dich tun?";

const VORSCHLAEGE = [
  "Wann spielt ihr das nächste Mal?",
  "Gibt es am Samstag noch Karten?",
  "Ich würde gern mit meiner Firma kommen, 25 Leute im Dezember.",
  "Schick mir mal den Link zum Buchen.",
];

export function TelefonProbe() {
  const [nummer, setNummer] = useState("+49151234567");
  const [zeilen, setZeilen] = useState<Zeile[]>([{ wer: "assistent", text: BEGRUESSUNG }]);
  const [verlauf, setVerlauf] = useState<unknown[]>([]);
  const [gespraechId, setGespraechId] = useState<string | null>(null);
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const unten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    unten.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [zeilen, laeuft]);

  async function sagen(text: string) {
    const gesagt = text.trim();
    if (!gesagt || laeuft) return;
    setEingabe("");
    setFehler("");
    setZeilen((z) => [...z, { wer: "gast", text: gesagt }]);
    setLaeuft(true);
    try {
      const antwort = await fetch("/api/telefon/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verlauf, gesagt, nummer, gespraechId }),
      });
      const d = (await antwort.json()) as {
        ok?: boolean;
        text?: string;
        getan?: string[];
        verlauf?: unknown[];
        gespraechId?: string | null;
        fehler?: string;
      };
      if (!d.ok) {
        setFehler(d.fehler ?? "Das hat gerade nicht geklappt.");
        return;
      }
      setVerlauf(d.verlauf ?? []);
      if (d.gespraechId) setGespraechId(d.gespraechId);
      setZeilen((z) => [...z, { wer: "assistent", text: d.text ?? "", getan: d.getan }]);
    } catch {
      setFehler("Keine Verbindung zum Assistenten.");
    } finally {
      setLaeuft(false);
    }
  }

  function vonVorn() {
    setZeilen([{ wer: "assistent", text: BEGRUESSUNG }]);
    setVerlauf([]);
    setGespraechId(null);
    setFehler("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Von welcher Nummer rufst du an?</span>
          <input
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
            className="w-56"
            aria-label="Nummer des Anrufers"
          />
        </label>
        <button type="button" onClick={vonVorn} className="rounded-md border border-linie px-3 py-1.5">
          Neues Gespräch
        </button>
      </div>

      <div className="rounded-lg border border-linie bg-flaeche p-4">
        <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {zeilen.map((z, i) => (
            <div key={i} className={z.wer === "gast" ? "text-right" : ""}>
              <div
                className="inline-block max-w-[80%] rounded-lg px-3 py-2 text-sm"
                style={
                  z.wer === "gast"
                    ? { background: "var(--gold-hell)", textAlign: "left" }
                    : { background: "var(--flaeche-tief, rgba(0,0,0,0.04))" }
                }
              >
                <div className="mb-0.5 text-xs text-leise">
                  {z.wer === "gast" ? "Anrufer" : "Assistent"}
                </div>
                {z.text}
              </div>
              {z.getan && z.getan.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-leise">
                  {z.getan.map((g, k) => (
                    <li key={k}>⚙ {g}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {laeuft && <div className="text-xs text-leise">Der Assistent überlegt …</div>}
          <div ref={unten} />
        </div>

        {fehler && (
          <p className="mt-3 text-sm" style={{ color: "var(--blocker)" }}>
            {fehler}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sagen(eingabe);
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder="Was sagst du?"
            className="flex-1"
            aria-label="Was der Anrufer sagt"
          />
          <button
            type="submit"
            disabled={laeuft || !eingabe.trim()}
            className="rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--gold)" }}
          >
            Sagen
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {VORSCHLAEGE.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => void sagen(v)}
              disabled={laeuft}
              className="rounded-full border border-linie px-3 py-1 text-xs text-leise"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
