"use client";

/**
 * Tickets scannen, im Eventmanager.
 *
 * "wir müssen es so machen, dass für den mitarbeiter die anmeldung über
 * eventmanager ausreicht. wir wollen die nicht in flotix reinlassen"
 * (Florian, 29.10.2026).
 *
 * Die Kamera laeuft hier, entwertet wird bei FloTix: Jeder Scan geht an
 * /api/ticketscan, dort wird geprueft, wer angemeldet ist, und erst
 * danach weitergereicht. Der gemeinsame Schluessel bleibt auf dem Server
 * und landet nie im Handy.
 *
 * Gelesen wird mit dem BarcodeDetector, wo es ihn gibt (Chrome auf
 * Android), sonst mit jsQR aus /jsQR.js. Auf dem iPhone gibt es den
 * Detektor nicht, deshalb muss jsQR dabei sein.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface Antwort {
  ergebnis: "ok" | "schon_benutzt" | "storniert" | "falsche_vorstellung" | "falsche_station" | "unbekannt";
  titel: string;
  zeilen: string[];
  hinweise: string[];
  gast: string;
  bestellnummer: string | null;
  ticketId: string | null;
  gruppe: { gesamt: number; eingelassen: number } | null;
  achtung?: boolean;
  upgrade?: { zeilen: string[]; link: string } | null;
}

interface Vorstellung {
  id: string;
  titel: string;
  beginn: string;
  gesamt: number;
  drin: number;
}

const STATIONEN = [
  { wert: "einlass", text: "Einlass (Showtickets)" },
  { wert: "restaurant", text: "Restaurant (Menü)" },
  { wert: "theke", text: "Theke (Souvenir, Stehtisch, Bändchen)" },
];

/** Gruen, orange, rot. Mehr Farben braucht an der Tuer niemand. */
const FARBE: Record<string, { rand: string; flaeche: string; zeichen: string }> = {
  ok: { rand: "var(--gut)", flaeche: "var(--gut-hell)", zeichen: "✓" },
  achtung: { rand: "var(--warnung)", flaeche: "var(--warnung-hell)", zeichen: "!" },
  fehler: { rand: "var(--blocker)", flaeche: "var(--blocker-hell)", zeichen: "✗" },
};

function art(d: Antwort): "ok" | "achtung" | "fehler" {
  if (d.ergebnis === "ok") return d.achtung ? "achtung" : "ok";
  if (d.ergebnis === "falsche_vorstellung" || d.ergebnis === "falsche_station") return "achtung";
  /*
    Ein unbekannter Code ist nicht immer eine Absage: Tickets aus dem
    alten Shop kennt FloTix nicht, und die gelten trotzdem. FloTix setzt
    in diesem Fall "achtung", und dann steht hier orange statt rot
    (Florian, 29.10.2026: "zeig das an und der muss die einfach mit
    seinen augen checken wie bisher").
  */
  return d.achtung ? "achtung" : "fehler";
}

