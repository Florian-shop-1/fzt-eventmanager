/**
 * Die Stellen im Haus und was in ihrem Vertrag steht.
 *
 * Florian hat die Formulierungen vorgegeben (01.10.2026). Sie stehen
 * hier und nicht im Kopf dessen, der den Vertrag anlegt: Zwei Verträge
 * für dieselbe Stelle sollen dieselbe Tätigkeit nennen, sonst steht im
 * einen "Showassistenz" und im anderen "Bühnenhilfe", und beim
 * Steuerbüro sieht es aus wie zwei verschiedene Jobs.
 *
 * Ändern lässt sich beides beim Anlegen weiterhin: Vorgabe heisst
 * Vorschlag, nicht Vorschrift.
 */

export interface Stelle {
  /** Was intern in der Liste steht. */
  wert: string;
  /** Die Tätigkeitsbezeichnung im Vertrag. */
  taetigkeit: string;
  /** Die Aufgaben im Vertrag. */
  aufgaben: string;
}

export const STELLEN: Stelle[] = [
  {
    wert: "Show",
    taetigkeit: "Showassistenz",
    aufgaben: "Vorbereitung und Durchführung der Zaubershows.",
  },
  {
    wert: "Foyer",
    taetigkeit: "Servicekraft im Foyer",
    aufgaben: "Vorbereitung des Foyers, Barbetrieb und kleinere administrative Tätigkeiten.",
  },
  {
    wert: "Technik",
    taetigkeit: "Veranstaltungstechnik",
    aufgaben: "Auf- und Abbau, Ton und Licht, Betreuung der Technik während der Vorstellungen.",
  },
  {
    wert: "Büro",
    taetigkeit: "Büromitarbeit",
    aufgaben: "Organisation, Schriftverkehr, Gästebetreuung und allgemeine Büroarbeiten.",
  },
];
