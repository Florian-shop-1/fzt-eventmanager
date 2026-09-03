"use client";

import { useActionState } from "react";
import { passwortAendern, type PasswortErgebnis } from "@/lib/auth/aktionen";

export function PasswortFormular() {
  const [ergebnis, aktion, laeuft] = useActionState<PasswortErgebnis, FormData>(
    passwortAendern,
    {},
  );

  return (
    <form action={aktion} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Bisheriges Passwort</span>
        <input type="password" name="alt" required autoComplete="current-password" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">
          Neues Passwort, mindestens 10 Zeichen
        </span>
        <input type="password" name="neu" required minLength={10} autoComplete="new-password" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Neues Passwort wiederholen</span>
        <input
          type="password"
          name="wiederholung"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </label>

      {ergebnis.fehler && (
        <p className="rounded border px-3 py-2 text-sm"
           style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)", color: "var(--blocker)" }}>
          {ergebnis.fehler}
        </p>
      )}
      {ergebnis.erfolg && (
        <p className="rounded border px-3 py-2 text-sm"
           style={{ borderColor: "var(--gut)", background: "var(--gut-hell)", color: "var(--gut)" }}>
          {ergebnis.erfolg}
        </p>
      )}

      <button
        type="submit"
        disabled={laeuft}
        className="rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white disabled:opacity-50"
      >
        {laeuft ? "wird gespeichert..." : "Passwort ändern"}
      </button>
    </form>
  );
}
