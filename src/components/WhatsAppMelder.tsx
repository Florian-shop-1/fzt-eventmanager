"use client";

/**
 * Der WhatsApp-Eintrag in der Navigation, mit Zähler und Einblendung.
 *
 * Fragt alle 15 Sekunden nach, ob etwas Neues da ist. Kommt eine neue
 * Nachricht, passiert dreierlei:
 *
 *  - Der Zähler neben "WhatsApp" springt hoch.
 *  - Unten rechts erscheint, wer geschrieben hat und was, mit Knopf zum
 *    Öffnen. Dazu ein kurzer Ton.
 *  - Liegt der Eventmanager im Hintergrund und hat der Browser es erlaubt,
 *    kommt eine Benachrichtigung vom Betriebssystem.
 *
 * Warum Nachfragen und keine Push-Nachrichten: Push braucht einen Dienst im
 * Hintergrund, auf dem iPhone sogar eine installierte App, und bringt für
 * drei Leute am Schreibtisch nichts, was das hier nicht auch kann. Aufs
 * Handy kommt jede neue Unterhaltung als Mail an alle mit Freigabe (whatsapp/nachlauf.ts).
 *
 * Neben dem grünen Zähler für Ungelesenes steht ein gelbes Ausrufezeichen,
 * sobald eine Nachricht unbeantwortet auf das Ende der 24 Stunden zuläuft
 * oder schon drüber ist.
 *
 * Wer gerade in genau dieser Unterhaltung ist, bekommt keine Einblendung,
 * sondern die Seite lädt die neue Nachricht einfach nach.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Stand {
  ungelesen: number;
  dringend: number;
  neueste: { waId: string; name: string; text: string; zeitpunkt: string } | null;
}

const ALLE_SEKUNDEN = 15;
const GEMELDET = "fzt_wa_gemeldet";

function merken(schluessel: string) {
  try {
    localStorage.setItem(GEMELDET, schluessel);
  } catch {
    /* privates Fenster: dann eben ohne Gedächtnis */
  }
}

function gemerkt(): string | null {
  try {
    return localStorage.getItem(GEMELDET);
  } catch {
    return null;
  }
}

/** Zwei kurze Töne, ohne Tondatei. Browser erlauben das erst nach dem ersten Klick. */
function ton() {
  try {
    const ctx = new AudioContext();
    [0, 0.14].forEach((versatz, i) => {
      const osz = ctx.createOscillator();
      const laut = ctx.createGain();
      osz.frequency.value = i === 0 ? 880 : 1175;
      laut.gain.setValueAtTime(0.0001, ctx.currentTime + versatz);
      laut.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + versatz + 0.02);
      laut.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + versatz + 0.12);
      osz.connect(laut).connect(ctx.destination);
      osz.start(ctx.currentTime + versatz);
      osz.stop(ctx.currentTime + versatz + 0.13);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* kein Ton möglich, egal */
  }
}

export function WhatsAppMelder() {
  const router = useRouter();
  const [stand, setStand] = useState<Stand>({ ungelesen: 0, dringend: 0, neueste: null });
  const [einblendung, setEinblendung] = useState<Stand["neueste"]>(null);
  const letzter = useRef<string | null>(null);

  useEffect(() => {
    letzter.current = gemerkt();
    let aktiv = true;

    const nachsehen = async () => {
      try {
        const antwort = await fetch("/whatsapp/stand", { cache: "no-store" });
        if (!antwort.ok || !aktiv) return;
        const neu = (await antwort.json()) as Stand;
        setStand(neu);

        const n = neu.neueste;
        if (!n) return;
        const schluessel = `${n.waId}@${n.zeitpunkt}`;
        if (schluessel === letzter.current) return;
        letzter.current = schluessel;
        merken(schluessel);

        const hier = new URLSearchParams(window.location.search).get("mit");
        const inDieserUnterhaltung = window.location.pathname === "/whatsapp" && hier === n.waId;
        if (window.location.pathname.startsWith("/whatsapp")) router.refresh();
        if (inDieserUnterhaltung && !document.hidden) return;

        setEinblendung(n);
        ton();

        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          const meldung = new Notification(`WhatsApp von ${n.name}`, {
            body: n.text.slice(0, 140),
            tag: `wa-${n.waId}`,
          });
          meldung.onclick = () => {
            window.focus();
            router.push(`/whatsapp?mit=${n.waId}`);
          };
        }
      } catch {
        /* Netz kurz weg: beim nächsten Mal wieder */
      }
    };

    nachsehen();
    const uhr = setInterval(nachsehen, ALLE_SEKUNDEN * 1000);

    /*
      Der Countdown im Posteingang ("noch 3 Std.") wird auf dem Server
      berechnet. Ohne neue Nachricht stünde er stundenlang still und würde
      nie gelb oder rot. Deshalb auf der WhatsApp-Seite jede Minute neu
      laden, ohne dass sich an Eingaben etwas ändert.
    */
    const minute = setInterval(() => {
      if (window.location.pathname.startsWith("/whatsapp") && !document.hidden) router.refresh();
    }, 60_000);

    return () => {
      aktiv = false;
      clearInterval(uhr);
      clearInterval(minute);
    };
  }, [router]);

  return (
    <>
      <Link
        href="/whatsapp"
        className="relative rounded px-3 py-1.5 text-leise transition-colors hover:bg-gold-hell hover:text-text"
      >
        WhatsApp
        {stand.ungelesen > 0 && (
          <span
            className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums text-white"
            style={{ background: "var(--gut)" }}
            aria-label={`${stand.ungelesen} neue Unterhaltungen`}
          >
            {stand.ungelesen}
          </span>
        )}
        {stand.dringend > 0 && (
          <span
            className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white"
            style={{ background: "var(--warnung)" }}
            title={`${stand.dringend} unbeantwortet, 24 Stunden bald oder schon vorbei`}
            aria-label={`${stand.dringend} dringend`}
          >
            !
          </span>
        )}
      </Link>

      {einblendung && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-50 w-80 rounded-lg border border-linie bg-flaeche p-4 shadow-lg print:hidden"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium" style={{ color: "var(--gut)" }}>
                Neue WhatsApp
              </div>
              <div className="truncate font-semibold">{einblendung.name}</div>
              <p className="mt-1 line-clamp-3 text-sm text-leise">{einblendung.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setEinblendung(null)}
              className="text-leise hover:text-text"
              aria-label="Schliessen"
            >
              ×
            </button>
          </div>
          <Link
            href={`/whatsapp?mit=${einblendung.waId}`}
            onClick={() => setEinblendung(null)}
            className="mt-3 inline-block rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
          >
            Öffnen
          </Link>
        </div>
      )}
    </>
  );
}
