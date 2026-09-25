"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Die Reiter oben: Show, Shop, Events, Foyer, Magicuisine, Sonstiges.
 *
 * Wer viele Punkte sieht, bekommt Reiter. Wer wenige sieht, bekommt sie
 * flach nebeneinander: Das Showteam hat drei Punkte, die muss niemand
 * erst suchen (Florian, 23.09.2026).
 *
 * Aufgeklappt wird beim Drüberfahren, und immer nur eines.
 *
 * Bewusst mit einem eigenen Zustand statt mit CSS: Reines group-hover war
 * schöner zu lesen, ließ sich nach einem Klick aber nicht mehr schließen.
 * Die Maus steht nach dem Klick noch über dem Menü, die Seite wechselt,
 * und das Menü blieb offen stehen (Florian, 23.09.2026). Hier schließt der
 * Klick es ausdrücklich, ebenso das Verlassen der Leiste und die
 * Escape-Taste.
 */
export interface NaviGruppe {
  titel: string;
  punkte: Array<{ href: string; label: string }>;
}

/** Ab wie vielen Punkten es sich lohnt, sie wegzusortieren. */
const AB_HIER_REITER = 7;

export function Navigation({ gruppen }: { gruppen: NaviGruppe[] }) {
  const pfad = usePathname() ?? "/";
  const [offenerReiter, setOffenerReiter] = useState<string | null>(null);
  const alle = gruppen.flatMap((g) => g.punkte);
  const hier = (href: string) => pfad === href || pfad.startsWith(`${href}/`);

  if (alle.length < AB_HIER_REITER) {
    return (
      <>
        {alle.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded px-3 py-1.5 transition-colors hover:bg-gold-hell hover:text-text"
            style={hier(p.href) ? { background: "var(--gold-hell)", color: "var(--text)" } : { color: "var(--text-leise)" }}
          >
            {p.label}
          </Link>
        ))}
      </>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onMouseLeave={() => setOffenerReiter(null)}
      onKeyDown={(e) => e.key === "Escape" && setOffenerReiter(null)}
    >
      {gruppen.map((g) => {
        const drin = g.punkte.some((p) => hier(p.href));
        const auf = offenerReiter === g.titel;
        return (
          <div
            key={g.titel}
            className="relative"
            onMouseEnter={() => setOffenerReiter(g.titel)}
            onFocus={() => setOffenerReiter(g.titel)}
          >
            <button
              type="button"
              // Auf dem Tablet gibt es kein Drüberfahren: Dort öffnet und
              // schließt der Tipper auf den Reiter selbst.
              onClick={() => setOffenerReiter(auf ? null : g.titel)}
              className="block cursor-default select-none rounded px-3 py-1.5 uppercase tracking-wide transition-colors hover:bg-gold-hell hover:text-text"
              style={
                drin || auf
                  ? { background: "var(--gold-hell)", color: "var(--text)", fontWeight: drin ? 600 : 400 }
                  : { color: "var(--text-leise)" }
              }
              aria-expanded={auf}
            >
              {g.titel}
            </button>

            {auf && (
              /*
                Ohne Lücke unter dem Reiter: Sonst fällt das Menü zu, sobald
                die Maus den Zwischenraum berührt. Der Abstand sitzt deshalb
                innen als Polster.
              */
              <div className="absolute left-0 top-full z-50 pt-1">
                <div className="min-w-52 overflow-hidden rounded-md border border-linie bg-flaeche py-1 shadow-lg">
                  {g.punkte.map((p) => (
                    <Link
                      key={p.href}
                      href={p.href}
                      onClick={() => setOffenerReiter(null)}
                      className="block whitespace-nowrap px-4 py-2 hover:bg-gold-hell"
                      style={hier(p.href) ? { background: "var(--gold-hell)", fontWeight: 600 } : undefined}
                    >
                      {p.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
