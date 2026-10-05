"use client";

/**
 * Der Hase hat etwas auszurichten.
 *
 * Eine persoenliche Erinnerung an genau diese Person. Wer sie liest,
 * sieht nicht, von wem sie kommt: Es soll aussehen, als haette sich der
 * Hase gemeldet (Florian, 04.10.2026). Deshalb steht hier nirgends ein
 * Absender, auch nicht in einem unsichtbaren Feld.
 *
 * "Mach ich!" beendet die Sache, das Kreuz raeumt nur fuer heute weg:
 * Morgen fragt der Hase wieder.
 */

import { useEffect, useRef, useState } from "react";
import { ScanHase } from "@/components/ScanHase";
import type { Anlass } from "@/lib/personal/hasenpost";

export function HasenPost({
  id,
  text,
  vorname,
  anlass = "erinnern",
}: {
  id: string;
  text: string;
  vorname: string;
  anlass?: Anlass;
}) {
  const danke = anlass === "danke";
  const [zeigen, setZeigen] = useState(false);
  const gemeldet = useRef(false);

  useEffect(() => {
    // Kurz warten, damit die Seite erst steht.
    const zeit = setTimeout(() => setZeigen(true), 1200);
    return () => clearTimeout(zeit);
  }, []);

  // Dass er gezeigt wurde, merkt sich der Server: So weiss er, dass es
  // heute genug war, und zaehlt mit, wie oft schon erinnert wurde.
  useEffect(() => {
    if (!zeigen || gemeldet.current) return;
    gemeldet.current = true;
    void quittung(id, "gezeigt");
  }, [zeigen, id]);

  if (!zeigen) return null;

  return (
    <ScanHase
      // Beim Dank wackelt er mit den Ohren statt fragend zu schauen.
      stimmung={danke ? "lob" : "erinnern"}
      knopf={danke ? "Gern!" : "Mach ich!"}
      text={`${danke ? "Hallo" : "Psst,"} ${vorname || "du"}! ${text}`}
      onWeg={() => {
        setZeigen(false);
        void quittung(id, "erledigt");
      }}
      // Das Kreuz raeumt nur weg. Morgen hoppelt er wieder vorbei.
      onSchliessen={() => setZeigen(false)}
    />
  );
}

async function quittung(id: string, was: "gezeigt" | "erledigt") {
  try {
    await fetch("/api/hasenpost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, was }),
      keepalive: true,
    });
  } catch {
    // Geht die Meldung verloren, erinnert der Hase eben noch einmal.
  }
}
