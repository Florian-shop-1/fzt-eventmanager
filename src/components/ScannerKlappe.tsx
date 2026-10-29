"use client";

/**
 * Der Ticketscanner, eingeklappt auf einer anderen Seite.
 *
 * "vielleicht macht es mehr sinn im eventmanager den scanner direkt bei
 * upgrades zu platzieren.. dass sie nicht zwischen zwei fenstern hin und
 * her hüpfen?" (Florian, 29.10.2026).
 *
 * Eine <details>-Klappe geht hier nicht: Die zeigt ihren Inhalt nur
 * nicht an, gebaut wird er trotzdem, und damit liefe die Kamera, sobald
 * jemand die Upgrade-Liste oeffnet. Deshalb ein Knopf, der den Scanner
 * erst dann in die Seite setzt. Zugeklappt wird er wieder entfernt, und
 * damit geht auch das Kameralicht aus.
 */

import { useState } from "react";
import { TicketScanner } from "./TicketScanner";

export function ScannerKlappe() {
  const [offen, setOffen] = useState(false);

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        className="rounded-md px-4 py-2 text-sm font-semibold"
        style={
          offen
            ? { background: "var(--flaeche)", color: "var(--text)", border: "1px solid var(--linie)" }
            : { background: "var(--gold)", color: "#fff" }
        }
      >
        {offen ? "Scanner schließen" : "Tickets scannen"}
      </button>

      {offen && (
        <div className="mt-3 max-w-xl rounded-xl border border-linie bg-flaeche p-4">
          <TicketScanner />
        </div>
      )}
    </div>
  );
}
