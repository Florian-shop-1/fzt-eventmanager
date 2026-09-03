/**
 * Preislogik. Die eigentlichen Preise stehen im Artikelstamm (`artikel.ts`),
 * hier steht nur, wie daraus gerechnet wird.
 *
 * Alle Beträge sind BRUTTO in Cent, damit beim Rechnen keine
 * Rundungsfehler entstehen.
 */

import { artikel } from "./artikel";

/** Standard-Ticketkategorie, die in Angeboten als Hauptposition steht. */
export const STANDARD_TICKET = "TK2";

/**
 * Alternativpositionen, die im Angebot unter der Hauptposition erscheinen.
 * So kann der Kunde die Kategorie selbst wählen, genau wie in den
 * Musterangeboten AG-0826-1167 und AG-0826-1168.
 */
export const TICKET_ALTERNATIVEN = ["TK1", "TGS", "TK3"];

/** Frist, bis zu der ein Angebot gilt: sieben Tage, wie in den Musterangeboten. */
export const ANGEBOT_GUELTIG_TAGE = 7;

/**
 * Frist für die Menüwahl laut Angebotstext. Florian sagt, in der Praxis
 * geht es notfalls noch am selben Tag, deshalb ist das eine Warnschwelle
 * und keine harte Sperre.
 */
export const MENUEWAHL_FRIST_TAGE = 7;

/**
 * Wert eines Logenplatzes, der wegen Unterbelegung blockiert ist und
 * nicht mehr verkauft werden kann. Dieser Betrag wird dem Kunden als
 * Differenz in Rechnung gestellt.
 *
 * Herleitung: ein zusätzlicher Gast hätte Menü und Showticket gekauft.
 * Menü Loge 79 Euro plus Ticket Kat. 2 89 Euro ergibt 168 Euro.
 *
 * Zum Vergleich: die frühere Logenpauschale von 2.300 Euro brutto
 * entspricht 191,67 Euro je Platz einer Zwölferloge.
 */
export const ENTGANGENER_UMSATZ_PRO_LOGENPLATZ =
  artikel("4GANGLOGE").bruttoCent + artikel(STANDARD_TICKET).bruttoCent;

/** Bisheriger Pauschalpreis für eine komplette Loge, brutto. */
export const LOGENPAUSCHALE_BISHER = 230000;

/** Formatiert Cent als deutschen Eurobetrag, zum Beispiel "168,00 €". */
export function eur(cent: number): string {
  return (
    (cent / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

/** Zerlegt einen Bruttobetrag in Netto und Steueranteil. */
export function steueranteil(bruttoCent: number, ustSatz: number): { netto: number; ust: number } {
  const netto = Math.round(bruttoCent / (1 + ustSatz));
  return { netto, ust: bruttoCent - netto };
}

/** Wendet einen Prozentrabatt auf einen Bruttobetrag an, wie im Angebot AG-0826-1168. */
export function mitRabatt(bruttoCent: number, prozent: number): number {
  return Math.round(bruttoCent * (1 - prozent / 100));
}
