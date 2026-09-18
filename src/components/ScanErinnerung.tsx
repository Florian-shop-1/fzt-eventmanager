"use client";

/**
 * Der Hase meldet sich, wenn eine Woche lang keine Karte gescannt wurde.
 *
 * Erscheint für Geschäftsführung, Team und Foyer auf jeder Seite, aber
 * höchstens einmal am Tag pro Gerät. Mit "Mach ich!" geht er weg und führt
 * zum Scanner.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScanHase } from "@/components/ScanHase";

const SCHLUESSEL = "fzt_scanhase_erinnert";

export function ScanErinnerung({ tage, vorname }: { tage: number; vorname: string }) {
  const router = useRouter();
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => {
    const heute = new Date().toLocaleDateString("en-CA");
    try {
      if (localStorage.getItem(SCHLUESSEL) === heute) return;
    } catch {
      // Ohne Speicher halt jedes Mal. Kommt selten vor.
    }
    const zeit = setTimeout(() => {
      try {
        localStorage.setItem(SCHLUESSEL, heute);
      } catch {
        // egal
      }
      setZeigen(true);
    }, 1200);
    return () => clearTimeout(zeit);
  }, []);

  if (!zeigen) return null;
  return (
    <ScanHase
      stimmung="erinnern"
      text={`Psst, ${vorname || "du"}! Seit ${tage} Tagen wurde keine Glücks-Moji-Karte mehr gescannt. Liegen noch welche in der Losbox?`}
      onWeg={() => {
        setZeigen(false);
        router.push("/scanner");
      }}
    />
  );
}
