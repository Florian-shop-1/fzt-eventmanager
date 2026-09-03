"use client";

/**
 * Neues Startpasswort vergeben, wenn jemand seines vergessen hat.
 *
 * Das alte Passwort lässt sich nicht anzeigen, auch nicht von der
 * Geschäftsführung: Es ist als nicht umkehrbare Prüfsumme gespeichert.
 * Deshalb gibt es hier nur den Weg über ein neues.
 */

import { useState, useTransition } from "react";
import { passwortZuruecksetzen } from "@/lib/auth/aktionen";

export function PasswortZuruecksetzen({
  benutzerId,
  name,
}: {
  benutzerId: string;
  name: string;
}) {
  const [laeuft, starte] = useTransition();
  const [neuesPasswort, setNeuesPasswort] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gefragt, setGefragt] = useState(false);

  if (neuesPasswort) {
    return (
      <div
        className="mt-2 rounded border-2 px-3 py-2"
        style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
      >
        <div className="text-xs text-leise">Neues Startpasswort für {name}</div>
        <div className="select-all font-mono text-base font-semibold">{neuesPasswort}</div>
        <div className="mt-1 text-xs text-leise">
          Jetzt weitergeben. Nach dem Verlassen der Seite ist es nicht mehr anzeigbar.
        </div>
      </div>
    );
  }

  if (!gefragt) {
    return (
      <button
        onClick={() => setGefragt(true)}
        className="text-xs text-leise underline hover:text-text"
      >
        Passwort neu vergeben
      </button>
    );
  }

  return (
    <span className="text-xs">
      <span className="text-leise">Neues Passwort für {name}? </span>
      <button
        disabled={laeuft}
        onClick={() =>
          starte(async () => {
            const ergebnis = await passwortZuruecksetzen(benutzerId);
            if (ergebnis.startpasswort) setNeuesPasswort(ergebnis.startpasswort.passwort);
            else setFehler(ergebnis.fehler ?? "Das hat nicht geklappt.");
          })
        }
        className="font-medium underline disabled:opacity-50"
        style={{ color: "var(--gold-dunkel)" }}
      >
        {laeuft ? "einen Moment..." : "ja, neu vergeben"}
      </button>
      <button
        onClick={() => setGefragt(false)}
        className="ml-2 text-leise underline hover:text-text"
      >
        abbrechen
      </button>
      {fehler && (
        <span className="ml-2" style={{ color: "var(--blocker)" }}>
          {fehler}
        </span>
      )}
    </span>
  );
}
