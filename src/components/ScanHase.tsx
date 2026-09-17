"use client";

/**
 * Der Hase aus dem Zylinder, bekannt vom Cookie-Hinweis im Shop
 * (florianzimmer-ditix-frontend, CookieBunny.tsx). Hier lobt er fürs
 * Scannen und erinnert, wenn lange nichts gescannt wurde.
 *
 * Handgezeichnetes SVG, alle Bewegungen per CSS (.sh-* in globals.css).
 * Wer weniger Bewegung eingestellt hat, sieht ihn nur ein- und ausblenden.
 *
 *   lob       taucht aus dem Hut auf, wackelt mit den Ohren
 *   keks      isst zum Abschluss einer Runde einen Keks
 *   erinnern  schaut fragend, bleibt bis man ihn wegklickt
 */

import { useEffect, useRef, useState } from "react";

export type HasenStimmung = "lob" | "keks" | "erinnern";

export function ScanHase({
  text,
  stimmung,
  dauer,
  onWeg,
  oben = false,
}: {
  text: string;
  stimmung: HasenStimmung;
  /** Millisekunden bis zum Ausblenden. Ohne Angabe bleibt er, bis man ihn schließt. */
  dauer?: number;
  onWeg: () => void;
  /** Oben statt unten, etwa über dem Kamerabild, damit der Auslöser frei bleibt. */
  oben?: boolean;
}) {
  const [geht, setGeht] = useState(false);
  const weg = useRef(onWeg);
  useEffect(() => {
    weg.current = onWeg;
  });

  useEffect(() => {
    if (!dauer) return;
    const a = setTimeout(() => setGeht(true), dauer);
    const b = setTimeout(() => weg.current(), dauer + 350);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [dauer]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sh-wrap ${oben ? "sh-oben" : "sh-unten"} ${geht ? "sh-geht" : ""}`}
    >
      <div className="sh-bild">
        <svg className={`sh-root sh-s-${stimmung}`} viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
          <ellipse className="sh-krempe" cx="120" cy="142" rx="82" ry="15" />
          <ellipse className="sh-loch" cx="120" cy="62" rx="34" ry="9" />
          <path className="sh-hut" d="M 84 142 L 76 142 L 87 60 L 153 60 L 164 142 L 156 142 Z" />
          <rect className="sh-band" x="80" y="96" width="80" height="9" rx="1.5" />

          <g className="sh-hase">
            <g className="sh-ohr sh-ohr-l">
              <ellipse cx="103" cy="22" rx="11" ry="34" />
              <ellipse cx="103" cy="20" rx="5.5" ry="24" className="sh-ohr-innen" />
            </g>
            <g className="sh-ohr sh-ohr-r">
              <ellipse cx="137" cy="22" rx="11" ry="34" />
              <ellipse cx="137" cy="20" rx="5.5" ry="24" className="sh-ohr-innen" />
            </g>
            <ellipse className="sh-kopf" cx="120" cy="62" rx="33" ry="29" />
            <g className="sh-barthaare">
              <line x1="92" y1="66" x2="70" y2="62" />
              <line x1="92" y1="71" x2="70" y2="72" />
              <line x1="148" y1="66" x2="170" y2="62" />
              <line x1="148" y1="71" x2="170" y2="72" />
            </g>
            <g className="sh-auge sh-auge-l"><circle cx="108" cy="58" r="4.2" /></g>
            <g className="sh-auge sh-auge-r"><circle cx="132" cy="58" r="4.2" /></g>
            <g className="sh-nase-gruppe">
              <ellipse className="sh-nase" cx="120" cy="68" rx="4" ry="3" />
              <path className="sh-mund" d="M 120 71 Q 120 75 116 76 M 120 71 Q 120 75 124 76" />
            </g>
          </g>

          {stimmung === "keks" && (
            <>
              <g className="sh-keks">
                <circle cx="176" cy="108" r="19" />
                <circle cx="169" cy="101" r="2.3" className="sh-stueck" />
                <circle cx="183" cy="103" r="2" className="sh-stueck" />
                <circle cx="172" cy="113" r="1.8" className="sh-stueck" />
                <circle cx="182" cy="114" r="2.2" className="sh-stueck" />
                <circle cx="176" cy="107" r="2" className="sh-stueck" />
              </g>
              <g className="sh-kruemel">
                <circle cx="168" cy="122" r="1.6" />
                <circle cx="176" cy="126" r="1.3" />
                <circle cx="183" cy="121" r="1.8" />
              </g>
            </>
          )}
          {stimmung === "erinnern" && (
            <text className="sh-frage" x="178" y="40">?</text>
          )}
        </svg>
      </div>
      <div className="sh-blase">
        <p>{text}</p>
        {!dauer && (
          <button type="button" onClick={onWeg} className="sh-zu">
            Mach ich!
          </button>
        )}
      </div>
    </div>
  );
}

/** Wechselnde Lobsprüche, damit es beim zwanzigsten Mal nicht nervt. */
export function lobFuer(vorname: string, anzahl: number): string {
  const name = vorname || "du";
  if (anzahl > 0 && anzahl % 25 === 0) return `Wahnsinn, ${name}! Schon ${anzahl} Karten. Der Hase zieht den Hut.`;
  if (anzahl > 0 && anzahl % 10 === 0) return `${anzahl} Karten, ${name}! Du bist eine Zaubermaschine.`;
  const sprueche = [
    `Gut gemacht, ${name}!`,
    `Danke fürs Scannen, ${name}!`,
    `Zack, drin. Danke, ${name}!`,
    `Sauber, ${name}!`,
    `Weiter so, ${name}!`,
    `Hokuspokus, erledigt. Danke, ${name}!`,
  ];
  return sprueche[anzahl % sprueche.length];
}
