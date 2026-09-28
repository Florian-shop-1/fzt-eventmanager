/**
 * Die vier möglichen Show-Fragen bei HÖRE ZU und ihre kurzen Feldnamen.
 *
 * In einer Show werden immer nur drei der vier gestellt. Welche drei das
 * sind, entscheidet sich live daran, was tatsächlich erkannt wird, nicht
 * vorab (Florian, 28.09.2026).
 *
 * Eigene, schlanke Datei ohne Server-Abhängigkeiten: Sie wird sowohl vom
 * Claude-Aufruf auf dem Server als auch von der Oberfläche im Browser
 * gebraucht.
 */

export const KATEGORIEN = ["inspiriert", "abenteuer", "magischster_moment", "beruf"] as const;
export type Kategorie = (typeof KATEGORIEN)[number];

export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  inspiriert: "INSPIRIERT",
  abenteuer: "ABENTEUER",
  magischster_moment: "MAGISCHSTER MOMENT",
  beruf: "BERUF",
};
