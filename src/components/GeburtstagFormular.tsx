"use client";

/**
 * Tag und Monat des Geburtstags, sonst nichts.
 *
 * Zwei Auswahlfelder statt eines Datumsfeldes: Auf dem Handy ist die
 * Auswahl schneller als ein Kalender, und ein Jahr wird gar nicht erst
 * gefragt. Wir feiern den Tag, das Alter geht niemanden etwas an
 * (Florian, 23.09.2026).
 */

import { useActionState } from "react";
import { geburtstagSetzen, type GeburtstagStand } from "@/app/konto/aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function GeburtstagFormular({ vorhanden }: { vorhanden: string | null }) {
  const [stand, absenden] = useActionState<GeburtstagStand, FormData>(geburtstagSetzen, {});
  const [tagVor, monatVor] = (vorhanden ?? "").split(".");

  return (
    <form action={absenden} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Tag</span>
          <select name="tag" defaultValue={tagVor ?? ""} className="rounded-md border border-linie px-3 py-1.5">
            <option value="">…</option>
            {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-leise">Monat</span>
          <select name="monat" defaultValue={monatVor ?? ""} className="rounded-md border border-linie px-3 py-1.5">
            <option value="">…</option>
            {MONATE.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, "0")}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <Absendeknopf text="Speichern" laeuftText="..." />
      </div>

      {stand.fehler && (
        <p className="text-sm" style={{ color: "var(--blocker)" }}>
          {stand.fehler}
        </p>
      )}
      {stand.meldung && (
        <p className="text-sm" style={{ color: "var(--gut)" }}>
          {stand.meldung}
        </p>
      )}
    </form>
  );
}
