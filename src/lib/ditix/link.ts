/**
 * Links in die Ditix-Verwaltung.
 *
 * Der Verwaltungsbereich liegt unter ditix.app, jeder Veranstalter hat dort
 * eine eigene Kennung in der Adresse. Die des Florian Zimmer Theaters steht
 * als Standard hier, damit ein Link auch ohne gesetzte Umgebungsvariable
 * funktioniert; über DITIX_MANDANT_ID ist sie austauschbar.
 *
 * Gedacht für Meldungen, bei denen jemand sofort in Ditix nachsehen soll,
 * etwa eine Störung wegen fehlender Preise (siehe lib/stoerung/meldung.ts).
 */

const MANDANT = "383a331e-afaa-49cd-8203-d4955d2bffc6";

export function ditixMandant(): string {
  return process.env.DITIX_MANDANT_ID ?? MANDANT;
}

/** Direkt zum Termin in der Ditix-Verwaltung. Ohne Termin-Nr. null. */
export function ditixTerminLink(eventId: string | null | undefined): string | null {
  if (!eventId) return null;
  return `https://ditix.app/app/${ditixMandant()}/events/${encodeURIComponent(eventId)}`;
}

/** Die Bestellungen zum Termin, falls jemand nachsehen will, wer gekauft hat. */
export function ditixBestellungenLink(eventId: string | null | undefined): string | null {
  const basis = ditixTerminLink(eventId);
  return basis ? `${basis}/orders` : null;
}
