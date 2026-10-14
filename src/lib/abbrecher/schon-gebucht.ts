/**
 * Erkennt, wenn ein Gast schreibt, dass er die Karten schon hat.
 *
 * "wenn wir wissen, dass sie es geschafft haben die Tickets zu kaufen,
 * sollte keine Mail kommen wegen dem Abbruch, also kein Angebot nach
 * drei Tagen mit Geschenk. Sie sind ja bereits bei uns" (Florian,
 * 14.10.2026).
 *
 * Der Abgleich über die Mailadresse greift hier nicht: Der Fall, der
 * den Anstoß gab, lautete "Hatte kein passendes Zahlsystem, meine
 * Tochter hat es für mich erledigt". Gebucht hat also jemand anderes,
 * unter einer anderen Adresse. Erkannt wird es deshalb an dem, was der
 * Gast schreibt.
 *
 * Im Zweifel lieber kein Treffer: Eine ausbleibende Geschenk-Mail bei
 * jemandem, der doch nicht gebucht hat, kostet uns einen Gast. Deshalb
 * braucht es eine Formulierung, die wirklich nach "ist erledigt"
 * klingt, und nicht bloß das Wort "gebucht".
 */

/** Sagt dieser Text, dass die Karten schon da sind? */
export function klingtNachGebucht(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return false;

  // Verneinungen zuerst: "konnte nicht buchen", "hat nicht geklappt".
  if (/(nicht|kein|leider nicht|klappte? nicht|ging nicht)\s+(gebucht|buchen|geklappt|bestellt)/.test(t)) {
    return false;
  }
  if (/(hat|hats|hat es)\s+nicht\s+geklappt/.test(t)) return false;

  const muster: RegExp[] = [
    /(schon|bereits|inzwischen|mittlerweile|zwischenzeitlich)\s+(gebucht|bestellt|gekauft|reserviert)/,
    /(karten|tickets|plätze|platze)\s+(sind|haben wir|habe ich|hab ich)\s+(schon|bereits)?\s*(da|gekauft|gebucht|bestellt)/,
    /(hat|haben)\s+(es|das)\s+(für mich|für uns)?\s*(erledigt|übernommen|gemacht|gebucht)/,
    /(tochter|sohn|mann|frau|partner|kollege|kollegin|chef|sekretariat|freundin|freund)\s+\w*\s*(hat|hats|hat es)/,
    /(telefonisch|am telefon|über die hotline|direkt bei euch|an der kasse|vor ort)\s+(gebucht|gekauft|bestellt)/,
    /(habe|hab|haben)\s+(die|unsere|meine)?\s*(karten|tickets)\s+(schon|bereits)?/,
    /(buchung|bestellung)\s+(ist|hat)\s+(durch|geklappt|funktioniert)/,
    /(alles|hat alles)\s+geklappt/,
    /(sind|wir sind)\s+(dabei|gebucht)/,
  ];
  return muster.some((m) => m.test(t));
}

/** Was im Posteingang dazu stehen soll, damit es niemand doppelt macht. */
export const KEIN_GESCHENK_HINWEIS =
  "Hinweis: Dieser Gast hat die Karten offenbar schon. Es geht deshalb keine Abbrecher-Mail und "
  + "kein Geschenk mehr hinaus. Die normale Vorfreude-Mail vor der Show läuft weiter. "
  + "Stimmt das nicht, einfach in den Abbrüchen die Stufe wieder ändern.";
