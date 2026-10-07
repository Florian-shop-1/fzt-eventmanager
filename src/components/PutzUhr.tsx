"use client";

/**
 * Die Stempeluhr der Putzfirma.
 *
 * Eine Liste von Namen, je einer mit einem Knopf. Wer gerade da ist,
 * steht oben und mit grünem Punkt; sein Knopf sagt "Fertig". Wer noch
 * nicht da ist, hat "Anfangen". Darunter ein Feld für alle, die zum
 * ersten Mal kommen.
 *
 * Bewusst ohne Anmeldung und ohne Stundenzahl: Wer putzt, soll zwei
 * Sekunden brauchen. Was die Stunden kosten, ist Sache des Büros.
 */

import { useCallback, useState } from "react";

interface Person {
  name: string;
  seit: string | null;
}

export function PutzUhr({ schluessel, leute }: { schluessel: string; leute: Person[] }) {
  const [stand, setStand] = useState<Person[]>(leute);
  const [neu, setNeu] = useState("");
  const [laeuft, setLaeuft] = useState("");
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
      setMeldung("Standort ist da. Jetzt noch einmal auf den Namen tippen.");
    } catch {
      setOrtVerweigert(true);
    }
  }

  async function stempeln(name: string, art: "kommen" | "gehen") {
    setLaeuft(name);
    setFehler("");
    setMeldung("");
    setSperre(null);
    try {
      const p = await position().catch(() => null);
      const antwort = await fetch("/putzen/stempeln", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schluessel,
          name,
          art,
          lat: p?.coords.latitude,
          lon: p?.coords.longitude,
          genauigkeit: p?.coords.accuracy,
        }),
      });
      const e = (await antwort.json()) as {
        ok: boolean;
        fehler?: string;
        sperre?: "kein_ort" | "zu_weit";
        leute?: Person[];
      };
      if (!e.ok) {
        setFehler(e.fehler ?? "Das hat nicht geklappt.");
        if (e.sperre) setSperre(e.sperre);
        return;
      }
      if (e.leute) setStand(e.leute);
      setNeu("");
      setMeldung(
        art === "kommen" ? `${name}, schön dass du da bist!` : `${name}, danke dir. Schönen Feierabend!`,
      );
    } catch {
      setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
    } finally {
      setLaeuft("");
    }
  }

  const uhr = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-4">
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
          <strong>Du bist nicht am Theater.</strong> Zum Stempeln musst du vor Ort sein. Falls du doch da
          bist: WLAN einschalten oder kurz vor die Tür gehen und noch einmal versuchen.
        </p>
      )}

      <ul className="space-y-2">
        {stand.map((p) => (
          <li
            key={p.name}
            className="flex items-center gap-3 rounded-xl border border-linie bg-flaeche px-4 py-3"
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: p.seit ? "var(--gut)" : "var(--linie)" }}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{p.name}</span>
              <span className="block text-xs text-leise">
                {p.seit ? `seit ${uhr(p.seit)} Uhr da` : "nicht da"}
              </span>
            </span>
            <button
              type="button"
              disabled={laeuft === p.name}
              onClick={() => stempeln(p.name, p.seit ? "gehen" : "kommen")}
              className="shrink-0 rounded-xl px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ background: p.seit ? "var(--blocker)" : "var(--gut)" }}
            >
              {laeuft === p.name ? "..." : p.seit ? "Fertig" : "Anfangen"}
            </button>
          </li>
        ))}
      </ul>

      {/*
        Wer zum ersten Mal kommt, schreibt sich einmal hinein und steht
        danach in der Liste. Eine gepflegte Mitarbeiterliste waere eine
        Liste, die niemand pflegt (Florian, 07.10.2026).
      */}
      <div className="space-y-2 rounded-xl border border-dashed border-linie px-4 py-3">
        <label className="block text-sm font-medium" htmlFor="neuer-name">
          Zum ersten Mal da?
        </label>
        <input
          id="neuer-name"
          value={neu}
          onChange={(v) => setNeu(v.target.value)}
          maxLength={40}
          placeholder="Vor- und Nachname"
          className="w-full rounded-md border border-linie px-3 py-2 text-base"
        />
        <button
          type="button"
          disabled={neu.trim().length < 3 || laeuft !== ""}
          onClick={() => stempeln(neu.trim(), "kommen")}
          className="w-full rounded-xl px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--gut)" }}
        >
          Anfangen
        </button>
      </div>
    </div>
  );
}
