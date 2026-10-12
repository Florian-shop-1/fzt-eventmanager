"use client";

/**
 * Der Hase erinnert das Foyer an die Geschenke an der Magic-Bar.
 *
 * Höchstens einmal am Tag und Gerät, und nur, wenn an diesem Abend
 * wirklich etwas bereitliegt. "Zur Liste" führt direkt dorthin.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScanHase } from "@/components/ScanHase";

const SCHLUESSEL = "fzt_geschenkhase_erinnert";

export function GeschenkErinnerung({
  vorname,
  gaeste,
  stueck,
}: {
  vorname: string;
  gaeste: number;
  stueck: number;
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
    Gäste und Stücke stehen beide da: Drei Gäste können neun Gläser
    sein, und das will man wissen, bevor man an der Bar steht.
  */
  const wen = gaeste === 1 ? "ein Gast" : `${gaeste} Gäste`;
  const was = stueck === gaeste ? "" : ` (zusammen ${stueck} Stück)`;

  return (
    <ScanHase
      stimmung="erinnern"
      knopf="Zur Liste"
      text={
        `Psst, ${vorname || "du"}! Heute Abend hat ${wen}${was} ein Geschenk bei uns gut. ` +
        "Die melden sich an der Magic-Bar. Bitte gib es aus und hak es ab, sonst wissen wir nie, ob es angekommen ist."
      }
      onWeg={() => {
        setZeigen(false);
        router.push("/geschenke");
      }}
      onSchliessen={() => setZeigen(false)}
    />
  );
}
