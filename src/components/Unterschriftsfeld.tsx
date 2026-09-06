"use client";

/**
 * Ein Feld zum Unterschreiben mit Maus oder Finger.
 *
 * Bewusst kein Häkchen mit der Aufschrift "Ich stimme zu". Ein
 * gezeichneter Namenszug ist mehr wert, und zwar aus zwei Gründen: Er
 * lässt sich nicht versehentlich setzen, und er lässt sich später
 * zeigen. Auf dem Ausdruck steht er dann da, wo sonst die Linie wäre.
 *
 * Auf dem Handy zeichnet man mit dem Finger, am Rechner mit der Maus.
 * Deshalb Zeigergeräte-Ereignisse statt Maus- oder Berührungsereignisse:
 * Sie decken beides ab, ohne dass es zwei Wege im Code braucht.
 */

import { useEffect, useRef, useState } from "react";

export function Unterschriftsfeld({ name }: { name: string }) {
  const feld = useRef<HTMLCanvasElement | null>(null);
  const [beschrieben, setBeschrieben] = useState(false);
  const [wert, setWert] = useState("");

  // Die Zeichenfläche in Gerätepunkten anlegen, sonst ist der Strich auf
  // guten Bildschirmen unscharf.
  useEffect(() => {
    const c = feld.current;
    if (!c) return;
    const dichte = window.devicePixelRatio || 1;
    const breite = c.clientWidth;
    const hoehe = c.clientHeight;
    c.width = Math.round(breite * dichte);
    c.height = Math.round(hoehe * dichte);
    const x = c.getContext("2d");
    if (!x) return;
    x.scale(dichte, dichte);
    x.lineWidth = 2.2;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.strokeStyle = "#1a1a1a";
  }, []);

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = feld.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const anfangen = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = feld.current;
    const x = c?.getContext("2d");
    if (!c || !x) return;
    c.setPointerCapture(e.pointerId);
    const p = punkt(e);
    x.beginPath();
    x.moveTo(p.x, p.y);
    setBeschrieben(true);
  };

  const ziehen = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0) return;
    const x = feld.current?.getContext("2d");
    if (!x) return;
    const p = punkt(e);
    x.lineTo(p.x, p.y);
    x.stroke();
  };

  const beenden = () => {
    const c = feld.current;
    if (!c || !beschrieben) return;
    setWert(c.toDataURL("image/png"));
  };

  const loeschen = () => {
    const c = feld.current;
    const x = c?.getContext("2d");
    if (!c || !x) return;
    x.clearRect(0, 0, c.width, c.height);
    setBeschrieben(false);
    setWert("");
  };

  return (
    <div>
      <canvas
        ref={feld}
        onPointerDown={anfangen}
        onPointerMove={ziehen}
        onPointerUp={beenden}
        onPointerLeave={beenden}
        className="h-40 w-full cursor-crosshair rounded-md border border-linie bg-white"
        // Ohne das scrollt die Seite mit, statt dass der Finger zeichnet.
        style={{ touchAction: "none" }}
        aria-label="Feld zum Unterschreiben"
      />
      <input type="hidden" name={name} value={wert} />

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={loeschen}
          className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell"
        >
          Nochmal
        </button>
        <span className="text-leise">
          {beschrieben ? "Sieht gut aus." : "Zeichne deinen Namenszug in das Feld."}
        </span>
      </div>
    </div>
  );
}
