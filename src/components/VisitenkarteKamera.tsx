"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Der Knopf zum Fotografieren einer Visitenkarte.
 *
 * Bewusst schlicht: Karte auf den Tisch, abfotografieren, fertig. Anders
 * als bei den Glücks-Moji-Karten wird hier nichts zugeschnitten, eine
 * Visitenkarte ist eckig und liegt selten gerade.
 *
 * Mehrere Karten hintereinander gehen auch: Jedes Foto wandert in eine
 * Schlange und wird einzeln gelesen, damit das Modell nicht durcheinander
 * kommt.
 */

interface Zeile {
  schluessel: string;
  stand: "laedt" | "fertig" | "fehler";
  text: string;
}

/** Große Fotos kosten im Foyer-WLAN nur Zeit. 1600 Pixel reichen zum Lesen. */
async function verkleinern(bild: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(bild);
  const faktor = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  if (faktor === 1) return bild;

  const breite = Math.round(bitmap.width * faktor);
  const hoehe = Math.round(bitmap.height * faktor);
  const flaeche = document.createElement("canvas");
  flaeche.width = breite;
  flaeche.height = hoehe;
  flaeche.getContext("2d")?.drawImage(bitmap, 0, 0, breite, hoehe);
  return await new Promise<Blob>((fertig) =>
    flaeche.toBlob((b) => fertig(b ?? bild), "image/jpeg", 0.9),
  );
}

export function VisitenkarteKamera() {
  const router = useRouter();
  const kamera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const schlange = useRef<Promise<void>>(Promise.resolve());
  const [zeilen, setZeilen] = useState<Zeile[]>([]);

  const aendern = (schluessel: string, neu: Partial<Zeile>) =>
    setZeilen((alt) => alt.map((z) => (z.schluessel === schluessel ? { ...z, ...neu } : z)));

  function einreihen(bild: Blob) {
    const schluessel = `${Date.now()}-${Math.random()}`;
    setZeilen((alt): Zeile[] => [{ schluessel, stand: "laedt" as const, text: "Wird gelesen..." }, ...alt].slice(0, 20));

    schlange.current = schlange.current.then(async () => {
      try {
        const form = new FormData();
        form.append("foto", await verkleinern(bild), "visitenkarte.jpg");
        const r = await fetch("/visitenkarten/hochladen", { method: "POST", body: form });
        const d = (await r.json()) as {
          ok: boolean;
          gelesen?: boolean;
          doppelt?: boolean;
          uebertragen?: boolean;
          meldung?: string;
          hinweis?: string | null;
          fehler?: string;
          karte?: { name: string; firma: string; email: string; sicherheit: string };
        };

        if (!d.ok) {
          aendern(schluessel, { stand: "fehler", text: d.fehler ?? "Das hat nicht geklappt." });
        } else if (!d.gelesen) {
          aendern(schluessel, { stand: "fehler", text: d.hinweis ?? "Keine Visitenkarte zu erkennen." });
        } else {
          const k = d.karte!;
          const teile = [k.name || "ohne Namen", k.firma, k.email].filter(Boolean);
          const nachsatz = d.doppelt
            ? " — stand schon in den Magic News"
            : d.uebertragen
              ? " — in den Magic News" + (k.sicherheit === "unsicher" ? ", Adresse bitte unten prüfen" : "")
              : ` — NICHT übertragen: ${d.meldung ?? "unbekannter Grund"}`;
          aendern(schluessel, {
            stand: d.uebertragen || d.doppelt ? "fertig" : "fehler",
            text: teile.join(" · ") + nachsatz,
          });
        }
      } catch (f) {
        aendern(schluessel, { stand: "fehler", text: f instanceof Error ? f.message : "Hochladen fehlgeschlagen" });
      }
      router.refresh();
    });
  }

  function annehmen(dateien: FileList | null) {
    for (const datei of Array.from(dateien ?? [])) einreihen(datei);
    if (kamera.current) kamera.current.value = "";
    if (galerie.current) galerie.current.value = "";
  }

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => kamera.current?.click()}
          className="rounded-lg px-4 py-6 text-lg font-semibold text-white"
          style={{ background: "var(--gold-dunkel)" }}
        >
          Visitenkarte fotografieren
        </button>
        <button
          type="button"
          onClick={() => galerie.current?.click()}
          className="rounded-lg border border-linie px-4 py-6 text-lg font-medium"
        >
          Foto aus der Galerie
        </button>
      </div>

      <input
        ref={kamera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => annehmen(e.target.files)}
      />
      <input
        ref={galerie}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => annehmen(e.target.files)}
      />

      <p className="mt-3 text-xs text-leise">
        Karte flach hinlegen, von oben fotografieren. Mehrere nacheinander gehen auch. Gelesen und
        nach Brevo übertragen wird sofort, du musst nichts weiter tun. Unten kannst du nachsehen,
        ob alles richtig gelesen wurde.
      </p>

      {zeilen.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {zeilen.map((z) => (
            <li
              key={z.schluessel}
              style={{ color: z.stand === "fehler" ? "var(--blocker)" : undefined }}
            >
              {z.stand === "laedt" ? "… " : z.stand === "fertig" ? "✓ " : "× "}
              {z.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
