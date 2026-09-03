"use client";

import { useActionState } from "react";
import { benutzerAnlegen, type BenutzerErgebnis } from "@/lib/auth/aktionen";

export function BenutzerAnlegen() {
  const [ergebnis, aktion, laeuft] = useActionState<BenutzerErgebnis, FormData>(
    benutzerAnlegen,
    {},
  );

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5">
      <h2 className="mb-3 text-sm font-semibold">Neuen Zugang anlegen</h2>

      {ergebnis.startpasswort && (
        <div
          className="mb-4 rounded-lg border-2 p-4"
          style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
        >
          <div className="mb-2 font-medium">
            Zugang für {ergebnis.startpasswort.name} angelegt
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 text-leise">E-Mail</dt>
              <dd className="font-mono">{ergebnis.startpasswort.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 text-leise">Startpasswort</dt>
              <dd className="select-all font-mono text-base font-semibold">
                {ergebnis.startpasswort.passwort}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-leise">
            Jetzt notieren oder weitergeben. Nach dem Verlassen dieser Seite lässt es sich nicht
            mehr anzeigen, nur noch neu vergeben. Beim ersten Anmelden wird zum Ändern
            aufgefordert.
          </p>
        </div>
      )}

      <form action={aktion} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Name</span>
          <input type="text" name="name" required placeholder="Kevin Steele" />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-leise">E-Mail</span>
          <input
            type="email"
            name="email"
            required
            placeholder="kevin.steele@florianzimmer.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-leise">Berechtigung</span>
          <select name="rolle" defaultValue="team">
            <option value="team">Team, sieht alles außer Zugängen</option>
            <option value="gastro">Gastronomie, Küche und Sitzplan, ohne Preise</option>
            <option value="foyer">Foyer, Stehtische und Bändchen, ohne Preise</option>
            <option value="chef">Geschäftsführung, darf auch Zugänge verwalten</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={laeuft}
            className="rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dunkel disabled:opacity-50"
          >
            {laeuft ? "wird angelegt..." : "Zugang anlegen"}
          </button>
        </div>

        {ergebnis.fehler && (
          <p
            className="rounded border px-3 py-2 text-sm sm:col-span-2"
            style={{
              borderColor: "var(--blocker)",
              background: "var(--blocker-hell)",
              color: "var(--blocker)",
            }}
          >
            {ergebnis.fehler}
          </p>
        )}
      </form>
    </section>
  );
}
