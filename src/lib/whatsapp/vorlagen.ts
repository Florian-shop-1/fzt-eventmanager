/**
 * Unsere WhatsApp-Vorlagen bei Meta.
 *
 * Eine Nachricht aus dem Nichts, also später als 24 Stunden nach der
 * letzten Nachricht des Empfängers, lässt WhatsApp nur als genehmigte
 * Vorlage durch. Deshalb steht der Text hier fest, und variabel sind
 * nur die Platzhalter.
 *
 * Die erste ist die Nachricht an die Aushilfe, die nach der Pause noch
 * im Foyer eingestempelt ist (Florian, 12.10.2026). Bisher geht dafür
 * eine Mail hinaus, siehe lib/foyer/pause-mail.
 *
 * Kosten: Meta rechnet Vorlagen einzeln ab, in Deutschland rund fünf
 * Cent für eine Utility-Nachricht. Bei zehn bis zwanzig Nachrichten im
 * Monat ist das unter einem Euro.
 */

export interface Vorlage {
  name: string;
  sprache: string;
  kategorie: "UTILITY";
  text: string;
  beispiel: string[];
  fusszeile: string;
  /** Wofür sie da ist, für die Einstellungsseite. */
  wofuer: string;
}

export const PAUSE_VORLAGE: Vorlage = {
  name: "pause_vorbei_foyer",
  sprache: "de",
  kategorie: "UTILITY",
  text:
    "Hallo {{1}}, die Pause ist vorbei. Im Foyer bleibt heute {{2}}. "
    + "Du bist noch eingestempelt. Wenn du länger bleibst, schreib uns bitte kurz, warum, "
    + "dann können wir die Zeit genehmigen. Danke dir und schönen Feierabend!",
  beispiel: ["Veronica", "Olena"],
  fusszeile: "Florian Zimmer Theater, Eventmanager",
  wofuer: "Nach der Pause: Hinweis an die Foyer-Aushilfe, die noch eingestempelt ist.",
};

export const VORLAGEN: Vorlage[] = [PAUSE_VORLAGE];
