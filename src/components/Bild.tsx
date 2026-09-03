"use client";

/**
 * Ein Foto, das sich still zurückzieht, wenn es die Datei nicht gibt.
 *
 * Grund: Die Bilder für das Angebot liefert das Theater selbst nach. Bis
 * dahin darf die Seite nicht mit kaputten Bildsymbolen dastehen. Fehlt
 * eine Datei, bleibt der dunkle Grund darunter stehen, und das Angebot
 * wirkt trotzdem fertig.
 *
 * Deshalb wird das Bild erst geladen, nachdem die Seite im Browser
 * angekommen ist, und erst dann angezeigt, wenn es wirklich da ist. Ein
 * onError am Bild selbst genügt nicht: Kommt der Fehler, bevor React die
 * Seite übernommen hat, geht er verloren und das kaputte Symbol bleibt
 * stehen.
 */

import { useEffect, useState } from "react";

type Zustand = "laedt" | "da" | "fehlt";

export function Bild({
  datei,
  alt,
  className,
  hoehe = "h-64",
}: {
  /** Dateiname unter /bilder, zum Beispiel "loge.jpg". */
  datei: string;
  alt: string;
  className?: string;
  /** Tailwind-Höhenklasse des Rahmens. */
  hoehe?: string;
}) {
  const [zustand, setZustand] = useState<Zustand>("laedt");
  const quelle = `/bilder/${datei}`;

  useEffect(() => {
    let abgebrochen = false;
    const pruefer = new window.Image();
    pruefer.onload = () => !abgebrochen && setZustand("da");
    pruefer.onerror = () => !abgebrochen && setZustand("fehlt");
    pruefer.src = quelle;
    return () => {
      abgebrochen = true;
    };
  }, [quelle]);

  return (
    <div
      className={`relative overflow-hidden ${hoehe} ${className ?? ""}`}
      style={{
        // Bleibt sichtbar, solange das Foto fehlt: ein ruhiger Verlauf
        // statt eines leeren Kastens.
        background: "linear-gradient(135deg, #26211a 0%, #17140f 60%, #2a2419 100%)",
      }}
    >
      {zustand === "da" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={quelle} alt={alt} className="h-full w-full object-cover" />
      )}
    </div>
  );
}
