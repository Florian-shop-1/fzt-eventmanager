/**
 * Der Abrechnungszeitraum für die Löhne.
 *
 * Er läuft vom 16. eines Monats bis einschließlich zum 15. des
 * Folgemonats. So rechnet das Steuerbüro, und so gibt Werner die Stunden
 * an Frau Buschow weiter (Florian, 29.09.2026).
 *
 * Benannt wird ein Zeitraum nach dem Monat, in dem er endet: Der
 * Zeitraum vom 16. September bis 15. Oktober heißt "Oktober 2026", denn
 * mit diesem Lohnlauf wird er abgerechnet.
 */

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export interface Zeitraum {
  /** Kennung im Format JJJJ-MM, nach dem Monat des Endes. */
  schluessel: string;
  /** Erster Tag, JJJJ-MM-16. */
  von: string;
  /** Letzter Tag, einschließlich, JJJJ-MM-15. */
  bis: string;
  name: string;
}

function zweistellig(n: number): string {
  return String(n).padStart(2, "0");
}

/** Der Zeitraum zu einer Kennung wie "2026-10". */
export function zeitraumVon(schluessel: string): Zeitraum {
  const [jahr, monat] = schluessel.split("-").map(Number);
  const vorMonat = monat === 1 ? 12 : monat - 1;
  const vorJahr = monat === 1 ? jahr - 1 : jahr;

  return {
    schluessel: `${jahr}-${zweistellig(monat)}`,
    von: `${vorJahr}-${zweistellig(vorMonat)}-16`,
    bis: `${jahr}-${zweistellig(monat)}-15`,
    name: `${MONATE[monat - 1]} ${jahr}`,
  };
}

/**
 * Welcher Zeitraum gerade läuft.
 *
 * Bis zum 15. gehört der Tag noch zum Zeitraum dieses Monats, ab dem
 * 16. zum nächsten.
 */
export function laufenderZeitraum(heute = new Date()): Zeitraum {
  const hier = new Date(heute.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).replace(" ", "T"));
  const tag = hier.getDate();
  const monat = hier.getMonth() + 1;
  const jahr = hier.getFullYear();

  if (tag <= 15) return zeitraumVon(`${jahr}-${zweistellig(monat)}`);
  return zeitraumVon(monat === 12 ? `${jahr + 1}-01` : `${jahr}-${zweistellig(monat + 1)}`);
}

/** Der Zeitraum davor, für den Blick zurück. */
export function vorherigerZeitraum(z: Zeitraum): Zeitraum {
  const [jahr, monat] = z.schluessel.split("-").map(Number);
  return zeitraumVon(monat === 1 ? `${jahr - 1}-12` : `${jahr}-${zweistellig(monat - 1)}`);
}

export function naechsterZeitraum(z: Zeitraum): Zeitraum {
  const [jahr, monat] = z.schluessel.split("-").map(Number);
  return zeitraumVon(monat === 12 ? `${jahr + 1}-01` : `${jahr}-${zweistellig(monat + 1)}`);
}

/** Eine Kennung prüfen, damit nichts Fremdes in die Abfragen gerät. */
export function istZeitraumSchluessel(wert: unknown): wert is string {
  return typeof wert === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(wert);
}
