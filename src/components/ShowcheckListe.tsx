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

import { useEffect, useState } from "react";

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
  nameNoetig = false,
  namen = [],
}: {
  punkte: CheckPunkt[];
  abend: string;
  datum: string;
  /**
   * Am geteilten Zugang gehoert der Haken niemandem.
   *
   * Dann wird einmal gefragt, wer gerade abhakt, und der Name steht
   * danach an jedem Haken dieses Abends (Florian, 05.10.2026).
   */
  nameNoetig?: boolean;
  /** Wer an diesem Abend eingeteilt ist, als Vorschlag. */
  namen?: string[];
}) {
  const [stand, setStand] = useState<CheckPunkt[]>(punkte);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  /*
    Wer gerade abhakt.

    Gemerkt im Browser, je Abend: Wer zehn Punkte abhakt, soll nicht
    zehnmal gefragt werden. Am naechsten Abend ist die Frage wieder da.
  */
  const schluessel = `fzt_check_wer_${abend}`;
  const [wer, setWer] = useState<string>("");
  const [frage, setFrage] = useState<CheckPunkt | null>(null);
  const [eigener, setEigener] = useState("");

  useEffect(() => {
    if (!nameNoetig) return;
    try {
      setWer(localStorage.getItem(schluessel) ?? "");
    } catch {
      // Ohne Speicher wird eben jedes Mal gefragt.
    }
  }, [nameNoetig, schluessel]);

  function merken(name: string) {
    setWer(name);
    try {
      localStorage.setItem(schluessel, name);
    } catch {
      // egal
    }
  }

  const zeit = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

  async function umschalten(p: CheckPunkt, name = wer) {
    // Am geteilten Zugang erst fragen, dann haken.
    if (nameNoetig && !name) {
      setFrage(p);
      return;
    }
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
        body: JSON.stringify({ abend, datum, punkt: p.id, an, wer: name }),
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
      {/*
        Die Frage, wer gerade abhakt.

        Keine eigene Seite und kein Formular: Ein Tipp auf den Namen
        genuegt, und der Haken geht gleich mit (Florian, 05.10.2026).
      */}
      {frage && (
        <div
          className="mb-3 rounded-lg border-2 px-4 py-3"
          style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}
        >
          <p className="text-sm font-semibold">Wer hakt gerade ab?</p>
          <p className="mt-0.5 text-xs text-leise">
            Damit die anderen sehen, wer es erledigt hat. Wird für diesen Abend gemerkt.
          </p>

          {namen.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {namen.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    const p = frage;
                    merken(n);
                    setFrage(null);
                    if (p) void umschalten(p, n);
                  }}
                  className="rounded-md border border-linie bg-flaeche px-3 py-1.5 text-sm"
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={eigener}
              onChange={(e) => setEigener(e.target.value)}
              maxLength={60}
              placeholder={namen.length > 0 ? "jemand anderes: Name" : "Name"}
              className="min-w-[12rem] flex-1 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const name = eigener.trim();
                if (name.length < 2) return;
                const p = frage;
                // "nicht eingeteilt" dazu, damit spaeter klar ist, dass
                // dieser Name nicht aus dem Dienstplan kam.
                const voll = namen.includes(name) ? name : `${name} (nicht eingeteilt)`;
                merken(voll);
                setEigener("");
                setFrage(null);
                if (p) void umschalten(p, voll);
              }}
              className="rounded-md border border-linie px-3 py-1.5 text-sm"
            >
              Weiter
            </button>
            <button
              type="button"
              onClick={() => setFrage(null)}
              className="text-xs text-leise underline"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {nameNoetig && wer && (
        <p className="mb-2 text-xs text-leise">
          Du hakst ab als <strong>{wer}</strong>.{" "}
          <button
            type="button"
            onClick={() => {
              merken("");
              setFrage(null);
            }}
            className="underline"
          >
            jemand anderes
          </button>
        </p>
      )}

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
