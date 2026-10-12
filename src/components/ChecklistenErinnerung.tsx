"use client";

/**
 * Der Hase bittet darum, die Checklisten zu benutzen.
 *
 * "bitte mach einen reminder fürs showteam, sobald sie in den
 * eventmanager gehen, bitte die checklisten zu verwenden, dass wir uns
 * verbessern können. der hase soll das sagen" (Florian, 12.10.2026).
 *
 * Höchstens einmal am Tag und Gerät, und nur, wenn an diesem Showtag
 * wirklich noch etwas offen ist. "Mach ich!" führt direkt zur Liste.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScanHase } from "@/components/ScanHase";

const SCHLUESSEL = "fzt_checkhase_erinnert";

export function ChecklistenErinnerung({
  vorname,
  show,
  foh,
  eventId,
}: {
  vorname: string;
  /** Offene Punkte hinter der Bühne. */
  show: number;
  /** Offene Punkte am Pult. */
  foh: number;
  eventId: string;
}) {
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

  /*
    Der Satz nennt die Zahl, die gerade gilt.

    "Es sind noch 17 Punkte offen" ist etwas anderes als "denkt an die
    Checkliste": Das eine kann man abarbeiten, das andere überliest man.
  */
  const teile: string[] = [];
  if (show > 0) teile.push(`${show} hinter der Bühne`);
  if (foh > 0) teile.push(`${foh} am Pult`);

  return (
    <ScanHase
      stimmung="erinnern"
      knopf="Zur Liste"
      text={
        `Psst, ${vorname || "du"}! Heute ist Show, und auf den Checklisten stehen noch ${teile.join(" und ")}. ` +
        "Hakt bitte ab, was ihr macht, auch nach der Show. Nur so sehen wir, was im Ablauf hakt, und können es besser machen."
      }
      onWeg={() => {
        setZeigen(false);
        router.push(`/showcheck?abend=${encodeURIComponent(eventId)}`);
      }}
      // Das Kreuz raeumt nur weg, es springt nicht zur Liste.
      onSchliessen={() => setZeigen(false)}
    />
  );
}
