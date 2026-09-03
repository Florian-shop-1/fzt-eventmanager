/**
 * Zahlung vor Ort.
 *
 * Der einzige Fall, in dem die Gastronomie einen Preis sehen darf: Wer am
 * Tisch kassieren soll, muss wissen wie viel. Alle anderen Beträge bleiben
 * für sie unsichtbar.
 *
 * Festgelegt wird der Betrag vom Team im Vorgang. Wird keiner eingetragen,
 * rechnet das Programm ihn aus den Menüs. Das ist der häufige Fall: Die
 * Firma zahlt die Tickets, jeder Gast sein Essen.
 */

import { artikel } from "./artikel";
import type { MenueVariante } from "./types";

/** Menüpreis, je nachdem ob die Gruppe in einer Loge sitzt. */
export function menuepreisCent(inLoge: boolean): number {
  return artikel(inLoge ? "4GANGLOGE" : "4GANG").bruttoCent;
}

export interface VorOrtAngaben {
  kassieren: boolean;
  /** Vom Team eingetragener Betrag in Cent, falls vorhanden. */
  betragCent?: number;
  hinweis?: string;
  kassiertAm?: string;
  kassiertVon?: string;
}

/**
 * Was am Abend zu kassieren ist.
 *
 * Ist ein Betrag eingetragen, gilt der. Sonst wird gerechnet: Anzahl
 * Menüs mal Menüpreis. Damit stimmt die Zahl auch dann, wenn jemand
 * vergessen hat, sie einzutragen.
 */
export function vorOrtBetragCent(
  angaben: VorOrtAngaben,
  menues: Partial<Record<MenueVariante, number>>,
  personen: number,
  inLoge: boolean,
): number {
  if (angaben.betragCent !== undefined && angaben.betragCent !== null) {
    return angaben.betragCent;
  }
  const anzahl = Object.values(menues).reduce((s, n) => s + (n ?? 0), 0) || personen;
  return anzahl * menuepreisCent(inLoge);
}
