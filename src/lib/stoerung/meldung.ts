/**
 * Die Warnmail zu einer Störung, die der Shop gemeldet hat.
 *
 * Empfänger sind Florian, Kevin und Julian: Florian und Kevin, weil ein Gast
 * gerade nicht kaufen konnte, Julian, weil die Ursache meistens in Ditix
 * liegt und nur dort zu beheben ist.
 *
 * Verschickt wird seit dem 23.09.2026 nur noch, was ein Gast wirklich vor
 * sich hatte und was der Shop auch beim stillen zweiten Anlauf nicht
 * wegbekommen hat. Was im Hintergrund passiert und sich in einer Sekunde
 * von selbst erledigt, wird gezählt und steht auf /stoerungen, aber es
 * schickt niemandem eine Mail.
 */

import { mailVerschicken } from "@/lib/mail/versand";
import {
  stoerungEinstellung,
  stoerungMailVermerken,
  type TechnikStoerung,
} from "@/lib/db/technik-stoerung";
import { ditixTicketsLink, ditixVerkaufLink } from "@/lib/ditix/link";
import { findeTermin } from "@/lib/ditix/spielplan";
import { datumMitWochentag } from "@/lib/zeit";

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
  "no-seatmapSchemaId": "Am Termin hängt in Ditix kein Saalplan.",
  "invalid-prices-response": "Ditix hat auf die Preisabfrage keine brauchbare Antwort geliefert.",
};

/** Macht aus der technischen Ursache einen Satz, den jeder lesen kann. */
export function grundText(grund: string | null): string {
  if (!grund) return "Grund unbekannt.";
  const schluessel = grund.split("·")[0].trim();
  return GRUENDE[schluessel] ?? `Grund: ${grund}`;
}

/** Was der Gast auf dem Bildschirm hatte. */
export function wasDerGastSah(s: TechnikStoerung): string {
  if (s.art === "warteliste") {
    return 'Der Gast sah "Noch nicht im Verkauf" mit der Warteliste, statt Plätze wählen zu können.';
  }
  return "Der Gast konnte an dieser Stelle nicht weiterbuchen.";
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
  if (!(await stoerungEinstellung()).mailAn) return;

  /*
    Den Termin nachschlagen: Meldet der Shop "Termin nicht in der
    Ditix-Liste", steht in eventZeit kein Datum, und in der Mail stand
    dann nur die Show. Um welchen Abend es geht, war damit nicht zu
    erkennen (Florian, 23.09.2026).
  */
  const termin = s.eventId ? await findeTermin(s.eventId).catch(() => null) : null;
  const wann = termin
    ? `${datumMitWochentag(termin.datum)}, ${termin.uhrzeit} Uhr`
    : (s.eventZeit ?? "unbekannt");
  const show = termin?.name ?? s.showName ?? "eine Show";

  const betreff = `Shop: ein Gast konnte ${show} am ${wann} nicht buchen`;

  const zeilen = [
    "ein Gast stand gerade im Shop vor einem Termin, den er nicht buchen konnte.",
    "",
    `Show: ${show}`,
    `Termin: ${wann}`,
    s.eventId ? `Ditix-Termin-Nr.: ${s.eventId}` : "",
    "",
    "Was der Gast gesehen hat:",
    wasDerGastSah(s),
    "",
    "Woran es liegt:",
    grundText(s.grund),
    "",
    // Damit klar ist, dass das hier kein Rauschen aus dem Hintergrund ist.
    "Diese Mail kommt nur, wenn der Bildschirm einem Gast wirklich angezeigt wurde und",
    "der Shop ihn auch beim zweiten, stillen Anlauf nicht wegbekommen hat. Meldungen,",
    "die sich von selbst erledigen, stehen nur im Eventmanager und lösen keine Mail aus.",
    "",
    "Zu prüfen in Ditix: Verkaufszeitraum des Termins, Preise auf den Saalplan-Kategorien",
    "und Verkaufszeit der Ticketarten.",
    ditixVerkaufLink(s.eventId) ? `Verkaufszeitraum: ${ditixVerkaufLink(s.eventId)}` : "",
    ditixTicketsLink(s.eventId) ? `Ticketarten und Preise: ${ditixTicketsLink(s.eventId)}` : "",
    "",
    `Im Eventmanager, mit Zähler und Verlauf: ${ort()}`,
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
