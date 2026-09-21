/**
 * Die Warnmail zu einer Störung, die der Shop gemeldet hat.
 *
 * Empfänger sind Florian, Kevin und Julian: Florian und Kevin, weil ein Gast
 * gerade nicht kaufen konnte, Julian, weil die Ursache meistens in Ditix
 * liegt und nur dort zu beheben ist.
 */

import { mailVerschicken } from "@/lib/mail/versand";
import { stoerungMailVermerken, type TechnikStoerung } from "@/lib/db/technik-stoerung";
import { ditixTicketsLink, ditixVerkaufLink } from "@/lib/ditix/link";

export const STOERUNG_EMPFAENGER = [
  "info@florianzimmer.com",
  "kevin.steele@florianzimmer.com",
  "julian@profitables.marketing",
];

const GRUENDE: Record<string, string> = {
  "event-not-in-list":
    "Der Termin steht nicht in der Terminliste von Ditix. Entweder ist der Verkauf abgelaufen oder der Termin ist nicht freigegeben.",
  "all-categories-unpriced":
    "Auf keiner Saalplan-Kategorie steht ein Preis. Ohne Preis gibt es für den Shop nichts zu verkaufen.",
  "no-active-ticket-types-for-categories":
    "Zu den Kategorien des Saalplans ist keine Ticketart aktiv. Vermutlich ist die Verkaufszeit der Ticketarten abgelaufen.",
};

/** Macht aus der technischen Ursache einen Satz, den jeder lesen kann. */
export function grundText(grund: string | null): string {
  if (!grund) return "Grund unbekannt.";
  const schluessel = grund.split("·")[0].trim();
  return GRUENDE[schluessel] ?? `Grund: ${grund}`;
}

function ort(): string {
  return `${process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de"}/stoerungen`;
}

/**
 * Verschickt die Mail und vermerkt das. Fehler werden nur ins Protokoll
 * geschrieben: Die Störung selbst steht schon in der Datenbank, und eine
 * Ausnahme hier darf den Shop nicht aufhalten.
 */
export async function stoerungMailen(s: TechnikStoerung): Promise<void> {
  const was = s.art === "warteliste" ? "Warteliste statt Saalplan" : s.art;
  const betreff = `Störung im Shop: ${was} bei ${s.showName ?? "einer Show"}`;

  const zeilen = [
    "im Shop konnte gerade jemand nicht buchen.",
    "",
    `Show: ${s.showName ?? "unbekannt"}`,
    `Termin: ${s.eventZeit ?? "unbekannt"}`,
    s.eventId ? `Ditix-Termin-Nr.: ${s.eventId}` : "",
    // Direkt in Ditix, damit niemand erst den Termin suchen muss: Verkauf für
    // den Verkaufszeitraum, Tickets für die Preise der Kategorien.
    ditixVerkaufLink(s.eventId) ? `Verkaufszeitraum in Ditix: ${ditixVerkaufLink(s.eventId)}` : "",
    ditixTicketsLink(s.eventId) ? `Ticketarten und Preise: ${ditixTicketsLink(s.eventId)}` : "",
    "",
    s.art === "warteliste"
      ? "Der Gast hat statt des Saalplans die Warteliste gesehen, obwohl diese Show bis zum Showbeginn im Verkauf ist."
      : "",
    grundText(s.grund),
    "",
    "Zu prüfen in Ditix: Verkaufszeitraum des Termins, Preise auf den Saalplan-Kategorien und Verkaufszeit der Ticketarten.",
    "",
    `Im Eventmanager: ${ort()}`,
  ].filter((z) => z !== "");

  try {
    await mailVerschicken({
      an: STOERUNG_EMPFAENGER,
      betreff,
      text: ["Hallo,", "", ...zeilen, "", "Diese Mail kommt automatisch aus dem FZT Eventmanager."].join("\n"),
      antwortAn: "info@florianzimmer.com",
    });
    await stoerungMailVermerken(s.id);
  } catch (f) {
    console.error("[stoerung] Warnmail ging nicht hinaus:", f instanceof Error ? f.message : f);
  }
}