function zeit(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Kurz vibrieren und piepen: An der Tuer schaut niemand dauernd aufs Display. */
function melden(gut: boolean): void {
  try {
    if (navigator.vibrate) navigator.vibrate(gut ? 80 : [120, 80, 120]);
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = gut ? 880 : 220;
    o.connect(g);
    g.connect(ac.destination);
    g.gain.setValueAtTime(0.18, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    o.start();
    o.stop(ac.currentTime + 0.26);
    setTimeout(() => void ac.close().catch(() => undefined), 500);
  } catch {
    /* ohne Ton geht es auch */
  }
}

/**
 * Dem Saalplan sagen, welche Gruppe gerade gescannt wurde.
 *
 * "wenn es ein upgrade vorschlägt, dass dann gleich in dem saalplan da
 * angezeigt wird, zb. aufleuchtet. es muss intuitiv funktionieren"
 * (Florian, 29.10.2026).
 *
 * Scanner und Saalplan sind zwei Bausteine nebeneinander, und keiner
 * gehoert dem anderen. Statt beide unter einen gemeinsamen Zustand zu
 * zwingen, ruft der Scanner in den Raum, und wer zuhoert, reagiert:
 * Steht der Saalplan auf der Seite, laesst er die Plaetze aufleuchten,
 * steht er nicht da, passiert nichts.
 *
 * Die Buchstaben stehen in den Upgrade-Zeilen, die FloTix schickt
 * ("Umzug A: 4 Gaeste von ... nach ..."). Sie kommen aus derselben
 * Rechnung wie die Buchstaben im Plan, es ist also wirklich dieselbe
 * Gruppe.
 */
export const UPGRADE_EREIGNIS = "fzt-upgrade-gescannt";

function upgradeMelden(d: Antwort): void {
  const buchstaben = (d.upgrade?.zeilen ?? [])
    .map((z) => /^Umzug ([A-Z])/.exec(z)?.[1])
    .filter((b): b is string => Boolean(b));
  if (buchstaben.length === 0) return;
  window.dispatchEvent(
    new CustomEvent(UPGRADE_EREIGNIS, { detail: { buchstaben, gast: d.gast } }),
  );
}

function leereAntwort(titel: string, zeile: string): Antwort {
  return {
    ergebnis: "unbekannt",
    titel,
    zeilen: [zeile],
    hinweise: [],
    gast: "",
    bestellnummer: null,
    ticketId: null,
    gruppe: null,
  };
}

export function TicketScanner() {
  const [vorstellungen, setVorstellungen] = useState<Vorstellung[]>([]);
  const [alle, setAlle] = useState(false);
  const [station, setStation] = useState("einlass");
  const [gewaehlt, setGewaehlt] = useState("");
  const [ergebnis, setErgebnis] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [hand, setHand] = useState("");

  const bild = useRef<HTMLVideoElement | null>(null);
  const gesperrt = useRef(false);
  const letzter = useRef<{ text: string; zeit: number }>({ text: "", zeit: 0 });
  /*
    Station und Vorstellung liegen zusaetzlich in Refs.

    Die Leseschleife der Kamera wird einmal aufgesetzt und laeuft danach
    weiter. Ohne die Refs haette sie die Auswahl von damals in der Hand
    und wuerde gegen die falsche Vorstellung pruefen.
  */
  const stationRef = useRef(station);
  const gewaehltRef = useRef(gewaehlt);
  useEffect(() => {
    stationRef.current = station;
    gewaehltRef.current = gewaehlt;
  }, [station, gewaehlt]);

  const laden = useCallback(async (mitAllen: boolean) => {
    try {
      const d = (await (
        await fetch(`/api/ticketscan${mitAllen ? "?alle=1" : ""}`, { cache: "no-store" })
      ).json()) as { vorstellungen?: Vorstellung[]; fehler?: string };
      if (d.fehler) {
        setFehler(d.fehler);
        return;
      }
      setFehler(null);
      const liste = d.vorstellungen ?? [];
      setVorstellungen(liste);
      setGewaehlt((bisher) => (bisher && liste.some((v) => v.id === bisher) ? bisher : liste[0]?.id ?? ""));
    } catch {
      setFehler("Die Vorstellungen kamen nicht. Steht die Verbindung?");
    }
  }, []);

  /* Einmal holen, danach alle fuenfzehn Sekunden den Stand nachziehen,
     solange kein Ergebnis im Weg steht. */
  useEffect(() => {
    const sofort = setTimeout(() => void laden(alle), 0);
    const uhr = setInterval(() => {
      if (!document.hidden && !gesperrt.current) void laden(alle);
    }, 15000);
    return () => {
      clearTimeout(sofort);
      clearInterval(uhr);
    };
  }, [laden, alle]);

  const scannen = useCallback(async (eingabe: string) => {
    if (gesperrt.current || !eingabe.trim()) return;
    gesperrt.current = true;
    try {
      const antwort = await fetch("/api/ticketscan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eingabe,
          station: stationRef.current,
          vorstellung: gewaehltRef.current,
        }),
      });
      const d = (await antwort.json()) as Antwort & { fehler?: string };
      if (d.fehler) {
        setErgebnis(leereAntwort("Nicht möglich", d.fehler));
        melden(false);
        return;
      }
      setErgebnis(d);
      melden(art(d) === "ok");
      upgradeMelden(d);
    } catch {
      setErgebnis(leereAntwort("Keine Verbindung", "Der Scan kam nicht durch. Noch einmal versuchen."));
      melden(false);
    }
  }, []);

  /* ── Kamera ──────────────────────────────────────────────────────── */
  useEffect(() => {
    let strom: MediaStream | null = null;
    let schleife: number | null = null;
    let detektor: { detect: (b: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } | null = null;
    let abgebrochen = false;
    const leinwand = document.createElement("canvas");

    const gelesen = (text: string) => {
      const jetzt = Date.now();
      if (text === letzter.current.text && jetzt - letzter.current.zeit < 4000) return;
      letzter.current = { text, zeit: jetzt };
      void scannen(text);
    };

    const lesen = async () => {
      const v = bild.current;
      if (gesperrt.current || !v || !v.videoWidth) return;
      try {
        if (detektor) {
          const treffer = await detektor.detect(v);
          if (treffer.length > 0) {
            gelesen(treffer[0].rawValue);
            return;
          }
        }
        const qr = (
          window as unknown as {
            jsQR?: (d: Uint8ClampedArray, b: number, h: number, o?: unknown) => { data: string } | null;
          }
        ).jsQR;
        if (!qr) return;
        const b = Math.min(640, v.videoWidth);
        const h = Math.round(v.videoHeight * (b / v.videoWidth));
        leinwand.width = b;
        leinwand.height = h;
        const z = leinwand.getContext("2d", { willReadFrequently: true });
        if (!z) return;
        z.drawImage(v, 0, 0, b, h);
        const code = qr(z.getImageData(0, 0, b, h).data, b, h, { inversionAttempts: "dontInvert" });
        if (code?.data) gelesen(code.data);
      } catch {
        /* ein Bild verloren, das naechste kommt */
      }
    };

    void (async () => {
      // jsQR liegt als eigene Datei daneben: Auf dem iPhone gibt es den
      // BarcodeDetector nicht, und ohne Leser nuetzt die Kamera nichts.
      if (!(window as unknown as { jsQR?: unknown }).jsQR) {
        await new Promise<void>((fertig) => {
          const s = document.createElement("script");
          s.src = "/jsQR.js";
          s.onload = () => fertig();
          s.onerror = () => fertig();
          document.head.appendChild(s);
        });
      }
      if (abgebrochen) return;
      try {
        strom = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (abgebrochen) {
          strom.getTracks().forEach((t) => t.stop());
          return;
        }
        if (bild.current) {
          bild.current.srcObject = strom;
          await bild.current.play().catch(() => undefined);
        }
        if ("BarcodeDetector" in window) {
          try {
            const B = (
              window as unknown as {
                BarcodeDetector: new (o: { formats: string[] }) => NonNullable<typeof detektor>;
              }
            ).BarcodeDetector;
            detektor = new B({ formats: ["qr_code"] });
          } catch {
            detektor = null;
          }
        }
        schleife = window.setInterval(() => void lesen(), 180);
      } catch {
        setKameraFehler(
          "Die Kamera lässt sich nicht öffnen. Bitte den Zugriff erlauben, oder unten den Kurzcode eintippen.",
        );
      }
    })();

    return () => {
      abgebrochen = true;
      if (schleife) clearInterval(schleife);
      if (strom) strom.getTracks().forEach((t) => t.stop());
    };
  }, [scannen]);

  const weiter = useCallback(() => {
    setErgebnis(null);
    gesperrt.current = false;
    void laden(alle);
  }, [laden, alle]);

  /* Ein sauberes Ja verschwindet von selbst, damit der Naechste drankommt. */
  useEffect(() => {
    if (!ergebnis || art(ergebnis) !== "ok" || ergebnis.hinweise.length > 0) return;
    const uhr = setTimeout(weiter, 2600);
    return () => clearTimeout(uhr);
  }, [ergebnis, weiter]);

  const zuruecknehmen = async () => {
    if (!ergebnis?.ticketId) return;
    if (!window.confirm("Das Entwerten dieses Tickets zurücknehmen?")) return;
    await fetch("/api/ticketscan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ was: "zurueck", ticketId: ergebnis.ticketId }),
    }).catch(() => undefined);
    weiter();
  };

  const aktuell = vorstellungen.find((v) => v.id === gewaehlt) ?? null;

  if (ergebnis) {
    const f = FARBE[art(ergebnis)];
    return (
      <div className="rounded-xl border-2 px-5 py-6 text-center" style={{ borderColor: f.rand, background: f.flaeche }}>
        <div className="text-5xl font-bold" style={{ color: f.rand }}>
          {f.zeichen}
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{ergebnis.titel}</h2>
        {ergebnis.gast && <p className="mt-1 text-lg">{ergebnis.gast}</p>}
        {ergebnis.zeilen.map((z, i) => (
          <p key={i} className="mt-1 text-sm">
            {z}
          </p>
        ))}
        {ergebnis.gruppe && ergebnis.gruppe.gesamt > 1 && (
          <p className="mt-2 text-sm font-semibold">
            {ergebnis.gruppe.eingelassen} von {ergebnis.gruppe.gesamt} Gästen dieser Bestellung sind drin
          </p>
        )}
        {ergebnis.hinweise.length > 0 && (
          <div className="mt-3 space-y-1 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--flaeche)" }}>
            {ergebnis.hinweise.map((h, i) => (
              <p key={i}>{h}</p>
            ))}
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={weiter}
            className="rounded-md px-5 py-3 text-base font-semibold"
            style={{ background: "var(--gold)", color: "#fff" }}
          >
            Weiter scannen
          </button>
          {ergebnis.upgrade?.link && (
            <a
              href={ergebnis.upgrade.link}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-linie bg-flaeche px-4 py-3 text-sm"
            >
              Zum Upgrade-Plan
            </a>
          )}
          {ergebnis.ergebnis === "ok" && (
            <button
              type="button"
              onClick={zuruecknehmen}
              className="rounded-md border border-linie bg-flaeche px-4 py-3 text-sm text-leise"
            >
              Entwerten zurücknehmen
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fehler && <p className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">{fehler}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-leise">Station</span>
          <select
            value={station}
            onChange={(e) => setStation(e.target.value)}
            className="w-full rounded-md border border-linie px-2 py-2"
          >
            {STATIONEN.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.text}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-leise">Vorstellung</span>
          <select
            value={gewaehlt}
            onChange={(e) => setGewaehlt(e.target.value)}
            className="w-full rounded-md border border-linie px-2 py-2"
          >
            {vorstellungen.length === 0 && <option value="">Heute keine Vorstellung</option>}
            {vorstellungen.map((v) => (
              <option key={v.id} value={v.id}>
                {zeit(v.beginn)} · {v.titel}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button type="button" onClick={() => setAlle((a) => !a)} className="text-xs text-leise underline">
        {alle ? "Nur heutige Shows zeigen" : "Alle kommenden Shows zeigen"}
      </button>

      {aktuell && (
        <div className="rounded-lg border border-linie bg-flaeche px-4 py-3">
          <p className="text-sm">
            <strong className="text-xl tabular-nums">{aktuell.drin}</strong> von {aktuell.gesamt} eingelassen
          </p>
          <div className="mt-2 h-2 w-full rounded" style={{ background: "var(--linie)" }}>
            <div
              className="h-2 rounded"
              style={{
                width: aktuell.gesamt ? `${Math.round((aktuell.drin / aktuell.gesamt) * 100)}%` : "0",
                background: "var(--gold)",
              }}
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "4 / 3" }}>
        <video ref={bild} playsInline muted className="h-full w-full object-cover" />
      </div>
      <p className="text-center text-sm text-leise">{kameraFehler ?? "QR-Code vor die Kamera halten"}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = hand.trim();
          setHand("");
          void scannen(t);
        }}
        className="flex gap-2"
      >
        <input
          value={hand}
          onChange={(e) => setHand(e.target.value)}
          placeholder="FZT-"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 rounded-md border border-linie px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-linie bg-flaeche px-4 py-2 text-sm">
          Prüfen
        </button>
      </form>
    </div>
  );
}
