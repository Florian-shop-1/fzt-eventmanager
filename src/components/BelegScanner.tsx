"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Eine Firma zur Auswahl. */
interface Auswahl {
  wert: string;
  name: string;
}

/**
 * Beleg fotografieren. Bewusst die Kamera des Handys statt einer eigenen:
 * Sie stellt scharf, blitzt bei Bedarf und ist bei langen Kassenbons
 * besser als jedes Vorschaubild im Browser.
 *
 * Vor dem Hochladen wird verkleinert (längste Seite 2200 Pixel). Das reicht
 * zum Lesen und fürs Finanzamt und geht auch im Restaurant-WLAN schnell.
 *
 * Neben dem Foto geht auch ein PDF: Rechnungen von Lieferanten, Meta oder
 * Google kommen so per Mail. Es wird unverändert hochgeladen und von
 * derselben Erkennung gelesen (Florian, 30.09.2026).
 */
export function BelegScanner({ gesellschaften }: { gesellschaften?: Auswahl[] }) {
  const router = useRouter();
  const eingabe = useRef<HTMLInputElement>(null);
  const dateiwahl = useRef<HTMLInputElement>(null);
  const [lage, setLage] = useState<"bereit" | "laedt" | "fehler">("bereit");
  const [meldung, setMeldung] = useState("");
  /*
    Fuer welche Firma der naechste Beleg gilt.

    Steht oben, nicht im Beleg danach: Wer im Restaurant steht, hat die
    Firma im Kopf, bevor er fotografiert. Die Wahl bleibt stehen, bis sie
    jemand aendert, denn meistens kommen mehrere Belege derselben Firma
    hintereinander (Florian, 28.09.2026).
  */
  const [gesellschaft, setGesellschaft] = useState("fzt");

  /** Ein PDF? Dann bleibt es, wie es ist. */
  function istPdf(datei: File): boolean {
    return datei.type === "application/pdf" || datei.name.toLowerCase().endsWith(".pdf");
  }

  async function verkleinern(datei: File): Promise<Blob> {
    const bild = await createImageBitmap(datei);
    const faktor = Math.min(1, 2200 / Math.max(bild.width, bild.height));
    const leinwand = document.createElement("canvas");
    leinwand.width = Math.round(bild.width * faktor);
    leinwand.height = Math.round(bild.height * faktor);
    leinwand.getContext("2d")!.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
    return new Promise((ok, nein) =>
      leinwand.toBlob((b) => (b ? ok(b) : nein(new Error("Bild ließ sich nicht umwandeln."))), "image/jpeg", 0.88),
    );
  }

  async function gewaehlt(datei: File | undefined) {
    if (!datei) return;
    setLage("laedt");
    setMeldung("Beleg wird gelesen, einen Moment...");
    try {
      const form = new FormData();
      /*
        Ein PDF geht unveraendert hinueber.

        Rechnungen von Lieferanten, Meta oder Google kommen als PDF, und
        die durch die Bildverkleinerung zu schicken hiesse, sie vorher
        kaputtzumachen: createImageBitmap kann mit einem PDF nichts
        anfangen (Florian, 30.09.2026). Gelesen wird es hinterher
        ohnehin vom selben Modell.
      */
      if (istPdf(datei)) {
        form.append("foto", datei, datei.name || "beleg.pdf");
      } else {
        form.append("foto", await verkleinern(datei), "beleg.jpg");
      }
      form.append("gesellschaft", gesellschaft);
      const antwort = await fetch("/bewirtung/hochladen", { method: "POST", body: form });
      const e = (await antwort.json()) as { ok: boolean; id?: string; doppelt?: boolean; hinweis?: string; fehler?: string };
      if (!e.ok || !e.id) throw new Error(e.fehler ?? "Hochladen hat nicht geklappt.");
      const q = e.doppelt ? "Diesen Beleg gibt es schon." : (e.hinweis ?? "");
      router.push(`/bewirtung/${e.id}${q ? `?meldung=${encodeURIComponent(q)}` : ""}`);
    } catch (f) {
      setLage("fehler");
      setMeldung(f instanceof Error ? f.message : "Unbekannter Fehler");
    } finally {
      if (eingabe.current) eingabe.current.value = "";
      if (dateiwahl.current) dateiwahl.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {gesellschaften && gesellschaften.length > 1 && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-leise">Beleg gehört zu</span>
          <select
            value={gesellschaft}
            onChange={(e) => setGesellschaft(e.target.value)}
            className="w-full sm:w-auto"
          >
            {gesellschaften.map((g) => (
              <option key={g.wert} value={g.wert}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <input
        ref={eingabe}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => gewaehlt(e.target.files?.[0])}
      />
      {/*
        Zwei Wege zum selben Ziel.

        Der grosse Knopf oeffnet die Kamera, denn der haeufigste Fall ist
        der Bon in der Hand. Wer eine Rechnung als PDF im Postfach oder
        auf dem Rechner hat, nimmt den Weg darunter; mit "capture" am
        grossen Knopf kaeme er auf dem Handy nie an seine Dateien
        (Florian, 30.09.2026).
      */}
      <input
        ref={dateiwahl}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => gewaehlt(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={lage === "laedt"}
        onClick={() => eingabe.current?.click()}
        className="w-full rounded-xl px-5 py-4 text-lg font-semibold text-white disabled:opacity-60 sm:w-auto"
        style={{ background: "var(--gold-dunkel)" }}
      >
        {lage === "laedt" ? "Wird gelesen..." : "Beleg scannen"}
      </button>
      <button
        type="button"
        disabled={lage === "laedt"}
        onClick={() => dateiwahl.current?.click()}
        className="block text-sm underline text-leise disabled:opacity-60"
      >
        PDF oder Bild aus den Dateien
      </button>
      {meldung && (
        <p className="text-sm" style={{ color: lage === "fehler" ? "var(--blocker)" : "var(--text-leise)" }}>
          {meldung}
        </p>
      )}
    </div>
  );
}
