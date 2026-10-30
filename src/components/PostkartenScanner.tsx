"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Postkarten einscannen, eine nach der anderen.
 *
 * "beim postkarten scannen, bitte so, dass ich eine nach der anderen
 * scannen kann.. nicht immer immer wieder button drücken" (Florian,
 * 30.10.2026).
 *
 * Vorher führte jede Karte durch die Kamera-App des Telefons: Knopf
 * drücken, auslösen, bestätigen, warten, wieder von vorne. Bei dreißig
 * Karten sind das hundertzwanzig Griffe.
 *
 * Jetzt läuft die Kamera in der Seite weiter. Karte hinlegen,
 * auslösen, nächste Karte hinlegen. Das Hochladen passiert im
 * Hintergrund, es hält nichts auf. Wer mag, schaltet die automatische
 * Auslösung dazu: Dann genügt es, die Karten nacheinander unter die
 * Kamera zu legen.
 *
 * Der Weg über den Dateiauswahl-Knopf bleibt daneben bestehen. Am
 * Schreibtisch mit einem Dokumentenscanner ist er der schnellere.
 *
 * Verkleinert wird im Browser, bevor etwas hochgeht: Ein Handyfoto hat
 * zwölf Megapixel, die Handschrift ist bei 1600 Pixeln Breite genauso
 * gut zu lesen. Das Bild geht als JPEG hinaus und landet in der
 * Datenbank, nicht im öffentlichen Speicher.
 */

const BREITE = 1600;

/* Das kleine Bild, an dem Ruhe und Wechsel gemessen werden. */
const PRUEFBREITE = 64;
const PRUEFHOEHE = 48;

/** Wie oft nachgesehen wird, ob das Bild steht. */
const TAKT = 300;

/**
 * Ab wann das Bild als ruhig gilt, im mittleren Helligkeitsunterschied
 * zum vorigen Blick. Eine Hand, die noch über der Karte liegt, kommt
 * deutlich darüber.
 */
const RUHE = 3.5;

/**
 * Ab wann eine neue Karte darunter liegt. Dieselbe Karte, nur etwas
 * verrutscht, bleibt darunter und wird nicht zweimal aufgenommen.
 */
const WECHSEL = 11;

/** Wie lange nach einer Aufnahme nichts Neues ausgelöst wird. */
const PAUSE_MS = 1200;

interface Ergebnis {
  id: number;
  ok: boolean;
  text: string;
  bewertung?: number;
  zitat?: string;
}

