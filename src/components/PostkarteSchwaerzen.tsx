"use client";

import { useEffect, useRef, useState } from "react";

import { standardSchwaerzung, weitereFundstellen } from "@/lib/postkarte/schwaerzen";

/**
 * Die Schwärzung: Namen, Unterschrift und Adresse verdecken, dann
 * freigeben.
 *
 * Die KI schlägt die Rechtecke vor, ein Mensch bestätigt sie. Beides
 * ist nötig, und zwar aus demselben Grund: Ein Modell, das eine
 * Unterschrift übersieht, soll nicht allein darüber entscheiden, was
 * im Netz steht. Deshalb läuft die Freigabe hier und nirgends sonst.
 *
 * Das geschwärzte Bild entsteht im Browser auf einer Leinwand und geht
 * als neues JPEG hinaus. Es ist ein anderes Bild, nicht das Original
 * mit einem schwarzen Balken darüber: Was unter dem Balken lag, ist
 * weg und nicht wieder hervorzuholen.
 */

export interface Fundstelle {
  art: string;
  text: string;
  x: number;
  y: number;
  b: number;
  h: number;
}

const FARBE = "#111111";

export function PostkarteSchwaerzen({
  id,
  fundstellen,
  einwilligung,
}: {
  id: string;
  fundstellen: Fundstelle[];
  einwilligung: string;
}) {
  const [offen, setOffen] = useState(false);
  /*
    Vorausgewaehlt ist nur die Anschrift.

    "da es eine postkarte ist, reicht es völlig aus nur die anschrift zu
    schwärzen. dies wurde bestätigt vom anwalt" (Florian, 30.10.2026).
    Was die KI sonst gefunden hat, steht darunter zum Dazunehmen.
  */
  const [kaesten, setKaesten] = useState<Fundstelle[]>(() => standardSchwaerzung(fundstellen));
  const [uebrige, setUebrige] = useState<Fundstelle[]>(() => weitereFundstellen(fundstellen));
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [ohneEinwilligung, setOhneEinwilligung] = useState(false);
  const leinwand = useRef<HTMLCanvasElement | null>(null);
  const bild = useRef<HTMLImageElement | null>(null);

  /* Beim Öffnen das Original holen und mit den Kästen zeichnen. */
  useEffect(() => {
    if (!offen) return;
    const img = new Image();
    img.onload = () => {
      bild.current = img;
      zeichnen();
    };
    img.src = `/api/postkarte/bild/${id}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen, id]);

  useEffect(() => {
    if (offen) zeichnen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaesten]);

  function zeichnen() {
    const img = bild.current;
    const l = leinwand.current;
    if (!img || !l) return;
    const breite = Math.min(900, img.naturalWidth);
    const faktor = breite / img.naturalWidth;
    l.width = breite;
    l.height = Math.round(img.naturalHeight * faktor);
    const stift = l.getContext("2d");
    if (!stift) return;
    stift.drawImage(img, 0, 0, l.width, l.height);
    stift.fillStyle = FARBE;
    for (const k of kaesten) {
      stift.fillRect(
        (k.x / 100) * l.width,
        (k.y / 100) * l.height,
        (k.b / 100) * l.width,
        (k.h / 100) * l.height,
      );
    }
  }

  /* Mit der Maus einen weiteren Kasten aufziehen. */
  const start = useRef<{ x: number; y: number } | null>(null);
  function anfang(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    start.current = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }
  function ende(e: React.MouseEvent<HTMLCanvasElement>) {
    const a = start.current;
    start.current = null;
    if (!a) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x2 = ((e.clientX - r.left) / r.width) * 100;
    const y2 = ((e.clientY - r.top) / r.height) * 100;
    const x = Math.min(a.x, x2);
    const y = Math.min(a.y, y2);
    const b = Math.abs(x2 - a.x);
    const h = Math.abs(y2 - a.y);
    if (b < 1 || h < 1) return;
    setKaesten((alt) => [...alt, { art: "sonstiges", text: "von Hand", x, y, b, h }]);
  }

  async function freigeben() {
    const l = leinwand.current;
    if (!l) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      const blob = await new Promise<Blob | null>((f) => l.toBlob(f, "image/jpeg", 0.9));
      if (!blob) throw new Error("Das Bild ließ sich nicht erzeugen.");
      const form = new FormData();
      form.append("id", id);
      form.append("geschwaerzt", new File([blob], "karte.jpg", { type: "image/jpeg" }));
      if (ohneEinwilligung) form.append("ohne_einwilligung", "ja");

      const antwort = await fetch("/postkarten/freigeben", { method: "POST", body: form });
      const d = (await antwort.json()) as { ok: boolean; fehler?: string; einwilligungFehlt?: boolean };
      if (!d.ok) {
        setMeldung(d.fehler ?? "Das hat nicht geklappt.");
        if (d.einwilligungFehlt) setOhneEinwilligung(false);
        return;
      }
      window.location.reload();
    } catch (f) {
      setMeldung(f instanceof Error ? f.message : "Unbekannter Fehler");
    } finally {
      setLaeuft(false);
    }
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="rounded-md border border-gold bg-gold-hell px-3 py-1 text-xs font-medium"
      >
        Schwärzen und freigeben
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-linie bg-flaeche p-3">
      <canvas
        ref={leinwand}
        onMouseDown={anfang}
        onMouseUp={ende}
        className="w-full cursor-crosshair rounded border border-linie"
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-leise">
          {kaesten.length === 0
            ? "Die KI hat nichts Persönliches gefunden. Sieh selbst nach, besonders auf Unterschriften."
            : `${kaesten.length} Stelle${kaesten.length === 1 ? "" : "n"} verdeckt.`}
        </span>
        {kaesten.map((k, i) => (
          <button
            key={`${k.art}-${i}`}
            type="button"
            onClick={() => setKaesten((alt) => alt.filter((_, j) => j !== i))}
            className="rounded border border-linie px-2 py-0.5 hover:bg-gold-hell"
            title="Diese Schwärzung wieder aufheben"
          >
            {k.art}: {k.text.slice(0, 20) || "ohne Text"} ×
          </button>
        ))}
      </div>

      {uebrige.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-leise">Auch gefunden, nicht verdeckt:</span>
          {uebrige.map((k, i) => (
            <button
              key={`${k.art}-${i}`}
              type="button"
              onClick={() => {
                setKaesten((alt) => [...alt, k]);
                setUebrige((alt) => alt.filter((_, j) => j !== i));
              }}
              className="rounded border border-dashed border-linie px-2 py-0.5 text-leise hover:bg-gold-hell"
              title="Diese Stelle doch verdecken"
            >
              + {k.art}: {k.text.slice(0, 20) || "ohne Text"}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-leise">
        Verdeckt wird die Anschrift, mehr braucht es bei einer Postkarte nicht. Fehlt etwas? Mit
        der Maus über die Stelle ziehen, dann kommt ein weiterer Balken dazu. Veröffentlicht wird
        genau dieses Bild, das Original bleibt intern.
      </p>

      {einwilligung !== "erteilt" && (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={ohneEinwilligung}
            onChange={(e) => setOhneEinwilligung(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Für diese Karte liegt keine schriftliche Einwilligung vor. Ich gebe sie trotzdem frei,
            weil nichts Persönliches mehr zu sehen ist.
          </span>
        </label>
      )}

      {meldung && (
        <p className="text-xs" style={{ color: "var(--blocker)" }}>
          {meldung}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={freigeben}
          disabled={laeuft}
          className="rounded-md border border-gold bg-gold-hell px-3 py-1 text-xs font-medium"
        >
          {laeuft ? "Wird freigegeben..." : "So veröffentlichen"}
        </button>
        <button
          type="button"
          onClick={() => setOffen(false)}
          className="rounded-md border border-linie px-3 py-1 text-xs"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
