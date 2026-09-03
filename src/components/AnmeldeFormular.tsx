"use client";

import { useActionState } from "react";
import { anmelden, type AnmeldeErgebnis } from "@/lib/auth/aktionen";

export function AnmeldeFormular() {
  const [ergebnis, aktion, laeuft] = useActionState<AnmeldeErgebnis, FormData>(anmelden, {});

  return (
    <form action={aktion} className="space-y-4 rounded-lg border border-linie bg-flaeche p-6">
      <label className="block">
        <span className="mb-1 block text-xs text-leise">E-Mail</span>
        <input type="email" name="email" required autoComplete="username" autoFocus />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-leise">Passwort</span>
        <input type="password" name="passwort" required autoComplete="current-password" />
      </label>

      {ergebnis.fehler && (
        <p
          className="rounded border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--blocker)",
            background: "var(--blocker-hell)",
            color: "var(--blocker)",
          }}
        >
          {ergebnis.fehler}
        </p>
      )}

      <button
        type="submit"
        disabled={laeuft}
        className="w-full rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dunkel disabled:opacity-50"
      >
        {laeuft ? "einen Moment..." : "Anmelden"}
      </button>

      <p className="text-center text-xs text-leise">
        Passwort vergessen? Florian kann ein neues vergeben.
      </p>
    </form>
  );
}
