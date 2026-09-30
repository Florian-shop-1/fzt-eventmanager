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

/**
 * Der Hinweisbuchstabe, den der Techniker mit auf den Zettel schreibt.
 *
 * Auf dem Zettel steht sonst nur das Stichwort, und spaeter weiss niemand
 * mehr, zu welcher Frage es gehoerte. Ein Buchstabe oben in der Ecke
 * reicht: I wie inspiriert, U wie "urspruenglich wollte ich", A wie
 * Abenteuer, M wie magischster Moment (Florian, 30.09.2026).
 */
export const KATEGORIE_BUCHSTABE: Record<Kategorie, string> = {
  inspiriert: "I",
  beruf: "U",
  abenteuer: "A",
  magischster_moment: "M",
};

/** Was der Buchstabe bedeutet. Erscheint, wenn man darauf zeigt. */
export const KATEGORIE_ERKLAERUNG: Record<Kategorie, string> = {
  inspiriert: "I wie inspiriert: Wer hat mich am meisten inspiriert? Schreib das I klein oben links auf den Zettel.",
  beruf: "U wie urspruenglich: Was wollte ich urspruenglich werden? Schreib das U klein oben links auf den Zettel.",
  abenteuer: "A wie Abenteuer: Was war mein aufregendstes Abenteuer? Schreib das A klein oben links auf den Zettel.",
  magischster_moment:
    "M wie magischster Moment: Was war mein magischster Moment? Schreib das M klein oben links auf den Zettel.",
};
