"use client";

/**
 * Der Versandknopf in der Navigation, mit Zähler.
 *
 * Aufgebaut wie der WhatsApp-Knopf daneben: ein Kreis mit der Zahl, rot
 * wenn etwas zu klären ist. Der Versand lag bisher als Unterpunkt unter
 * "Events", und wer nicht hinschaute, sah nicht, dass ein Gutschein auf
 * einen Umschlag wartet (Florian, 25.09.2026).
 *
 * Gefragt wird alle zwei Minuten, nicht im Sekundentakt: Post geht
 * einmal am Tag raus, nicht laufend. Beim Zurückkehren auf den Tab wird
 * sofort nachgesehen, dann stimmt die Zahl, wenn man sie braucht.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Stand {
  offen: number;
  klaerung: number;
}

const ABSTAND_MS = 120_000;

export function VersandMelder() {
  const [stand, setStand] = useState<Stand>({ offen: 0, klaerung: 0 });
  const pfad = usePathname();

  useEffect(() => {
    let lebt = true;

    async function nachsehen() {
      try {
        const antwort = await fetch("/versand/stand", { cache: "no-store" });
        if (!antwort.ok) return;
        const neu = (await antwort.json()) as Stand;
        if (lebt) setStand(neu);
      } catch {
        // Kein Netz, kein Zähler. Der Knopf bleibt trotzdem da.
      }
    }

    nachsehen();
    const uhr = setInterval(nachsehen, ABSTAND_MS);
    const beiRueckkehr = () => {
      if (!document.hidden) nachsehen();
    };
    document.addEventListener("visibilitychange", beiRueckkehr);

    return () => {
      lebt = false;
      clearInterval(uhr);
      document.removeEventListener("visibilitychange", beiRueckkehr);
    };
    // Nach dem Abhaken auf der Versandseite soll die Zahl gleich stimmen.
  }, [pfad]);

  const zahl = stand.offen;
  const eilig = stand.klaerung > 0;

  return (
    <Link
      href="/versand"
      className={`relative ml-1 inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-3 font-medium transition-colors hover:bg-gold-hell ${
        zahl > 0 ? "pr-4" : "pr-3"
      }`}
      style={{ borderColor: "var(--gold)", color: "var(--gold-dunkel)" }}
      title={
        zahl > 0
          ? `${zahl} ${zahl === 1 ? "Sendung muss" : "Sendungen müssen"} in die Post` +
            (eilig ? `, bei ${stand.klaerung} fehlt noch etwas` : "")
          : "Nichts zu verschicken"
      }
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">
        <path d="M2.5 6.5A2.5 2.5 0 0 1 5 4h14a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-11Zm2.2-.7 7.3 5.2 7.3-5.2a1 1 0 0 0-.3-.05H5a1 1 0 0 0-.3.05ZM20 7.4l-7.42 5.3a1 1 0 0 1-1.16 0L4 7.4v10.1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7.4Z" />
      </svg>
      Versand
      {zahl > 0 && (
        <span
          className="absolute -top-2 -right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums text-white ring-2 ring-white"
          style={{ background: eilig ? "#E5383B" : "#0A84FF" }}
          aria-label={`${zahl} zu verschicken${eilig ? ", davon etwas zu klären" : ""}`}
        >
          {zahl > 99 ? "99+" : zahl}
        </span>
      )}
    </Link>
  );
}
