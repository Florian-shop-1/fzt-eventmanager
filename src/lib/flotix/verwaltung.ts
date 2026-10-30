/**
 * Links in die FloTix-Verwaltung.
 *
 * "du sagst du holst preise aus ditix - das schalte ich kommenden
 * Montag bereits ab" (Florian, 30.10.2026).
 *
 * Bis hierher zeigten Absagen und Störungsmeldungen auf ditix.app, also
 * auf Unterseiten eines Systems, das es ab dem 02.11.2026 für uns nicht
 * mehr gibt. Wer so einer Mail folgte, landete im Nichts, und das
 * ausgerechnet dann, wenn gerade etwas klemmt.
 *
 * FloTix kennt bisher keine eigene Seite je Termin, sondern Blätter im
 * Backend. Deshalb zeigen die Links auf das passende Blatt statt auf
 * den einzelnen Termin. Sobald das Backend einen Termin direkt
 * ansteuern kann, wird daraus wieder ein genauer Link, und zwar nur
 * hier in dieser Datei.
 */

const BASIS = process.env.FLOTIX_URL ?? "https://flotix.florianzimmertheater.de";

/** Vorstellungen: Verkaufszeitraum, Kontingent, Verkaufsstand. */
export function flotixVorstellungenLink(): string {
  return `${BASIS}/backend.html#vorstellungen`;
}

/** Die Bestellungen, zum Nachsehen einzelner Käufe. */
export function flotixBestellungenLink(): string {
  return `${BASIS}/backend.html#bestellungen`;
}

/** Der Saalplan mit den Preisen der Kategorien. */
export function flotixSaalplanLink(): string {
  return `${BASIS}/backend.html#saalplan`;
}
