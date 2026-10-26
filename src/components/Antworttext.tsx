"use client";

/**
 * Das Antwortfeld im Posteingang, mit fertigen Textvorschlägen darüber.
 *
 * Die Fragen der Gäste wiederholen sich. Passt ein Baustein zur Frage,
 * steht er gleich im Feld, und über dem Feld liegen die anderen zum
 * Umschalten (Florian, 04.10.2026). Geschickt wird nie etwas von selbst:
 * Der Text lässt sich überschreiben wie jeder andere auch.
 */

import { useRef, useState } from "react";

export interface Textvorschlag {
  titel: string;
  text: string;
}

export function Antworttext({
  name,
  vorschlaege,
  standard,
  rows = 4,
  platzhalter,
  codeAn = null,
}: {
  /** Feldname im Formular, meist "text". */
  name: string;
  vorschlaege: Textvorschlag[];
  /** Was im Feld steht, wenn kein Vorschlag passt. */
  standard: string;
  rows?: number;
  platzhalter?: string;
  /**
   * Für wen Codes gezogen werden dürfen (die Kennung der Unterhaltung).
   * Steht hier nichts, gibt es den Knopf nicht.
   */
  codeAn?: string | null;
}) {
  const [text, setText] = useState(vorschlaege[0]?.text ?? standard);
  const [gewaehlt, setGewaehlt] = useState(vorschlaege.length > 0 ? 0 : -1);
  const feld = useRef<HTMLTextAreaElement | null>(null);

  /*
    Codes ziehen, während man schreibt.

    "jedesmal wenn man klickt, erscheint dieser schon im textfeld ...
    mehrmals klicken = mehrere codes in der antwortnachricht" (Florian,
    26.10.2026). Oft ist längst klar, dass der Gast einen Block hat, und
    die Rückfrage nach dem Jahrgang hält nur auf.

    Der erste Code landet dort, wo der Cursor steht, sonst am Ende. Jeder
    weitere stellt sich hinter den vorigen, damit die Codes beisammen
    stehen und nicht über die Nachricht verstreut sind.
  */
  const [codes, setCodes] = useState<string[]>([]);
  const [zieht, setZieht] = useState(false);
  const [codefehler, setCodefehler] = useState<string | null>(null);
  const [rest, setRest] = useState<number | null>(null);

  async function codeZiehen() {
    if (!codeAn || zieht) return;
    setZieht(true);
    setCodefehler(null);
    try {
      const antwort = await fetch("/api/whatsapp/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ an: codeAn }),
      });
      const d = (await antwort.json()) as { code?: string; rest?: number; fehler?: string };
      if (!antwort.ok || !d.code) {
        setCodefehler(d.fehler ?? "Der Code ließ sich nicht ziehen.");
        return;
      }
      einsetzen(d.code);
      setCodes((alt) => [...alt, d.code!]);
      setRest(typeof d.rest === "number" ? d.rest : null);
    } catch {
      setCodefehler("FloTix war nicht erreichbar, es wurde kein Code vergeben.");
    } finally {
      setZieht(false);
    }
  }

  function einsetzen(code: string) {
    setText((alt) => {
      // Hinter den zuletzt gezogenen Code, damit alle beisammen stehen.
      const vorige = codes.at(-1);
      if (vorige && alt.includes(vorige)) {
        const stelle = alt.lastIndexOf(vorige) + vorige.length;
        return `${alt.slice(0, stelle)}, ${code}${alt.slice(stelle)}`;
      }
      const cursor = feld.current?.selectionStart;
      if (typeof cursor === "number" && cursor > 0 && cursor <= alt.length) {
        return `${alt.slice(0, cursor)}${code}${alt.slice(cursor)}`;
      }
      return alt ? `${alt.trimEnd()}\n\nDein Code: ${code}` : code;
    });
    setGewaehlt(-1);
  }

  return (
    <div className="space-y-2">
      {(vorschlaege.length > 0 || codeAn) && (
        <div className="flex flex-wrap items-center gap-2">
          {vorschlaege.length > 0 && <span className="text-xs text-leise">Vorschlag:</span>}
          {vorschlaege.map((v, i) => (
            <button
              key={v.titel}
              type="button"
              onClick={() => {
                setText(v.text);
                setGewaehlt(i);
              }}
              className="rounded-md border px-2 py-1 text-xs"
              style={{
                borderColor: gewaehlt === i ? "var(--gold)" : "var(--linie)",
                background: gewaehlt === i ? "var(--gold-hell)" : "transparent",
              }}
            >
              {v.titel}
            </button>
          ))}
          {vorschlaege.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setText(standard);
                setGewaehlt(-1);
              }}
              className="text-xs text-leise underline"
            >
              leeres Feld
            </button>
          )}

          {codeAn && (
            <button
              type="button"
              onClick={codeZiehen}
              disabled={zieht}
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
            >
              {zieht
                ? "zieht..."
                : codes.length === 0
                  ? "Schlemmerblock-Code ziehen"
                  : "noch einen Code ziehen"}
            </button>
          )}

          {codes.length > 0 && (
            <span className="text-xs text-leise">
              {codes.length === 1 ? "1 Code" : `${codes.length} Codes`} gezogen und in FloTix
              vergeben{rest !== null ? `, ${rest} noch frei` : ""}.
            </span>
          )}
        </div>
      )}

      {codefehler && (
        <p className="text-xs" style={{ color: "var(--blocker)" }}>
          {codefehler}
        </p>
      )}

      <textarea
        ref={feld}
        name={name}
        rows={rows}
        required
        value={text}
        placeholder={platzhalter}
        onChange={(e) => {
          setText(e.target.value);
          setGewaehlt(-1);
        }}
        className="w-full rounded-md border border-linie px-3 py-2 text-sm"
      />
    </div>
  );
}
