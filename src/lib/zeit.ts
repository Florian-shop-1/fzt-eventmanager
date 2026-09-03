/**
 * Datum und Uhrzeit, immer in deutscher Zeit.
 *
 * Warum das nötig ist: Der Server bei Vercel läuft in UTC. Ohne feste
 * Zeitzone würde eine Vorstellung um 20:00 Uhr als 18:00 Uhr erscheinen,
 * und eine späte Vorstellung sogar am falschen Tag landen. Auf dem Rechner
 * im Büro fällt das nicht auf, weil dort deutsche Zeit eingestellt ist.
 *
 * Deshalb gibt jede Ausgabe hier die Zeitzone ausdrücklich mit.
 */

export const ZEITZONE = "Europe/Berlin";

/** Uhrzeit als "20:00". */
export function uhrzeit(datum: Date): string {
  return datum.toLocaleTimeString("de-DE", {
    timeZone: ZEITZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Datum als JJJJ-MM-TT in deutscher Zeit, nicht in UTC. */
export function isoDatum(datum: Date): string {
  // "en-CA" liefert genau das Format JJJJ-MM-TT.
  return datum.toLocaleDateString("en-CA", { timeZone: ZEITZONE });
}

/** Datum als "Fr., 13.11.2026". */
export function datumMitWochentag(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("de-DE", {
    timeZone: ZEITZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Datum als "13. November 2026". */
export function datumLang(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("de-DE", {
    timeZone: ZEITZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Datum und Uhrzeit als "13.11.26, 20:00". */
export function zeitpunkt(datum: Date): string {
  return datum.toLocaleString("de-DE", {
    timeZone: ZEITZONE,
    dateStyle: "short",
    timeStyle: "short",
  });
}
