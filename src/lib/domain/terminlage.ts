/**
 * Steht der Termin, oder wartet er noch auf die Zusage?
 *
 * "es muss klar ersichtlich sein, ob es noch Zusage ausstehend ist oder
 * bestätigt ist (bestätigt ist mit erstem Zahlungseingang, manchmal
 * gibts Ratenzahlung)" (Florian, 14.10.2026).
 *
 * Deshalb zählt hier die erste Zahlung, nicht die vollständige. Für den
 * Sitzplan bleibt es dabei, dass erst der volle Betrag einen Platz fest
 * macht (siehe sicherheitAusStatus); das ist eine andere Frage als die,
 * ob wir den Abend für diese Firma freihalten.
 */

import type { VorgangStatus } from "./vorgang";

export interface Terminlage {
  bestaetigt: boolean;
  text: string;
  /** Warum es so steht, in einem Satz. */
  erklaerung: string;
}

export function terminlage(o: {
  status: VorgangStatus;
  /** Alle Zahlungen des Vorgangs. Erstattungen zählen nicht als Zusage. */
  zahlungen: Array<{ betragCent: number; art: string }>;
}): Terminlage {
  const eingegangen = o.zahlungen.filter((z) => z.art !== "erstattung" && z.betragCent > 0);
  const summe = eingegangen.reduce((n, z) => n + z.betragCent, 0);

  if (o.status === "abgesagt") {
    return { bestaetigt: false, text: "Abgesagt", erklaerung: "Der Vorgang ist abgesagt." };
  }

  if (o.status === "verloren") {
    return {
      bestaetigt: false,
      text: "Verloren",
      erklaerung: "Der Kunde hat sich anders entschieden. Die Plätze sind wieder frei.",
    };
  }

  if (eingegangen.length > 0) {
    const betrag = (summe / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
    return {
      bestaetigt: true,
      text: "Termin bestätigt",
      erklaerung:
        eingegangen.length === 1
          ? `Zahlung über ${betrag} ist eingegangen.`
          : `${eingegangen.length} Zahlungen über zusammen ${betrag} sind eingegangen.`,
    };
  }

  if (o.status === "bezahlt" || o.status === "durchgefuehrt" || o.status === "teilzahlung") {
    return {
      bestaetigt: true,
      text: "Termin bestätigt",
      erklaerung: "Der Vorgang steht auf bezahlt, auch wenn hier keine Zahlung erfasst ist.",
    };
  }

  return {
    bestaetigt: false,
    text: "Zusage ausstehend",
    erklaerung:
      o.status === "angenommen"
        ? "Der Kunde hat zugesagt, bezahlt ist noch nichts. Fest wird der Termin mit der ersten Zahlung."
        : "Fest wird der Termin mit der ersten Zahlung, auch bei Ratenzahlung.",
  };
}
