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
import { KameraMitKreis } from "@/components/KameraMitKreis";
import { ScanHase, lobFuer, type HasenStimmung } from "@/components/ScanHase";

const MAX = 1800;

interface Eintrag {
  schluessel: string;
  stand: "laedt" | "gut" | "spaeter" | "pruefen" | "fehler";
  text: string;
}

async function verkleinern(datei: Blob): Promise<Blob> {
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

export function ScannerKamera({ vorname }: { vorname: string }) {
  const router = useRouter();
  const kamera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const schlange = useRef<Promise<void>>(Promise.resolve());
  const [kameraOffen, setKameraOffen] = useState(false);
  const [runde, setRunde] = useState(0);
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [hase, setHase] = useState<{ id: number; text: string; stimmung: HasenStimmung; dauer: number } | null>(null);
  const geschafft = useRef(0);
  const kameraAuf = useRef(false);

  const aendern = (schluessel: string, neu: Partial<Eintrag>) =>
    setEintraege((alt) => alt.map((e) => (e.schluessel === schluessel ? { ...e, ...neu } : e)));

  /** Ein Bild in die Warteschlange. Fotos aus der Kreis-Kamera sind schon zugeschnitten. */
  function einreihen(bild: Blob, schonKlein: boolean) {
    const schluessel = `${Date.now()}-${Math.random()}`;
    setEintraege((alt): Eintrag[] => [{ schluessel, stand: "laedt" as const, text: "Wird hochgeladen und gelesen..." }, ...alt].slice(0, 40));
    // Nacheinander, nicht gleichzeitig: Azure nimmt höchstens 20 Karten pro Minute.
    schlange.current = schlange.current.then(async () => {
      try {
        const form = new FormData();
        form.append("foto", schonKlein ? bild : await verkleinern(bild), "karte.jpg");
        const r = await fetch("/scanner/hochladen", { method: "POST", body: form });
        const ergebnis = beschreiben((await r.json()) as Antwort);
        aendern(schluessel, ergebnis);
        if (ergebnis.stand !== "fehler") {
          geschafft.current += 1;
          // Während die Kamera offen ist, lobt er kurz. Das große Dankeschön kommt beim Schließen.
          setHase({ id: Date.now(), text: lobFuer(vorname, geschafft.current), stimmung: "lob", dauer: 2200 });
        }
      } catch (e) {
        aendern(schluessel, { stand: "fehler", text: e instanceof Error ? e.message : "Hochladen fehlgeschlagen" });
      }
      router.refresh();
    });
  }

  function annehmen(dateien: FileList | null) {
    for (const datei of Array.from(dateien ?? [])) einreihen(datei, false);
    if (kamera.current) kamera.current.value = "";
    if (galerie.current) galerie.current.value = "";
  }

  function kameraStarten() {
    setKameraFehler(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      kamera.current?.click();
      return;
    }
    setRunde(0);
    kameraAuf.current = true;
    setKameraOffen(true);
  }

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={kameraStarten}
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
        Tipp: Karte flach auf einen dunklen Untergrund legen und von oben in den Kreis nehmen. Klappt
        die Kamera nicht,{" "}
        <button type="button" onClick={() => kamera.current?.click()} className="underline">
          Kamera-App des Handys nutzen
        </button>
        .
      </p>
      {kameraFehler && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
          <span>{kameraFehler}</span>
          <button type="button" onClick={() => kamera.current?.click()} className="rounded-md border border-linie bg-flaeche px-3 py-1.5">
            Kamera-App öffnen
          </button>
        </div>
      )}

      {kameraOffen && (
        <KameraMitKreis
          anzahl={runde}
          onFoto={(bild) => {
            setRunde((n) => n + 1);
            einreihen(bild, true);
          }}
          onSchliessen={() => {
            kameraAuf.current = false;
            setKameraOffen(false);
            if (runde > 0) {
              setHase({
                id: Date.now(),
                text: `Super, ${vorname || "du"}! ${runde} ${runde === 1 ? "Karte" : "Karten"} in dieser Runde. Vielen Dank fürs Scannen, hier ist ein Keks für dich.`,
                stimmung: "keks",
                dauer: 4500,
              });
            }
          }}
          onFehler={(meldung) => {
            setKameraOffen(false);
            // Die Kamera-App lässt sich hier nicht selbst öffnen: Browser erlauben
            // das nur direkt nach einem Tippen. Deshalb Meldung mit eigenem Knopf.
            setKameraFehler(meldung);
          }}
        />
      )}

      {hase && (
        <ScanHase
          key={hase.id}
          text={hase.text}
          stimmung={hase.stimmung}
          dauer={hase.dauer}
          oben={kameraOffen}
          onWeg={() => setHase(null)}
        />
      )}

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
