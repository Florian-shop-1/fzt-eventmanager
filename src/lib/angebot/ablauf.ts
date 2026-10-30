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
      "Ihre Gäste kommen an und bekommen ein Glas Magicuvée in die Hand. Zeit zum Ankommen, " +
      "zum Reden, zum Umschauen. Der Abend beginnt ohne Hektik.",
    bild: "magic-dinner-neu2.webp",
  },
  {
    zeit: "17:50",
    titel: "Vier Gänge aus der Magicuisine",
    text:
      "Serviert wird an Ihrem Tisch, Gang für Gang. Classic, Sea oder Veggy, jeder Gast " +
      "wählt für sich. Allergien und Unverträglichkeiten berücksichtigt unsere Küche " +
      "selbstverständlich, sagen Sie uns einfach vorher Bescheid.",
    bild: "classic.webp",
  },
  {
    zeit: "20:00",
    titel: "Die Show",
    text:
      "Das Licht geht aus, und für zwei Stunden ist Ihre Gruppe mittendrin. Große Illusionen " +
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
      "wird, und der, an den sich Ihre Gäste am längsten erinnern.",
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


/**
 * Der Ablauf DIESES Angebots, als Stationen mit Bild.
 *
 * "Wenn ich die PDF aufmache, dann ist der Ablaufplan KORREKT. Wenn ich
 * aber das Angebot sehe ... dann ist der Ablaufplan für den Abend
 * vorgegeben. Er bekommt den FALSCHEN Ablaufplan." (Florian,
 * 30.10.2026).
 *
 * Genau so war es: Die Kundenseite hat den echten Ablauf aus der
 * Einleitung abgeschnitten und stattdessen die feste Liste ABLAUF
 * angezeigt, also immer 17:20 Empfang, 17:50 Menü, 20:00 Show, 22:30
 * Ausklang. Bei einer Nachmittagsshow, bei Fingerfood und bei einem
 * Exklusivevent stand beim Kunden damit etwas anderes als im PDF.
 *
 * Jetzt wird gelesen, was im Angebot steht. Die Einleitung hält den
 * Ablauf als Text: je Station eine Zeile "HH:MM UHR" und darunter
 * "Titel. Text". Daraus entstehen dieselben Stationen, die das PDF
 * zeigt, nur mit Bild.
 *
 * ABLAUF bleibt als Rückfall für alte Angebote ohne Zeiten im Text und
 * als Vorlage für die Musterseite.
 */
export function ablaufAusEinleitung(einleitung: string): Station[] {
  const zeilen = String(einleitung ?? "").split(ZEILENENDE);
  const stationen: Station[] = [];
  let zeit: string | null = null;
  let gesammelt: string[] = [];

  const ablegen = () => {
    const ganz = gesammelt.join(" ").trim();
    gesammelt = [];
    if (!zeit || !ganz) return;
    /*
      "Titel. Text": Der erste Punkt mit Leerzeichen trennt beides.
      Steht keiner da, ist alles Titel und der Text bleibt leer.
    */
    const punkt = ganz.indexOf(". ");
    const titel = punkt > 0 ? ganz.slice(0, punkt) : ganz;
    const text = punkt > 0 ? ganz.slice(punkt + 2).trim() : "";
    stationen.push({ zeit, titel, text, bild: bildZu(titel) });
  };

  for (const zeile of zeilen) {
    const treffer = NUR_UHRZEIT.exec(zeile);
    if (treffer) {
      ablegen();
      zeit = treffer[1].replace(".", ":");
    } else if (zeit) {
      gesammelt.push(zeile.trim());
    }
  }
  ablegen();

  return stationen.length > 0 ? stationen : ABLAUF;
}

/** Eine Zeile, die nur aus einer Uhrzeit besteht, mit oder ohne "UHR". */
const NUR_UHRZEIT = /^\s*(\d{1,2}[:.]\d{2})\s*(?:uhr)?\s*$/i;

/** Zeilenumbruch, mit und ohne Wagenrücklauf. */
const ZEILENENDE = /\r?\n/;

/**
 * Welches Foto zu einer Station passt.
 *
 * Am Titel erkannt, weil der aus unseren eigenen Bausteinen kommt und
 * nicht frei getippt wird. Kennt die Liste einen Titel nicht, steht das
 * Haus selbst im Bild: damit liegt man nie falsch.
 */
function bildZu(titel: string): string {
  const t = titel.toLowerCase();
  if (/einlass|türen|tueren/.test(t)) return "magic-bar.jpg";
  if (/empfang|magicuvée|magicuvee/.test(t)) return "magic-dinner-neu2.webp";
  if (/fingerfood/.test(t)) return "salat.webp";
  if (/menü|menue|gang|gänge|magicuisine/.test(t)) return "classic.webp";
  if (/show/.test(t)) return "loge.jpg";
  if (/ausklang|bar/.test(t)) return "magic-bar.jpg";
  return "hero-theater.jpg";
}
