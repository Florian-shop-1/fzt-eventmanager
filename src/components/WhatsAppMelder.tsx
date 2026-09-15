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
 * Der Knopf ist grün wie WhatsApp. Die Zahl oben rechts zählt wie in der App
 * die unbeantworteten Unterhaltungen, auch im Titel des Browser-Tabs. Sie
 * wird rot, sobald eine davon auf das Ende der 24 Stunden zuläuft oder schon
 * drüber ist.
 *
 * Wer gerade in genau dieser Unterhaltung ist, bekommt keine Einblendung,
 * sondern die Seite lädt die neue Nachricht einfach nach.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Stand {
  ungelesen: number;
  unbeantwortet: number;
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
  const [stand, setStand] = useState<Stand>({ ungelesen: 0, unbeantwortet: 0, dringend: 0, neueste: null });
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

  // Die Zahl auch im Tab-Titel, damit man sie sieht, wenn der Eventmanager im Hintergrund liegt.
  useEffect(() => {
    const ohne = document.title.replace(/^\(\d+\) /, "");
    document.title = stand.unbeantwortet > 0 ? `(${stand.unbeantwortet}) ${ohne}` : ohne;
  });

  const zahl = stand.unbeantwortet;
  const eilig = stand.dringend > 0;

  return (
    <>
      <Link
        href="/whatsapp"
        className={`relative ml-1 inline-flex items-center gap-1.5 rounded-full py-1.5 pl-3 font-medium transition-[filter] hover:brightness-95 ${zahl > 0 ? "pr-4" : "pr-3"}`}
        style={{ background: "#25D366", color: "#07361f" }}
        title={
          zahl > 0
            ? `${zahl} unbeantwortet${eilig ? `, davon ${stand.dringend} dringend (24 Stunden bald oder schon vorbei)` : ""}`
            : "Alles beantwortet"
        }
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.86 9.86 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.7-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07s.89 2.4 1.01 2.57c.12.16 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
        </svg>
        WhatsApp
        {zahl > 0 && (
          <span
            className="absolute -top-2 -right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums text-white ring-2 ring-white"
            style={{ background: eilig ? "#E5383B" : "#0A84FF" }}
            aria-label={`${zahl} unbeantwortet${eilig ? ", dringend" : ""}`}
          >
            {zahl > 99 ? "99+" : zahl}
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