async function verkleinern(datei: Blob): Promise<Blob> {
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

/** Mittlerer Helligkeitsunterschied zweier Prüfbilder, 0 bis 255. */
function unterschied(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let summe = 0;
  for (let i = 0; i < a.length; i += 4) {
    const hellA = (a[i] + a[i + 1] + a[i + 2]) / 3;
    const hellB = (b[i] + b[i + 1] + b[i + 2]) / 3;
    summe += Math.abs(hellA - hellB);
  }
  return summe / (a.length / 4);
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
  const router = useRouter();

  const [kameraAn, setKameraAn] = useState(false);
  const [automatisch, setAutomatisch] = useState(true);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [offen, setOffen] = useState(0);
  const [fertig, setFertig] = useState(0);
  const [liste, setListe] = useState<Ergebnis[]>([]);
  const [blitz, setBlitz] = useState(false);
  const [bereit, setBereit] = useState(false);

  const video = useRef<HTMLVideoElement | null>(null);
  const feld = useRef<HTMLInputElement | null>(null);
  const strom = useRef<MediaStream | null>(null);
  const pruefbild = useRef<HTMLCanvasElement | null>(null);
  const vorher = useRef<Uint8ClampedArray | null>(null);
  const zuletztAufgenommen = useRef<Uint8ClampedArray | null>(null);
  const gesperrtBis = useRef(0);
  /* Die Hochladungen laufen nacheinander, damit das Lesen am Server
     nicht fuenf Karten gleichzeitig bekommt. */
  const schlange = useRef<Promise<void>>(Promise.resolve());
  const naechsteId = useRef(0);

  /** Eine Aufnahme in die Warteschlange legen. */
  const hochladen = useCallback(
    (bild: Blob) => {
      const id = naechsteId.current++;
      setOffen((n) => n + 1);
      schlange.current = schlange.current.then(async () => {
        try {
          const klein = await verkleinern(bild);
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

          let e: Ergebnis;
          if (!d.ok) {
            e = { id, ok: false, text: d.fehler ?? "Fehler" };
          } else if (!d.gelesen) {
            e = { id, ok: false, text: d.hinweis ?? "Keine Postkarte erkannt." };
          } else if (d.dublette) {
            e = { id, ok: true, text: "Dublette, schon vorhanden." };
          } else {
            const k = d.karte!;
            e = {
              id,
              ok: true,
              bewertung: k.bewertung,
              zitat: k.zitat,
              text:
                `${k.bewertung}/10, ${k.stimmung}`
                + (k.personenbezug > 0
                  ? `, ${k.personenbezug} Stelle${k.personenbezug === 1 ? "" : "n"} mit Persönlichem`
                  : ", nichts Persönliches gefunden"),
            };
          }
          setListe((l) => [e, ...l]);
          if (e.ok) setFertig((n) => n + 1);
        } catch (f) {
          setListe((l) => [
            { id, ok: false, text: f instanceof Error ? f.message : "Fehler beim Hochladen" },
            ...l,
          ]);
        } finally {
          setOffen((n) => n - 1);
        }
      });
    },
    [],
  );

  /** Das laufende Bild festhalten. */
  const ausloesen = useCallback(() => {
    const v = video.current;
    if (!v || v.videoWidth === 0) return;
    const leinwand = document.createElement("canvas");
    leinwand.width = v.videoWidth;
    leinwand.height = v.videoHeight;
    const stift = leinwand.getContext("2d");
    if (!stift) return;
    stift.drawImage(v, 0, 0);
    gesperrtBis.current = Date.now() + PAUSE_MS;
    zuletztAufgenommen.current = vorher.current;
    setBlitz(true);
    window.setTimeout(() => setBlitz(false), 180);
    leinwand.toBlob((b) => b && hochladen(b), "image/jpeg", 0.92);
  }, [hochladen]);

  /* Die Kamera an- und wieder ausschalten. */
  useEffect(() => {
    if (!kameraAn) return;
    let abgebrochen = false;

    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 } },
          audio: false,
        });
        if (abgebrochen) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        strom.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setBereit(true);
      } catch {
        setMeldung(
          "Die Kamera lässt sich nicht öffnen. Erlaube den Zugriff im Browser, oder nimm den "
          + "Knopf darunter und fotografiere wie bisher.",
        );
        setKameraAn(false);
      }
    })();

    return () => {
      abgebrochen = true;
      setBereit(false);
      strom.current?.getTracks().forEach((t) => t.stop());
      strom.current = null;
      vorher.current = null;
      zuletztAufgenommen.current = null;
    };
  }, [kameraAn]);

  /*
    Die automatische Auslösung.

    Zwei Bedingungen, beide müssen stimmen: Das Bild steht still (die
    Hand ist weg), und es zeigt etwas anderes als bei der letzten
    Aufnahme (es liegt wirklich eine neue Karte da). Ohne die zweite
    Bedingung würde dieselbe Karte im Sekundentakt aufgenommen.
  */
  useEffect(() => {
    if (!kameraAn || !automatisch || !bereit) return;
    const uhr = window.setInterval(() => {
      const v = video.current;
      if (!v || v.videoWidth === 0) return;
      let p = pruefbild.current;
      if (!p) {
        p = document.createElement("canvas");
        p.width = PRUEFBREITE;
        p.height = PRUEFHOEHE;
        pruefbild.current = p;
      }
      const stift = p.getContext("2d", { willReadFrequently: true });
      if (!stift) return;
      stift.drawImage(v, 0, 0, PRUEFBREITE, PRUEFHOEHE);
      const jetzt = stift.getImageData(0, 0, PRUEFBREITE, PRUEFHOEHE).data;

      const letztes = vorher.current;
      vorher.current = jetzt;
      if (!letztes) return;
      if (Date.now() < gesperrtBis.current) return;

      const bewegung = unterschied(jetzt, letztes);
      if (bewegung > RUHE) return;

      const alt = zuletztAufgenommen.current;
      if (alt && unterschied(jetzt, alt) < WECHSEL) return;

      ausloesen();
    }, TAKT);
    return () => window.clearInterval(uhr);
  }, [kameraAn, automatisch, bereit, ausloesen]);

  /* Die Liste unten zeigt neue Karten erst nach dem Nachladen. */
  useEffect(() => {
    if (fertig === 0 || offen > 0) return;
    const t = window.setTimeout(() => router.refresh(), 1200);
    return () => window.clearTimeout(t);
  }, [fertig, offen, router]);

  async function ausDateien(dateien: File[]) {
    for (const d of dateien) hochladen(d);
    if (feld.current) feld.current.value = "";
  }

  return (
    <div className="space-y-3 rounded-lg border border-gold bg-gold-hell/40 p-4">
      {meldung && (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
        >
          {meldung}
        </p>
      )}

      {kameraAn && (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video
              ref={video}
              playsInline
              muted
              className="block max-h-[60vh] w-full object-contain"
            />
            {blitz && <div className="absolute inset-0 bg-white/70" />}
            <div className="pointer-events-none absolute inset-4 rounded-md border-2 border-white/40" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={ausloesen}
              className="rounded-md border border-gold bg-flaeche px-5 py-2.5 text-sm font-medium hover:bg-gold-hell"
            >
              Jetzt aufnehmen
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={automatisch}
                onChange={(e) => setAutomatisch(e.target.checked)}
              />
              von selbst auslösen
            </label>
            <button
              type="button"
              onClick={() => setKameraAn(false)}
              className="text-sm text-leise underline"
            >
              Kamera schließen
            </button>
            {offen > 0 && (
              <span className="text-sm text-leise">
                {offen} {offen === 1 ? "Karte wird" : "Karten werden"} gelesen...
              </span>
            )}
          </div>

          <p className="text-xs text-leise">
            {automatisch
              ? "Leg eine Karte hin und nimm die Hand weg: Es löst von selbst aus, sobald das Bild "
                + "steht. Dann die nächste Karte darüberlegen."
              : "Leg eine Karte hin und tippe auf aufnehmen. Die Kamera bleibt offen, die nächste "
                + "Karte kommt einfach darüber."}
          </p>
        </div>
      )}

      {!kameraAn && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setMeldung(null);
              setKameraAn(true);
            }}
            className="rounded-md border border-gold bg-flaeche px-4 py-2 text-sm font-medium hover:bg-gold-hell"
          >
            Kamera öffnen und Karte für Karte scannen
          </button>

          <label className="cursor-pointer text-sm text-leise underline">
            <input
              ref={feld}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const dateien = Array.from(e.target.files ?? []);
                if (dateien.length > 0) void ausDateien(dateien);
              }}
            />
            oder Bilder vom Gerät auswählen
          </label>

          {offen > 0 && (
            <span className="text-sm text-leise">
              {offen} {offen === 1 ? "Karte wird" : "Karten werden"} gelesen...
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-leise">
        Die Bilder werden im Browser verkleinert und einzeln gelesen. Das Original bleibt intern,
        öffentlich wird später nur eine geschwärzte Fassung.
      </p>

      {/*
        Wie man eine Handschrift fotografiert, damit sie lesbar wird
        (Florian, 27.10.2026, zur Frage nach dem Blitz). Der Blitz steht
        bewusst nicht an erster Stelle: Auf glattem Karton wirft er einen
        hellen Fleck mitten ins Bild, und genau dort steht oft der beste
        Satz. Helles Zimmerlicht schlaegt den Blitz fast immer.
      */}
      <details className="text-xs text-leise">
        <summary className="cursor-pointer">So werden die Karten am besten lesbar</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Helles Licht von vorne oder von der Seite, am besten Tageslicht am Fenster.</li>
          <li>
            Nicht über die Karte beugen: Der eigene Schatten liegt sonst genau auf der Schrift.
          </li>
          <li>Die Karte soll das Bild möglichst ganz ausfüllen, gerade von oben fotografiert.</li>
          <li>
            Blitz nur, wenn es wirklich dunkel ist, und dann schräg von der Seite. Direkt von
            vorne macht er auf glattem Karton einen weißen Fleck, und die Stelle ist weg.
          </li>
          <li>Bleistift und helle Tinte: lieber zweimal fotografieren, das Lesen ist dort schwer.</li>
        </ul>
      </details>

      {liste.length > 0 && (
        <ul className="space-y-1 text-sm">
          {liste.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-2">
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
