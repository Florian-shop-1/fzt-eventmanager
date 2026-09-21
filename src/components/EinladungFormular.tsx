"use client";

import { useActionState, useState } from "react";
import { selbstEintragen, type EinladungsErgebnis } from "@/app/einladung/[token]/aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

/*
  Alle drei Positionen als Rookie: Wer neu dazukommt, laeuft erst mit
  einem erfahrenen Kollegen mit. Florian schaltet frei, sobald jemand
  die Position allein kann (Florian, 21.09.2026).
*/
const WAHL = [
  { wert: "FOH", titel: "FOH", text: "Licht und Ton" },
  { wert: "T1", titel: "Techniker 1", text: "" },
  { wert: "T2", titel: "Techniker 2", text: "" },
  { wert: "ZUSCHAUER", titel: "Zuschauer", text: "der Eingeweihte im Publikum" },
];

/**
 * Selbst eintragen: so wenig Felder wie möglich, alles auf einer Seite.
 * Bei einem Fehler bleibt alles ausgefüllt.
 */
export function EinladungFormular({
  token,
  email,
  mitPosition = true,
}: {
  token: string;
  /** Bei persönlichen Einladungen fest vorgegeben. */
  email?: string | null;
  mitPosition?: boolean;
}) {
  const [ergebnis, aktion] = useActionState<EinladungsErgebnis, FormData>(selbstEintragen, {});
  const [zeigen, setZeigen] = useState(false);
  const f = ergebnis.felder ?? {};
  const fehler = (k: string) =>
    f[k] ? (
      <span className="mt-1 block text-xs" style={{ color: "var(--blocker)" }}>
        {f[k]}
      </span>
    ) : null;

  return (
    <form action={aktion} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {ergebnis.fehler && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}>
          {ergebnis.fehler}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Vorname</span>
          <input name="vorname" autoComplete="given-name" required />
          {fehler("vorname")}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Nachname</span>
          <input name="nachname" autoComplete="family-name" required />
          {fehler("nachname")}
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-leise">E-Mail</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={email ?? undefined}
          readOnly={Boolean(email)}
        />
        <span className="mt-1 block text-xs text-leise">Damit meldest du dich an. Hierhin kommen auch die Anfragen, ob du einspringen kannst.</span>
        {fehler("email")}
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-leise">Passwort (mindestens 10 Zeichen)</span>
        <span className="flex gap-2">
          <input name="passwort" type={zeigen ? "text" : "password"} autoComplete="new-password" minLength={10} required />
          <button type="button" onClick={() => setZeigen(!zeigen)} className="shrink-0 text-xs text-leise underline">
            {zeigen ? "verbergen" : "zeigen"}
          </button>
        </span>
        {fehler("passwort")}
      </label>

      {mitPosition && (
      <fieldset>
        <legend className="mb-2 text-xs text-leise">Was machst du in der Show?</legend>
        <div className="space-y-2">
          {WAHL.map((w) => (
            <label key={w.wert} className="flex cursor-pointer items-start gap-3 rounded-lg border border-linie bg-flaeche px-3 py-2.5 has-[:checked]:border-gold has-[:checked]:bg-gold-hell">
              <input type="radio" name="position" value={w.wert} required className="mt-1" />
              <span className="text-sm">
                <strong>{w.titel}</strong>
                {w.text && <span className="block text-xs text-leise">{w.text}</span>}
              </span>
            </label>
          ))}
        </div>
        {fehler("position")}
      </fieldset>
      )}

      <Absendeknopf text="Eintragen" laeuftText="Wird eingetragen..." />
    </form>
  );
}
