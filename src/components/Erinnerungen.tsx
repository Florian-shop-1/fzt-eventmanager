"use client";

/**
 * Was jemand noch erledigen muss: Personalbogen, Geheimhaltung.
 *
 * Zwei Stufen, damit es auffällt, aber nicht nervt:
 *  - eine gelbe Leiste unter der Navigation, auf jeder Seite, bis es erledigt ist
 *  - einmal am Tag der Hase aus dem Zylinder, der darauf hinweist
 *
 * Auf der Seite, um die es gerade geht, bleibt beides still.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScanHase } from "@/components/ScanHase";

export interface Erinnerung {
  href: string;
  leiste: string;
  knopf: string;
  hase: string;
}

const SCHLUESSEL = "fzt_erinnerung_hase";

export function Erinnerungen({ offen, vorname }: { offen: Erinnerung[]; vorname: string }) {
  const pfad = usePathname() ?? "/";
  const router = useRouter();
  const [hase, setHase] = useState(false);
  const sichtbar = offen.filter((e) => !pfad.startsWith(e.href));

  useEffect(() => {
    if (sichtbar.length === 0) return;
    const heute = new Date().toLocaleDateString("en-CA");
    try {
      if (localStorage.getItem(SCHLUESSEL) === heute) return;
    } catch {
      // ohne Speicher eben jedes Mal
    }
    const t = setTimeout(() => {
      // Erst beim Erscheinen merken, sonst verschluckt ein doppelter Aufruf den Hasen.
      try {
        localStorage.setItem(SCHLUESSEL, heute);
      } catch {
        // egal
      }
      setHase(true);
    }, 1000);
    return () => clearTimeout(t);
    // Nur beim ersten Laden entscheiden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sichtbar.length === 0) return null;
  const erste = sichtbar[0];

  return (
    <>
      <div className="border-b px-6 py-2 text-sm print:hidden" style={{ background: "var(--warnung-hell)", borderColor: "var(--warnung)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5">
          {sichtbar.map((e) => (
            <div key={e.href} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
              <span>{e.leiste}</span>
              <Link href={e.href} className="rounded-md border border-gold bg-gold px-3 py-1 text-xs font-medium text-white">
                {e.knopf}
              </Link>
            </div>
          ))}
        </div>
      </div>
      {hase && (
        <ScanHase
          stimmung="erinnern"
          text={`Psst, ${vorname || "du"}! ${erste.hase}`}
          onWeg={() => {
            setHase(false);
            router.push(erste.href);
          }}
        />
      )}
    </>
  );
}
