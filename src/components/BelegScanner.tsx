"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Beleg fotografieren. Bewusst die Kamera des Handys statt einer eigenen:
 * Sie stellt scharf, blitzt bei Bedarf und ist bei langen Kassenbons
 * besser als jedes Vorschaubild im Browser.
 *
 * Vor dem Hochladen wird verkleinert (längste Seite 2200 Pixel). Das reicht
 * zum Lesen und fürs Finanzamt und geht auch im Restaurant-WLAN schnell.
 */
export function BelegScanner() {
  const router = useRouter();
  const eingabe = useRef<HTMLInputElement>(null);
  const [lage, setLage] = useState<"bereit" | "laedt" | "fehler">("bereit");
  const [meldung, setMeldung] = useState("");

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
      form.append("foto", await verkleinern(datei), "beleg.jpg");
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
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={eingabe}
        type="file"
        accept="image/*"
        capture="environment"
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
      {meldung && (
        <p className="text-sm" style={{ color: lage === "fehler" ? "var(--blocker)" : "var(--text-leise)" }}>
          {meldung}
        </p>
      )}
    </div>
  );
}
