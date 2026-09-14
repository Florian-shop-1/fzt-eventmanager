/**
 * Wie eilig eine WhatsApp-Unterhaltung ist. Ohne Datenbank, damit es sich
 * mit festen Uhrzeiten prüfen lässt (scripts/test-whatsapp.ts).
 */

/** 24 Stunden nach der letzten Kundennachricht schliesst WhatsApp das Fenster. */
export const FENSTER_STUNDEN = 24;

/** Ab so wenig Restzeit wird eine unbeantwortete Nachricht dringend. */
export const KNAPP_STUNDEN = 4;

/** So lange nach Ablauf bleibt die Warnung stehen, danach ist es Vergangenheit. */
export const ABGELAUFEN_WARNEN_TAGE = 7;

/**
 * Wie eilig eine Unterhaltung ist.
 *
 *  keine       beantwortet, anderweitig erledigt, oder nichts vom Kunden offen
 *  wartet      unbeantwortet, aber noch mehr als 4 Stunden Zeit
 *  knapp       unbeantwortet, das Fenster schliesst in höchstens 4 Stunden
 *  abgelaufen  unbeantwortet, und die 24 Stunden sind vorbei
 *
 * Als beantwortet zählt nur, was ein Mensch geschrieben hat, hier oder in der
 * App. Die automatische Antwort zählt nicht, sie sagt nur "wir melden uns".
 *
 * Nicht zu antworten kostet übrigens nichts. Die Warnung ist für den Kunden
 * da, nicht für die Rechnung: Wer nach 24 Stunden noch per WhatsApp
 * schreiben will, braucht eine bezahlte Vorlage. Ein Anruf geht immer.
 */
export type Dringlichkeit = "keine" | "wartet" | "knapp" | "abgelaufen";

export function dringlichkeit(
  letzterEingang: Date | null,
  beantwortet: boolean,
  jetzt = Date.now(),
): { stufe: Dringlichkeit; restMinuten: number | null } {
  if (!letzterEingang || beantwortet) return { stufe: "keine", restMinuten: null };
  const rest = Math.round((letzterEingang.getTime() + FENSTER_STUNDEN * 3600_000 - jetzt) / 60_000);
  if (rest > KNAPP_STUNDEN * 60) return { stufe: "wartet", restMinuten: rest };
  if (rest > 0) return { stufe: "knapp", restMinuten: rest };
  if (-rest < ABGELAUFEN_WARNEN_TAGE * 24 * 60) return { stufe: "abgelaufen", restMinuten: rest };
  return { stufe: "keine", restMinuten: rest };
}

