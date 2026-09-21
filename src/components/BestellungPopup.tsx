"use client";

/**
 * Das Pop-up für Florian, Kevin und Sarah, sobald die Gastro bestellt hat.
 *
 * Bewusst so knapp wie möglich: Anzahl, Sorte, ein grüner Knopf. Wer den
 * Wein hingestellt hat, tippt darauf, und die Bestellung ist erledigt und
 * dokumentiert. Mehr steht hier nicht, damit man im Vorbeigehen abhaken kann.
 *
 * Es erscheint auf jeder Seite des Eventmanagers, solange etwas offen ist.
 * Wer gerade keine Zeit hat, legt es mit "später" für zwei Stunden weg.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface OffeneBestellung {
  id: string;
  zeilen: string[];
  besteller: string;
  notiz: string;
}

const SPAETER = "fzt_bestellung_spaeter";

export function BestellungPopup({ offen, abstellort }: { offen: OffeneBestellung[]; abstellort: string }) {
  const router = useRouter();
  const [zeigen, setZeigen] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  useEffect(() => {
    if (offen.length === 0) return;
    try {
      const bis = Number(localStorage.getItem(SPAETER) ?? 0);
      if (Date.now() < bis) return;
    } catch {
      // ohne Speicher eben jedes Mal
    }
    // Kurz warten, damit das Pop-up nicht in die Seite hineinplatzt.
    const t = setTimeout(() => setZeigen(true), 600);
    return () => clearTimeout(t);
  }, [offen.length]);

  if (!zeigen || offen.length === 0) return null;
  const b = offen[0];

  async function abstellen() {
    setLaeuft(b.id);
    const form = new FormData();
    form.append("id", b.id);
    await fetch("/bestellungen/abgestellt", { method: "POST", body: form });
    setLaeuft(null);
    if (offen.length <= 1) setZeigen(false);
    router.refresh();
  }

  function spaeter() {
    try {
      localStorage.setItem(SPAETER, String(Date.now() + 2 * 60 * 60 * 1000));
    } catch {
      // egal, dann kommt es beim nächsten Seitenaufruf wieder
    }
    setZeigen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Neue Weinbestellung"
    >
      <div className="w-full max-w-sm rounded-2xl bg-flaeche p-6 text-center shadow-xl">
        <p className="text-xs uppercase tracking-wide text-leise">Bestellung Gastro</p>
        <ul className="my-4 space-y-1">
          {b.zeilen.map((z) => (
            <li key={z} className="text-2xl font-semibold">
              {z}
            </li>
          ))}
        </ul>
        {b.notiz && <p className="mb-3 text-sm text-leise">{b.notiz}</p>}
        <button
          type="button"
          onClick={abstellen}
          disabled={laeuft === b.id}
          className="w-full rounded-xl px-5 py-4 text-base font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--gut)" }}
        >
          {laeuft === b.id ? "Wird gespeichert..." : `Wurde abgestellt: ${abstellort}`}
        </button>
        <button type="button" onClick={spaeter} className="mt-3 text-xs text-leise underline">
          später
        </button>
        {offen.length > 1 && (
          <p className="mt-3 text-xs text-leise">Danach kommt noch {offen.length - 1} weitere Bestellung.</p>
        )}
      </div>
    </div>
  );
}
