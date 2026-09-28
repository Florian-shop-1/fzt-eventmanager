/**
 * Für welche Gesellschaft ein Beleg gilt.
 *
 * Florian führt neben dem Florian Zimmer Theater noch zwei weitere
 * Firmen. Deren Ausgaben werden genauso erfasst wie die des Theaters,
 * gehören aber in getrennte Bücher (Florian, 28.09.2026).
 *
 * Umstellen darf das vorerst nur Florian selbst. Alle anderen scannen
 * weiter auf das Theater, ohne dass sie überhaupt eine Auswahl sehen.
 */

export type Gesellschaft = "fzt" | "magic-expert" | "true-talent";

export const GESELLSCHAFTEN: Array<{
  wert: Gesellschaft;
  name: string;
  kurz: string;
  /**
   * Vor die laufende Nummer gesetzt, damit jede Firma ihre eigene
   * lückenlose Zählung hat. Das Theater behält seine bisherigen Nummern
   * ohne Vorsatz.
   */
  praefix: string;
}> = [
  { wert: "fzt", name: "Florian Zimmer Theater GmbH", kurz: "Theater", praefix: "" },
  { wert: "magic-expert", name: "Magic-Expert GbR", kurz: "Magic-Expert", praefix: "ME-" },
  { wert: "true-talent", name: "True Talent GmbH", kurz: "True Talent", praefix: "TT-" },
];

/** Wer die Gesellschaft umstellen darf. */
const DARF_UMSTELLEN = ["info@florianzimmer.com"];

export function darfGesellschaftWaehlen(
  b: { email?: string | null } | null | undefined,
): boolean {
  if (!b?.email) return false;
  return DARF_UMSTELLEN.includes(b.email.toLowerCase());
}

export function istGesellschaft(wert: unknown): wert is Gesellschaft {
  return GESELLSCHAFTEN.some((g) => g.wert === wert);
}

export function gesellschaftName(wert: string): string {
  return GESELLSCHAFTEN.find((g) => g.wert === wert)?.name ?? "Florian Zimmer Theater GmbH";
}

export function gesellschaftKurz(wert: string): string {
  return GESELLSCHAFTEN.find((g) => g.wert === wert)?.kurz ?? "Theater";
}

export function gesellschaftPraefix(wert: string): string {
  return GESELLSCHAFTEN.find((g) => g.wert === wert)?.praefix ?? "";
}
