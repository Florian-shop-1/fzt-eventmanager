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

/**
 * Tag und Uhrzeit unserer Zeitzone zu einem echten Zeitpunkt.
 *
 * "18:35 am 12.10." heißt 18:35 Uhr in Neu-Ulm, nicht in Greenwich. Auf
 * dem Server bei Vercel läuft die Uhr nach Weltzeit, und `new
 * Date("2026-10-12T18:35")` wird dort als 18:35 UTC gelesen, also 20:35
 * bei uns. Genau so landete Olenas Feierabend zwei Stunden zu spät im
 * Änderungswunsch (Florian, 12.10.2026: "wenn ich das bestätige, wird
 * dann 18:35 oder 20:35 bestätigt?").
 *
 * Deutschland hat nur zwei Abstände zur Weltzeit. Welcher an diesem Tag
 * gilt, holt Intl heraus, und das geht ohne zusätzliches Paket.
 */
export function zeitpunktAusBerlin(tag: string, uhrzeit: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag) || !/^\d{1,2}:\d{2}$/.test(uhrzeit)) return null;
  const [j, m, t] = tag.split("-").map(Number);
  const [h, min] = uhrzeit.split(":").map(Number);
  if (h > 23 || min > 59) return null;

  const roh = Date.UTC(j, m - 1, t, h, min);
  const probe = new Date(roh);
  const berlin = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const welt = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(roh - (berlin.getTime() - welt.getTime())).toISOString();
}
