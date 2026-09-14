/**
 * Woran eine Unterhaltung im Posteingang erkannt wird.
 *
 * Meistens an der Telefonnummer des WhatsApp-Kunden, nur Ziffern:
 * 4917612345678.
 *
 * Seit 2026 können WhatsApp-Nutzer einen Benutzernamen anlegen und ihre
 * Nummer verbergen. Dann liefert Meta keine Nummer mehr, sondern eine
 * Kennung, die nur für unser Unternehmen gilt ("business-scoped user ID"):
 * Ländercode, Punkt, Buchstaben und Ziffern, etwa "DE.13491208655302741918".
 * An diese Kennung lässt sich auch antworten.
 *
 * Vorher prüfte der Eventmanager nur auf Ziffern. Eine Nachricht von
 * jemandem mit verborgener Nummer wäre stillschweigend verworfen worden,
 * aufgefallen am 14.09.2026 beim Test mit dem Beispiel von Meta.
 *
 * Dazu kommen Anfragen aus dem Kontaktformular im Shop: "web-" und eine
 * Zufallskennung. Die haben mit WhatsApp nichts zu tun, siehe
 * migrations/032_kontakt_webseite.sql.
 */

const NUMMER = /^\d{6,20}$/;
const NUTZERKENNUNG = /^[A-Z]{2}\.[A-Za-z0-9]{1,128}$/;
const WEBSEITE = /^web-[a-f0-9]{24}$/;

export function istNummer(kennung: string): boolean {
  return NUMMER.test(kennung);
}

/** Eine Anfrage aus dem Kontaktformular, nicht WhatsApp. */
export function istWebseite(kennung: string): boolean {
  return WEBSEITE.test(kennung);
}

export function istKennung(kennung: string | null | undefined): kennung is string {
  return Boolean(
    kennung && (NUMMER.test(kennung) || NUTZERKENNUNG.test(kennung) || WEBSEITE.test(kennung)),
  );
}

/** Für Anzeige und Mail: "+49176…" bei einer Nummer, sonst ein Hinweis. */
export function kennungLesbar(kennung: string): string {
  if (istNummer(kennung)) return `+${kennung}`;
  if (istWebseite(kennung)) return "Kontaktformular";
  return "Nummer verborgen";
}
