"use client";

import { useRef, useState } from "react";

/**
 * Postkarten einscannen, einzeln oder im Stapel.
 *
 * "Ich möchte über die Smartphone-Kamera oder einen Dokumentenscanner
 * Postkarten erfassen können ... Unterstütze Einzelaufnahmen und
 * Stapel-Uploads" (Florian, 27.10.2026).
 *
 * Verkleinert wird im Browser, bevor etwas hochgeht: Ein Handyfoto hat
 * zwölf Megapixel, die Handschrift ist bei 1600 Pixeln Breite genauso
 * gut zu lesen, und im Foyer hängt niemand am Hochladen fest. Das Bild
 * geht als JPEG hinaus und landet in der Datenbank, nicht im
 * öffentlichen Speicher.
 *
 * Geschickt wird eine Karte nach der anderen. Beim Stapel sieht man so
 * nach jeder Karte, was herausgekommen ist, statt am Ende eine
 * Sammelmeldung für zwanzig.
 */

const BREITE = 1600;

interface Ergebnis {
  dateiname: string;
  ok: boolean;
  text: string;
  bewertung?: number;
  zitat?: string;
}

async function verkleinern(datei: File): Promise<Blob> {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, BREITE / Math.max(bild.width, bild.height));
  const b = Math.round(bild.width * faktor);
  const h = Math.round(bild.height * faktor);
  const leinwand = document.createElement("canvas");
  leinwand.width = b;
  leinwand.height = h;
  const stift = leinwand.getContext("2d");
  if (!stift) throw new Error("Der Browser kann das Bild nicht verkleinern.");
  stift.drawImage(bild, 0, 0, b, h);
  bild.close();
  return await new Promise<Blob>((fertig, schief) =>
    leinwand.toBlob((x) => (x ? fertig(x) : schief(new Error("Kein Bild"))), "image/jpeg", 0.88),
  );
}

/*
  Keine Frage nach der Einwilligung beim Scannen.

  "wir legen gar keine aus ohne dass das geklaert ist. beim scan ist es
  nicht mehr entscheidend. der mitarbeiter kriegt nur welche die OK
  sind" (Florian, 27.10.2026). Die Karten im Foyer tragen den Hinweis
  also schon, und wer im Foyer steht, soll nicht etwas bestaetigen,
  das laengst entschieden ist.
*/
export function PostkartenScanner() {
  const [laeuft, setLaeuft] = useState(false);
  const [von, setVon] = useState(0);
  const [gesamt, setGesamt] = useState(0);
  const [liste, setListe] = useState<Ergebnis[]>([]);
  const feld = useRef<HTMLInputElement | null>(null);

  async function schicken(dateien: File[]) {
    setLaeuft(true);
    setGesamt(dateien.length);
    setVon(0);
    const neu: Ergebnis[] = [];

    for (let i = 0; i < dateien.length; i++) {
      const datei = dateien[i];
      setVon(i + 1);
      try {
        const klein = await verkleinern(datei);
        const form = new FormData();
        form.append("foto", new File([klein], "karte.jpg", { type: "image/jpeg" }));
        form.append("einwilligung", "erteilt");

        const antwort = await fetch("/postkarten/hochladen", { method: "POST", body: form });
        const d = (await antwort.json()) as {
          ok: boolean;
          gelesen?: boolean;
          dublette?: boolean;
          fehler?: string;
          hinweis?: string;
          karte?: { bewertung: number; zitat: string; stimmung: string; personenbezug: number };
        };

        if (!d.ok) {
          neu.push({ dateiname: datei.name, ok: false, text: d.fehler ?? "Fehler" });
        } else if (!d.gelesen) {
          neu.push({ dateiname: datei.name, ok: false, text: d.hinweis ?? "Keine Postkarte erkannt." });
        } else if (d.dublette) {
          neu.push({ dateiname: datei.name, ok: true, text: "Dublette, schon vorhanden." });
        } else {
          const k = d.karte!;
          neu.push({
            dateiname: datei.name,
            ok: true,
            bewertung: k.bewertung,
            zitat: k.zitat,
            text:
              `${k.bewertung}/10, ${k.stimmung}` +
              (k.personenbezug > 0
                ? `, ${k.personenbezug} Stelle${k.personenbezug === 1 ? "" : "n"} mit Persönlichem`
                : ", nichts Persönliches gefunden"),
          });
        }
      } catch (f) {
        neu.push({
          dateiname: datei.name,
          ok: false,
          text: f instanceof Error ? f.message : "Fehler beim Hochladen",
        });
      }
      setListe([...neu].reverse());
    }

    setLaeuft(false);
    if (feld.current) feld.current.value = "";
    /* Die Liste unten zeigt die neuen Karten erst nach dem Neuladen. */
    if (neu.some((x) => x.ok)) window.setTimeout(() => window.location.reload(), 1500);
  }

  return (
    <div className="space-y-3 rounded-lg border border-gold bg-gold-hell/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md border border-gold bg-flaeche px-4 py-2 text-sm font-medium hover:bg-gold-hell">
          <input
            ref={feld}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            disabled={laeuft}
            onChange={(e) => {
              const dateien = Array.from(e.target.files ?? []);
              if (dateien.length > 0) void schicken(dateien);
            }}
          />
          Karten fotografieren oder auswählen
        </label>


        {laeuft && (
          <span className="text-sm text-leise">
            Karte {von} von {gesamt} wird gelesen...
          </span>
        )}
      </div>

      <p className="text-xs text-leise">
        Mehrere Karten auf einmal gehen: Im Dateifenster einfach alle markieren. Die Bilder werden
        im Browser verkleinert und einzeln gelesen. Das Original bleibt intern, öffentlich wird
        später nur eine geschwärzte Fassung.
      </p>

      {liste.length > 0 && (
        <ul className="space-y-1 text-sm">
          {liste.map((e, i) => (
            <li key={`${e.dateiname}-${i}`} className="flex flex-wrap items-baseline gap-2">
              <span style={{ color: e.ok ? "var(--gut)" : "var(--blocker)" }}>
                {e.ok ? "gelesen" : "nicht gelesen"}
              </span>
              <span className="text-leise">{e.text}</span>
              {e.zitat && <span className="italic">„{e.zitat.slice(0, 90)}“</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
