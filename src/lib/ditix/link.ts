/**
 * Links in die Ditix-Verwaltung (ditix.app).
 *
 * Jeder Veranstalter hat dort eine eigene Kennung in der Adresse. Die des
 * Florian Zimmer Theaters steht als Standard hier, über DITIX_MANDANT_ID ist
 * sie austauschbar.
 *
 * Wichtig, sonst gibt es 404: Ein Termin hat in Ditix keine eigene Seite unter
 * .../events/<id>, sondern nur Unterseiten. Die Adressen stammen aus dem
 * Routenverzeichnis der Ditix-Anwendung (21.09.2026):
 *
 *   .../events/<id>/tickets     Ticketarten, Preise, Verkaufszeiten
 *   .../events/<id>/dashboard   Übersicht mit Verkaufszahlen
 *   .../events/<id>/edit        Termin bearbeiten
 *
 * Die Termin-Nummer aus der Shop-API ist dieselbe wie in der Verwaltung, der
 * Shop liest ja Ditix.
 */

const MANDANT = "383a331e-afaa-49cd-8203-d4955d2bffc6";

export function ditixMandant(): string {
  return process.env.DITIX_MANDANT_ID ?? MANDANT;
}

function termin(eventId: string | null | undefined): string | null {
  if (!eventId) return null;
  return `https://ditix.app/app/${ditixMandant()}/events/${encodeURIComponent(eventId)}`;
}

/**
 * Die Seite "Verkauf": Verkaufszeitraum und Kontingent. Dort wird ein falsch
 * hinterlegtes Verkaufsende korrigiert, also der häufigste Grund für eine
 * Warteliste, die keine sein dürfte.
 */
export function ditixVerkaufLink(eventId: string | null | undefined): string | null {
  const basis = termin(eventId);
  return basis ? `${basis}/sale` : null;
}

/** Ticketarten und Preise des Termins, etwa wenn auf einer Kategorie kein Preis steht. */
export function ditixTicketsLink(eventId: string | null | undefined): string | null {
  const basis = termin(eventId);
  return basis ? `${basis}/tickets` : null;
}

/** Übersicht zum Termin, mit Verkaufszahlen. */
export function ditixTerminLink(eventId: string | null | undefined): string | null {
  const basis = termin(eventId);
  return basis ? `${basis}/dashboard` : null;
}

/** Die Bestellungen zum Termin. */
export function ditixBestellungenLink(eventId: string | null | undefined): string | null {
  const basis = termin(eventId);
  return basis ? `${basis}/orders` : null;
}
