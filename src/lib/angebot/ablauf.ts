/**
 * Der Ablauf eines Eventabends, als Daten statt als Fließtext.
 *
 * Bisher stand der Ablauf als Text in der Einleitung des Angebots. Damit
 * ließ er sich zwar anzeigen, aber nicht gestalten: keine Bilder, keine
 * Zeitachse, keine Hervorhebungen. Als Daten kann die Angebotsseite daraus
 * bauen, was sie will, und der Text bleibt an einer Stelle pflegbar.
 *
 * Die Bilder liegen unter public/bilder und sind die vorhandenen Fotos
 * von der Website. Sie lassen sich austauschen, indem eine gleichnamige
 * Datei in den Ordner gelegt wird. Fehlt eines, bleibt die Stelle leer
 * und der Abschnitt steht trotzdem.
 */

export interface Station {
  zeit: string;
  titel: string;
  text: string;
  /** Dateiname unter /bilder, ohne Pfad. */
  bild: string;
}

export const ABLAUF: Station[] = [
  {
    zeit: "17:20",
    titel: "Empfang auf der Eventgalerie",
    text:
      "Eure Gäste kommen an und bekommen ein Glas Magicuvée in die Hand. Zeit zum Ankommen, " +
      "zum Reden, zum Umschauen. Der Abend beginnt ohne Hektik.",
    bild: "magic-dinner-neu2.webp",
  },
  {
    zeit: "17:50",
    titel: "Vier Gänge aus der Magicuisine",
    text:
      "Serviert wird an eurem Tisch, Gang für Gang. Classic, Sea oder Veggy, jeder Gast " +
      "wählt für sich. Allergien und Unverträglichkeiten berücksichtigt unsere Küche " +
      "selbstverständlich, sagt uns einfach vorher Bescheid.",
    bild: "classic.webp",
  },
  {
    zeit: "20:00",
    titel: "Die Show",
    text:
      "Das Licht geht aus, und für zwei Stunden ist eure Gruppe mittendrin. Große Illusionen " +
      "und Momente so nah, dass niemand mehr erklären kann, was er gerade gesehen hat.",
    // Trotz des Dateinamens zeigt loge.jpg die Bühne mit Publikum,
    // nicht eine Loge. Hier ist sie genau richtig.
    bild: "loge.jpg",
  },
  {
    zeit: "22:30",
    titel: "Ausklang an der Magic Bar",
    text:
      "Danach bleibt Zeit. Erfahrungsgemäß der Teil des Abends, an dem am meisten geredet " +
      "wird, und der, an den sich eure Gäste am längsten erinnern.",
    // Das Foto von der Bar, von Florian selbst (28.10.2026).
    bild: "magic-bar.jpg",
  },
];

/**
 * Ältere Angebote haben den Ablauf noch als Text in der Einleitung.
 * Damit er nicht doppelt erscheint, wird er beim Anzeigen abgeschnitten.
 */
export function einleitungOhneAblauf(text: string): string {
  const schnitt = text.search(/^\s*\d{1,2}:\d{2}\s*UHR\s*$/im);
  return (schnitt > 0 ? text.slice(0, schnitt) : text).trim();
}
