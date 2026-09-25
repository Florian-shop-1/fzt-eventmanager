"use client";

/**
 * Der Hase gratuliert.
 *
 * Hat jemand aus dem Haus Geburtstag, taucht er einmal am Tag auf und
 * sagt es. Danach bleibt es still: Der Hinweis soll ein Moment sein und
 * keine Leiste, die den ganzen Tag im Weg steht (Florian, 23.09.2026).
 *
 * Wer am Geburtstag mehrmals am Tag das Programm öffnet, sieht ihn nur
 * beim ersten Mal. Gemerkt wird das im Browser, je Gerät und je Tag.
 *
 * Das Alter kommt hier nie vor, nur der Vorname.
 */

import { useEffect, useState } from "react";
import { ScanHase } from "@/components/ScanHase";

const SCHLUESSEL = "fzt_geburtstag_gesehen";

export function GeburtstagsHase({ text, konfetti }: { text: string; konfetti: boolean }) {
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => {
    const heute = new Date().toLocaleDateString("en-CA");
    try {
      if (localStorage.getItem(SCHLUESSEL) === heute) return;
    } catch {
      // Ohne Speicher erscheint er halt jedes Mal. Einmal im Jahr verkraftbar.
    }
    // Kurz warten, damit die Seite erst steht und der Hase nicht in den
    // Aufbau hineinplatzt.
    const zeit = setTimeout(() => {
      try {
        localStorage.setItem(SCHLUESSEL, heute);
      } catch {
        // egal
      }
      setZeigen(true);
    }, 1500);
    return () => clearTimeout(zeit);
  }, []);

  if (!zeigen) return null;

  return (
    <>
      {konfetti && <Konfetti />}
      <ScanHase stimmung="lob" text={text} dauer={9000} onWeg={() => setZeigen(false)} />
    </>
  );
}

/**
 * Ein bisschen Konfetti, nur für das Geburtstagskind selbst.
 *
 * Bewusst sparsam: 24 Schnipsel, sechs Sekunden, danach ist der Spuk
 * vorbei. Wer weniger Bewegung eingestellt hat, sieht gar keins.
 */
function Konfetti() {
  const farben = ["#C9A84C", "#E3C46F", "#ffffff", "#d8a0a0", "#9ec9d8"];
  const schnipsel = Array.from({ length: 24 }, (_, i) => ({
    links: (i * 37) % 100,
    verzug: (i % 8) * 0.35,
    dauer: 4 + ((i * 7) % 20) / 10,
    farbe: farben[i % farben.length],
    dreh: (i * 53) % 360,
  }));

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden motion-reduce:hidden">
      {schnipsel.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: "-12px",
            left: `${s.links}%`,
            width: 8,
            height: 12,
            background: s.farbe,
            borderRadius: 2,
            transform: `rotate(${s.dreh}deg)`,
            animation: `fzt-konfetti ${s.dauer}s linear ${s.verzug}s 1 forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes fzt-konfetti {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(540deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
