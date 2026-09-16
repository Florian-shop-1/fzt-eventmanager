"use client";

/**
 * Fotografieren und Hochladen, fürs Handy gebaut.
 *
 * "Karte fotografieren" öffnet direkt die Kamera. "Aus Fotos" erlaubt,
 * mehrere Karten auf einmal aus der Galerie zu nehmen, etwa wenn jemand
 * vorher schon fotografiert hat.
 *
 * Jedes Foto wird auf dem Gerät auf höchstens 1800 Pixel verkleinert und
 * nacheinander hochgeladen. Man muss nicht warten: Die nächste Karte kann
 * sofort fotografiert werden, die Liste darunter zeigt, was mit jeder
 * passiert ist.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const MAX = 1800;

interface Eintrag {
  schluessel: string;
  stand: "laedt" | "gut" | "spaeter" | "pruefen" | "fehler";
  text: string;
}

async function verkleinern(datei: File): Promise<Blob> {
  const url = URL.createObjectURL(datei);
  try {
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    const faktor = Math.min(1, MAX / Math.max(bild.naturalWidth, bild.naturalHeight));
    const leinwand = document.createElement("canvas");
    leinwand.width = Math.round(bild.naturalWidth * faktor);
    leinwand.height = Math.round(bild.naturalHeight * faktor);
    leinwand.getContext("2d")!.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
    return await new Promise<Blob>((ok, nein) =>
      leinwand.toBlob((b) => (b ? ok(b) : nein(new Error("Foto nicht lesbar"))), "image/jpeg", 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Antwort {
  ok: boolean;
  fehler?: string;
  doppelt?: boolean;
  hinweis?: string | null;
  karte?: { status: string; vorname: string; nachname: string; email: string; grund: string | null } | null;
}

function beschreiben(a: Antwort): Pick<Eintrag, "stand" | "text"> {
  if (!a.ok) return { stand: "fehler", text: a.fehler ?? "Hochladen fehlgeschlagen" };
  if (a.doppelt) return { stand: "fehler", text: "Dieses Foto wurde schon gescannt." };
  const k = a.karte;
  const name = [k?.vorname, k?.nachname].filter(Boolean).join(" ") || "Karte";
  switch (k?.status) {
    case "uebertragen": return { stand: "gut", text: `${name}, ${k.email}: bei Brevo eingetragen` };
    case "doppelt": return { stand: "gut", text: `${name}: Adresse war schon eingetragen` };
    case "wartet_claude": return { stand: "spaeter", text: `${name}: nicht eindeutig, Claude liest heute Nacht nach` };
    case "pruefen": return { stand: "pruefen", text: `${name}: bitte unten prüfen` };
    case "fehler": return { stand: "fehler", text: `${name}: ${k.grund ?? "Brevo hat abgelehnt"}` };
    default: return { stand: "spaeter", text: a.hinweis ?? "Wird später gelesen" };
  }
}

const FARBE: Record<Eintrag["stand"], string> = {
  laedt: "var(--text-leise)",
  gut: "var(--gut)",
  spaeter: "var(--info)",
  pruefen: "var(--warnung)",
  fehler: "var(--blocker)",
};

export function ScannerKamera() {
  const router = useRouter();
  const kamera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const schlange = useRef<Promise<void>>(Promise.resolve());

  const aendern = (schluessel: string, neu: Partial<Eintrag>) =>
    setEintraege((alt) => alt.map((e) => (e.schluessel === schluessel ? { ...e, ...neu } : e)));

  function annehmen(dateien: FileList | null) {
    for (const datei of Array.from(dateien ?? [])) {
      const schluessel = `${Date.now()}-${Math.random()}`;
      setEintraege((alt): Eintrag[] => [{ schluessel, stand: "laedt" as const, text: "Wird hochgeladen und gelesen..." }, ...alt].slice(0, 40));
      // Nacheinander, nicht gleichzeitig: Azure nimmt höchstens 20 Karten pro Minute.
      schlange.current = schlange.current.then(async () => {
        try {
          const form = new FormData();
          form.append("foto", await verkleinern(datei), "karte.jpg");
          const r = await fetch("/scanner/hochladen", { method: "POST", body: form });
          aendern(schluessel, beschreiben((await r.json()) as Antwort));
        } catch (e) {
          aendern(schluessel, { stand: "fehler", text: e instanceof Error ? e.message : "Hochladen fehlgeschlagen" });
        }
        router.refresh();
      });
    }
    if (kamera.current) kamera.current.value = "";
    if (galerie.current) galerie.current.value = "";
  }

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => kamera.current?.click()}
          className="rounded-lg border border-gold bg-gold px-4 py-5 text-lg font-semibold text-white active:scale-[0.99]"
        >
          Karte fotografieren
        </button>
        <button
          type="button"
          onClick={() => galerie.current?.click()}
          className="rounded-lg border border-linie px-4 py-5 text-base hover:bg-gold-hell"
        >
          Mehrere aus Fotos wählen
        </button>
      </div>
      <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => annehmen(e.target.files)} />
      <input ref={galerie} type="file" accept="image/*" multiple hidden onChange={(e) => annehmen(e.target.files)} />
      <p className="mt-3 text-xs text-leise">
        Tipp: Karte flach auf einen dunklen Untergrund legen, von oben fotografieren, die ganze Karte im Bild.
      </p>

      {eintraege.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {eintraege.map((e) => (
            <li key={e.schluessel} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: FARBE[e.stand] }} />
              <span className={e.stand === "laedt" ? "text-leise" : ""}>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
