/**
 * Raumkonfiguration des Florian Zimmer Theaters.
 *
 * Diese Datei ist bewusst als Konfiguration angelegt und nicht fest
 * im Code verdrahtet: Tische in der Eventgalerie sollen laut Florian
 * spaeter noch dazugekauft werden, und die Foyer-Stehtische sind
 * noch nicht gezaehlt.
 */

import type { BereichId } from "./types";

/** Eine der fuenf Logen im Logenbereich. */
export interface Loge {
  id: string;
  nummer: number;
  name: string;
  /** Regulaere Anzahl Gedecke am langen Tisch. */
  plaetze: number;
  /** Gedecke je Laengsseite. plaetze = proSeite * 2. */
  proSeite: number;
  /**
   * Zusatzstuehle an der kurzen Stirnseite. Laut Florian passt bei
   * einer 12er-Loge zur Not noch ein 13. Gast an den Kopf des Tisches.
   */
  stirnseitePlaetze: number;
}

/** Ein Tisch in der Eventgalerie. */
export interface Tisch {
  id: string;
  name: string;
  /** 2 oder 4. Tische lassen sich zu Sechsern und Achtern zusammenstellen. */
  plaetze: number;
}

/**
 * Der Logenbereich. Fuenf Logen nebeneinander, getrennt durch Vorhaenge,
 * dadurch beliebig zusammenlegbar.
 *
 * Wichtig: Aus der Loge sieht man die Show nicht. Jeder Logengast
 * bekommt zusaetzlich ein Showticket (Empore oder Golden Seats).
 */
export const LOGEN: Loge[] = [
  { id: "loge-1", nummer: 1, name: "Loge 1", plaetze: 10, proSeite: 5, stirnseitePlaetze: 1 },
  { id: "loge-2", nummer: 2, name: "Loge 2", plaetze: 12, proSeite: 6, stirnseitePlaetze: 1 },
  { id: "loge-3", nummer: 3, name: "Loge 3", plaetze: 12, proSeite: 6, stirnseitePlaetze: 1 },
  { id: "loge-4", nummer: 4, name: "Loge 4", plaetze: 12, proSeite: 6, stirnseitePlaetze: 1 },
  { id: "loge-5", nummer: 5, name: "Loge 5", plaetze: 12, proSeite: 6, stirnseitePlaetze: 1 },
];

/**
 * Zwischen Loge 1 und Loge 2 liegt ein kleiner baulicher Abstand.
 * Eine Gruppe ueber diese Grenze hinweg sitzt weniger schoen zusammen
 * als eine Gruppe in 2+3 oder 3+4. Der Planer darf 1+2 zusammenlegen,
 * bewertet es aber schlechter.
 */
export const LOGEN_LUECKE_ZWISCHEN: ReadonlyArray<[number, number]> = [[1, 2]];

/**
 * Eventgalerie: Zweier- und Vierertische, frei zusammenstellbar.
 * Zielkapazitaet rund 40 Gaeste.
 *
 * TODO Florian: exakten Tischbestand nachtragen, sobald feststeht,
 * ob noch Tische dazugekauft werden.
 */
export const EVENTGALERIE_TISCHE: Tisch[] = [
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `eg-2er-${i + 1}`,
    name: `Zweiertisch ${i + 1}`,
    plaetze: 2,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `eg-4er-${i + 1}`,
    name: `Vierertisch ${i + 1}`,
    plaetze: 4,
  })),
];

/**
 * Foyer im Erdgeschoss, Haupteingang. Stehtische fuer die Pause,
 * ueber den Shop buchbar. Keine Menueplaetze.
 *
 * TODO Florian: tatsaechliche Anzahl Stehtische nachtragen.
 */
export const FOYER_STEHTISCHE = {
  anzahl: 10,
  plaetzeProTisch: 4,
};

/** Gesamtkapazitaet je Bereich, ohne Notstuehle. */
export function kapazitaet(bereich: BereichId): number {
  switch (bereich) {
    case "logen":
      return LOGEN.reduce((s, l) => s + l.plaetze, 0);
    case "eventgalerie":
      return EVENTGALERIE_TISCHE.reduce((s, t) => s + t.plaetze, 0);
    case "foyer":
      return FOYER_STEHTISCHE.anzahl * FOYER_STEHTISCHE.plaetzeProTisch;
  }
}

/** Kapazitaet einer Loge inklusive Notstuhl an der Stirnseite. */
export function logeMaxPlaetze(loge: Loge): number {
  return loge.plaetze + loge.stirnseitePlaetze;
}

/** Alle Essplaetze der Magicuisine zusammen: Logen plus Eventgalerie. */
export const MENUEPLAETZE_GESAMT = kapazitaet("logen") + kapazitaet("eventgalerie");
