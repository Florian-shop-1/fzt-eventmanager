"use client";

/**
 * Die Stempeluhr der Putzfirma, ohne Anmeldung.
 *
 * Ein grosser Knopf, mehr nicht. Beim Einstempeln fragt sie, wie viele
 * Leute da sind, denn danach wird abgerechnet (Florian, 07.10.2026).
 * Waehrend der Schicht laesst sich die Zahl aendern, falls spaeter
 * jemand dazukommt oder frueher geht.
 *
 * Bewusst ohne Stundenzahl: Wer putzt, soll zwei Sekunden brauchen. Was
 * die Stunden kosten, ist Sache des Buero.
 */

import { useCallback, useState } from "react";

interface Schicht {
  stempelId: string;
  seit: string;
  personen: number;
  name: string;
}

const ZAHLEN = [1, 2, 3, 4, 5, 6, 7, 8];

export function PutzUhr({ schluessel, start }: { schluessel: string; start: Schicht | null }) {
  const [schicht, setSchicht] = useState<Schicht | null>(start);
  const [frageOffen, setFrageOffen] = useState(false);
  const [aendern, setAendern] = useState(false);
  const [name, setName] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [sperre, setSperre] = useState<"kein_ort" | "zu_weit" | null>(null);
  const [ortVerweigert, setOrtVerweigert] = useState(false);

  const position = useCallback(
    () =>
      new Promise<GeolocationPosition>((ok, nein) => {
        if (!navigator.geolocation) return nein(new Error("Dieses Gerät kennt keinen Standort."));
        navigator.geolocation.getCurrentPosition(ok, nein, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        });
      }),
    [],
  );

  async function ortFreigeben() {
    setFehler("");
    try {
      await position();
      setSperre(null);
      setOrtVerweigert(false);
      setMeldung("Standort ist da. Jetzt noch einmal auf den Knopf.");
    } catch {
      setOrtVerweigert(true);
    }
  }

  async function schicken(was: "kommen" | "gehen" | "anzahl", personen?: number) {
    setLaeuft(true);
    setFehler("");
    setMeldung("");
    setSperre(null);
    try {
      const p = was === "anzahl" ? null : await position().catch(() => null);
      const antwort = await fetch("/putzen/stempeln", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schluessel,
          was,
          personen,
          name: was === "kommen" ? name.trim() : undefined,
          lat: p?.coords.latitude,
          lon: p?.coords.longitude,
          genauigkeit: p?.coords.accuracy,
        }),
      });
      const e = (await antwort.json()) as {
        ok: boolean;
        fehler?: string;
        sperre?: "kein_ort" | "zu_weit";
        schicht?: Schicht | null;
      };
      if (!e.ok) {
        setFehler(e.fehler ?? "Das hat nicht geklappt.");
        if (e.sperre) setSperre(e.sperre);
        if (e.schicht !== undefined) setSchicht(e.schicht);
        return;
      }
      if (e.schicht !== undefined) setSchicht(e.schicht);
      setFrageOffen(false);
      setAendern(false);
      setName("");
      setMeldung(
        was === "kommen"
          ? "Eingestempelt. Schön, dass ihr da seid!"
          : was === "gehen"
            ? "Ausgestempelt. Danke euch!"
            : "Geändert, danke.",
      );
    } catch {
      setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const uhr = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    });

  const zahlenfeld = (gewaehlt: number | null, tun: (n: number) => void) => (
    <div className="grid grid-cols-4 gap-2">
      {ZAHLEN.map((n) => (
        <button
          key={n}
          type="button"
          disabled={laeuft}
          onClick={() => tun(n)}
          className="h-16 rounded-xl border-2 text-xl font-semibold disabled:opacity-60"
          style={{
            borderColor: n === gewaehlt ? "var(--gold)" : "var(--linie)",
            background: n === gewaehlt ? "var(--gold-hell)" : "var(--flaeche)",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div
        className="rounded-3xl p-6 text-center shadow-lg"
        style={{
          background: "linear-gradient(160deg, var(--gold-hell), var(--flaeche) 65%)",
          border: "2px solid var(--gold)",
        }}
      >
        <p className="flex items-center justify-center gap-2 text-sm font-medium uppercase tracking-wide">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background: schicht ? "var(--gut)" : "var(--linie)",
              boxShadow: schicht ? "0 0 0 4px color-mix(in srgb, var(--gut) 25%, transparent)" : "none",
            }}
          />
          {schicht ? "Ihr seid eingestempelt" : "Ihr seid ausgestempelt"}
        </p>
        <p className="mt-1 text-sm text-leise">
          {schicht
            ? `Seit ${uhr(schicht.seit)} Uhr, ${schicht.personen} ${schicht.personen === 1 ? "Person" : "Personen"}`
            : "Schönen Dienst!"}
        </p>

        {!schicht && !frageOffen && (
          <button
            type="button"
            onClick={() => setFrageOffen(true)}
            disabled={laeuft}
            className="mt-6 w-full rounded-2xl px-6 py-8 text-2xl font-bold uppercase tracking-wide text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: "var(--gut)" }}
          >
            EIN-stempeln
          </button>
        )}

        {!schicht && frageOffen && (
          <div className="mt-6 space-y-3 text-left">
            <p className="text-center text-base font-semibold">Wie viele seid ihr heute?</p>
            {zahlenfeld(null, (n) => void schicken("kommen", n))}
            {/*
              Der Name ist freiwillig: Abgerechnet wird nach Koepfen und
              Stunden. Aber wenn jemand anders kommt, soll man es
              hinschreiben koennen (Florian, 07.10.2026).
            */}
            <input
              value={name}
              onChange={(v) => setName(v.target.value)}
              maxLength={40}
              placeholder="Name (nur wenn ihr mögt)"
              className="w-full rounded-md border border-linie px-3 py-2 text-base"
            />
            <button type="button" onClick={() => setFrageOffen(false)} className="text-xs text-leise underline">
              Abbrechen
            </button>
          </div>
        )}

        {schicht && (
          <button
            type="button"
            onClick={() => void schicken("gehen")}
            disabled={laeuft}
            className="mt-6 w-full rounded-2xl px-6 py-8 text-2xl font-bold uppercase tracking-wide text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: "var(--blocker)" }}
          >
            {laeuft ? "Einen Moment..." : "AUS-stempeln"}
          </button>
        )}
      </div>

      {schicht && !aendern && (
        <button
          type="button"
          onClick={() => setAendern(true)}
          className="w-full rounded-xl border-2 border-linie bg-flaeche px-4 py-3 text-sm font-medium"
        >
          Seid ihr jetzt mehr oder weniger?
        </button>
      )}

      {schicht && aendern && (
        <div className="space-y-3 rounded-xl border border-linie bg-flaeche px-4 py-3">
          <p className="text-sm font-medium">Wie viele seid ihr jetzt?</p>
          {zahlenfeld(schicht.personen, (n) => void schicken("anzahl", n))}
          <button type="button" onClick={() => setAendern(false)} className="text-xs text-leise underline">
            Abbrechen
          </button>
        </div>
      )}

      {meldung && (
        <p className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--gut-hell)", color: "var(--gut)" }}>
          {meldung}
        </p>
      )}
      {fehler && (
        <p
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--blocker-hell)", color: "var(--blocker)" }}
        >
          {fehler}
        </p>
      )}

      {sperre === "kein_ort" && (
        <div
          className="space-y-3 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <p>
            <strong>Standort nicht freigegeben.</strong> Gestempelt wird nur am Theater, dafür muss das Handy
            sagen dürfen, wo es ist.
          </p>
          {ortVerweigert ? (
            <p>
              Dein Browser fragt nicht mehr nach, weil der Zugriff einmal abgelehnt wurde. Du schaltest ihn
              wieder ein unter <strong>Einstellungen &rarr; Datenschutz &rarr; Ortungsdienste</strong>. Danach
              die Seite neu laden.
            </p>
          ) : (
            <button
              type="button"
              onClick={ortFreigeben}
              className="w-full rounded-xl border-2 border-linie bg-flaeche px-4 py-3 text-base font-semibold"
            >
              Standort jetzt freigeben
            </button>
          )}
        </div>
      )}

      {sperre === "zu_weit" && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong>Ihr seid nicht am Theater.</strong> Zum Einstempeln müsst ihr vor Ort sein. Falls ihr doch da
          seid: WLAN einschalten oder kurz vor die Tür gehen und noch einmal versuchen.
        </p>
      )}
    </div>
  );
}
