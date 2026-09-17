"use client";

/**
 * Kamera mit Kreis, für die runden Glücks-Moji-Karten.
 *
 * Bildschirmfüllendes Livebild der Rückkamera, außerhalb eines Kreises
 * abgedunkelt. Man legt die Karte so, dass sie den Kreis ausfüllt, und
 * tippt auf den Auslöser. Die Kamera bleibt offen, die nächste Karte kann
 * sofort folgen.
 *
 * Aufgenommen wird nur das Quadrat um den Kreis, in voller Auflösung der
 * Kamera und auf höchstens 1800 Pixel verkleinert. Weniger Hintergrund
 * heißt für die Texterkennung weniger Störung.
 *
 * Geht die Kamera nicht (keine Erlaubnis, alter Browser), meldet die
 * Komponente das über onFehler, und die Seite fällt auf die normale
 * Kamera-App des Handys zurück.
 */

import { useEffect, useRef, useState } from "react";

const MAX = 1800;
/** Anteil der kürzeren Bildschirmseite, den der Kreis einnimmt. */
const KREIS = 0.86;
/** Etwas Rand um den Kreis mit aufnehmen, falls die Karte nicht ganz mittig liegt. */
const RAND = 1.08;

export function KameraMitKreis({
  onFoto,
  onSchliessen,
  onFehler,
  anzahl,
}: {
  onFoto: (bild: Blob) => void;
  onSchliessen: () => void;
  onFehler: (meldung: string) => void;
  /** Wie viele Karten in dieser Runde schon aufgenommen wurden. */
  anzahl: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [bereit, setBereit] = useState(false);
  const [blitz, setBlitz] = useState(false);
  const [radius, setRadius] = useState(0);

  // Kreisgröße in Pixeln, neu bei Drehung des Geräts.
  useEffect(() => {
    const messen = () => setRadius((Math.min(window.innerWidth, window.innerHeight) * KREIS) / 2);
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);

  useEffect(() => {
    let strom: MediaStream | null = null;
    let aktiv = true;
    (async () => {
      try {
        strom = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 2560 } },
        });
        if (!aktiv || !video.current) return;
        video.current.srcObject = strom;
        await video.current.play();
        setBereit(true);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        onFehler(
          name === "NotAllowedError"
            ? "Die Kamera ist für diese Seite nicht freigegeben. In den Browser-Einstellungen erlauben oder die Kamera-App nutzen."
            : "Die Kamera ließ sich hier nicht öffnen. Bitte die Kamera-App nutzen.",
        );
      }
    })();
    return () => {
      aktiv = false;
      strom?.getTracks().forEach((t) => t.stop());
    };
    // Nur beim Öffnen starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ausloesen() {
    const v = video.current;
    if (!v || !v.videoWidth) return;

    // Wo liegt der Kreis im Kamerabild? Das Video füllt den Bildschirm
    // (object-fit: cover), also ist es skaliert und an den Rändern beschnitten.
    const B = v.clientWidth;
    const H = v.clientHeight;
    const massstab = Math.max(B / v.videoWidth, H / v.videoHeight);
    const versatzX = (B - v.videoWidth * massstab) / 2;
    const versatzY = (H - v.videoHeight * massstab) / 2;
    const r = (Math.min(B, H) * KREIS * RAND) / 2;
    const mx = (B / 2 - versatzX) / massstab;
    const my = (H / 2 - versatzY) / massstab;
    const seite = Math.min((2 * r) / massstab, v.videoWidth, v.videoHeight);
    const sx = Math.max(0, Math.min(v.videoWidth - seite, mx - seite / 2));
    const sy = Math.max(0, Math.min(v.videoHeight - seite, my - seite / 2));

    const ziel = Math.min(MAX, Math.round(seite));
    const leinwand = document.createElement("canvas");
    leinwand.width = ziel;
    leinwand.height = ziel;
    leinwand.getContext("2d")!.drawImage(v, sx, sy, seite, seite, 0, 0, ziel, ziel);
    leinwand.toBlob((b) => b && onFoto(b), "image/jpeg", 0.88);

    setBlitz(true);
    setTimeout(() => setBlitz(false), 150);
    navigator.vibrate?.(40);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black" role="dialog" aria-label="Karte fotografieren">
      <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Abdunkelung außerhalb des Kreises, dazu ein goldener Ring. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id="kreis-maske">
            <rect width="100%" height="100%" fill="white" />
            <circle cx="50%" cy="50%" r={radius} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#kreis-maske)" />
        <circle cx="50%" cy="50%" r={radius} fill="none" stroke="#c9a84c" strokeWidth="3" strokeDasharray="10 8" />
      </svg>

      {blitz && <div className="pointer-events-none absolute inset-0 bg-white/70" />}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 text-white">
        <p className="max-w-[16rem] text-sm leading-snug drop-shadow">
          {bereit ? "Karte so legen, dass sie den Kreis ausfüllt. Dann auslösen." : "Kamera startet..."}
        </p>
        <button
          type="button"
          onClick={onSchliessen}
          className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium"
        >
          Fertig{anzahl > 0 ? ` (${anzahl})` : ""}
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={ausloesen}
          disabled={!bereit}
          aria-label="Auslösen"
          className="h-20 w-20 rounded-full border-4 border-white bg-white/25 active:scale-95 disabled:opacity-40"
        />
      </div>
    </div>
  );
}
