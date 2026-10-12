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
  /** Der Knopf unter der Nachricht. */
  knopf: { text: string; url: string };
  /** Wofür sie da ist, für die Einstellungsseite. */
  wofuer: string;
}

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

export const PAUSE_VORLAGE: Vorlage = {
  name: "pause_vorbei_foyer",
  sprache: "de",
  kategorie: "UTILITY",
  /*
    Der Grund steht im ersten Satz, nicht die Regel.

    "es muss klarer formuliert sein, zum Beispiel: Nach der Show-Pause
    bleibt bei uns nur ein Mitarbeiter, da es nach der Show keinen
    Verkauf gibt" (Florian, 12.10.2026). Wer versteht, warum, muss sich
    nicht fragen, ob er gerade etwas falsch gemacht hat.
  */
  text:
    "Hallo {{1}}, nach der Show-Pause bleibt bei uns nur noch ein Mitarbeiter im Foyer, "
    + "weil danach kein Verkauf mehr läuft. Heute ist das {{2}}. "
    + "Du bist noch eingestempelt: Wenn du fertig bist, stempel bitte aus. "
    + "Bleibst du länger, schreib unten kurz, warum, dann können wir die Zeit genehmigen. "
    + "Danke dir und schönen Feierabend!",
  beispiel: ["Veronica", "Olena"],
  fusszeile: "Florian Zimmer Theater, Eventmanager",
  /*
    Der Knopf führt dorthin, wo beides zusammenkommt: ausstempeln und
    den Grund eintragen. Eine Antwort per WhatsApp geht trotzdem, sie
    landet im Posteingang (Florian, 12.10.2026).
  */
  knopf: { text: "Stempeluhr öffnen", url: `${APP}/stempeluhr` },
  wofuer: "Nach der Pause: Hinweis an die Foyer-Aushilfe, die noch eingestempelt ist.",
};

export const VORLAGEN: Vorlage[] = [PAUSE_VORLAGE];
