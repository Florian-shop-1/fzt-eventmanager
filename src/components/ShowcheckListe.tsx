"use client";

/**
 * Die Checkliste eines Abends, zum Antippen.
 *
 * Der Haken wird sofort gesetzt und im Hintergrund gespeichert. Die Seite
 * lädt dabei nicht neu: Backstage steht man im Halbdunkel, hat die Hände
 * voll und will nach dem Tippen weiterarbeiten (Florian, 03.10.2026).
 *
 * Geht das Speichern schief, springt der Haken zurück und daneben steht,
 * was los war. Lieber ein sichtbarer Fehler als ein Haken, den niemand
 * gesetzt hat.
 */

import { useState } from "react";

export interface CheckPunkt {
  id: string;
  text: string;
  erledigtVon: string | null;
  erledigtAm: string | null;
}

export function ShowcheckListe({
  punkte,
  abend,
  datum,
}: {
  punkte: CheckPunkt[];
  abend: string;
  datum: string;
}) {
  const [stand, setStand] = useState<CheckPunkt[]>(punkte);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const zeit = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

  async function umschalten(p: CheckPunkt) {
    const an = !p.erledigtAm;
    const vorher = stand;
    setLaeuft(p.id);
    setFehler(null);
    // Sofort anzeigen: Wer tippt, soll den Haken sehen, nicht warten.
    setStand((alt) =>
      alt.map((x) =>
        x.id === p.id
          ? { ...x, erledigtAm: an ? new Date().toISOString() : null, erledigtVon: an ? "du" : null }
          : x,
      ),
    );
    try {
      const antwort = await fetch("/showcheck/haken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abend, datum, punkt: p.id, an }),
      });
      const d = (await antwort.json().catch(() => null)) as
        | { ok: boolean; fehler?: string; erledigtVon?: string | null; erledigtAm?: string | null }
        | null;
      if (!d?.ok) {
        setStand(vorher);
        setFehler(d?.fehler ?? "Das hat nicht geklappt. Bitte noch einmal tippen.");
        return;
      }
      setStand((alt) =>
        alt.map((x) =>
          x.id === p.id ? { ...x, erledigtVon: d.erledigtVon ?? null, erledigtAm: d.erledigtAm ?? null } : x,
        ),
      );
    } catch {
      setStand(vorher);
      setFehler("Keine Verbindung. Der Haken ist nicht gespeichert.");
    } finally {
      setLaeuft(null);
    }
  }

  const offen = stand.filter((p) => !p.erledigtAm).length;

  return (
    <>
      <p className="mb-2 text-xs text-leise">
        {offen === 0 ? "alles abgehakt" : `${stand.length - offen} von ${stand.length} erledigt`}
      </p>

      {fehler && (
        <p className="mb-2 rounded px-3 py-2 text-sm" style={{ background: "var(--blocker-hell)", color: "var(--blocker)" }}>
          {fehler}
        </p>
      )}

      <ul className="divide-y divide-linie">
        {stand.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <button
              type="button"
              onClick={() => void umschalten(p)}
              disabled={laeuft === p.id}
              aria-pressed={Boolean(p.erledigtAm)}
              aria-label={p.erledigtAm ? "Haken zurücknehmen" : "Abhaken"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border text-base"
              style={{
                borderColor: p.erledigtAm ? "var(--gut)" : "var(--linie)",
                background: p.erledigtAm ? "var(--gut-hell)" : "transparent",
                color: "var(--gut)",
                opacity: laeuft === p.id ? 0.5 : 1,
              }}
            >
              {p.erledigtAm ? "✓" : ""}
            </button>

            <button
              type="button"
              onClick={() => void umschalten(p)}
              className={`min-w-0 flex-1 text-left text-sm ${p.erledigtAm ? "text-leise line-through" : ""}`}
            >
              {p.text}
            </button>

            {p.erledigtAm && (
              <span className="text-xs text-leise">
                {p.erledigtVon}, {zeit(p.erledigtAm)} Uhr
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
