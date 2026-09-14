"use client";

/**
 * Fragt den Browser, ob er Benachrichtigungen zeigen darf.
 *
 * Muss ein Klick sein: Browser lassen die Frage nur nach einer Handlung
 * des Benutzers zu. Einmal erlaubt, verschwindet der Knopf. Auf Geräten,
 * die es nicht können (etwa Safari auf dem iPhone ohne installierte App),
 * erscheint er gar nicht erst.
 */

import { useState, useSyncExternalStore } from "react";

const nichtAbonnieren = () => () => {};

export function BenachrichtigungErlauben() {
  // Auf dem Server gibt es keinen Browser, der gefragt werden könnte: null,
  // und der Knopf erscheint erst im Browser selbst.
  const imBrowser = useSyncExternalStore(
    nichtAbonnieren,
    () => ("Notification" in window ? Notification.permission : "geht-nicht"),
    () => null,
  );
  const [nachDerFrage, setNachDerFrage] = useState<NotificationPermission | null>(null);
  const zustand = nachDerFrage ?? imBrowser;

  if (zustand === null || zustand === "geht-nicht" || zustand === "granted") return null;

  if (zustand === "denied") {
    return (
      <p className="text-xs text-leise">
        Benachrichtigungen sind in diesem Browser gesperrt. Freigeben lassen sie sich über das
        Schloss links neben der Adresse.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => setNachDerFrage(await Notification.requestPermission())}
      className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
    >
      Benachrichtigungen erlauben
    </button>
  );
}
