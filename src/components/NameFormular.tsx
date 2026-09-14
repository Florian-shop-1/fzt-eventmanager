"use client";

import { useActionState } from "react";
import { nameAendern, type PasswortErgebnis } from "@/lib/auth/aktionen";

export function NameFormular({ name }: { name: string }) {
  const [ergebnis, aktion, laeuft] = useActionState<PasswortErgebnis, FormData>(nameAendern, {});

  return (
    <form action={aktion} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-leise">Vor- und Nachname</span>
        <input type="text" name="name" required minLength={2} maxLength={80} defaultValue={name} autoComplete="name" />
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
        {laeuft ? "wird gespeichert..." : "Name speichern"}
      </button>
    </form>
  );
}
