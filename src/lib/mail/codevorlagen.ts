/**
 * Textvorlagen für den Codeversand.
 *
 * Ein Code ist nicht gleich ein Code: Beim Schlemmerblock hat der Gast
 * schon bezahlt und weiss nur nicht, wie er zu seiner Freikarte kommt.
 * Ein Hotel gibt die Codes weiter und braucht andere Worte als der Gast
 * selbst. Und manchmal ist es einfach ein Geschenk.
 *
 * Deshalb steht hier je Anlass ein fertiger Text. Wer verschickt, wählt
 * ihn aus und kann ihn vorher noch ändern; geschickt wird immer das, was
 * im Feld steht.
 *
 * Der Aufbau der Mail:
 *
 *   Einleitung
 *   die Codes, je Vorrat mit seinem Einlösehinweis
 *   Schluss
 *
 * Reiner Text, keine Formatierung. Das kommt in jedem Mailprogramm an,
 * landet seltener im Spam und sieht auf dem Handy nicht kaputt aus.
 */

export interface Codevorlage {
  schluessel: string;
  /** Steht in der Auswahlliste. */
  name: string;
  /** Wofür der Text gedacht ist, eine Zeile unter der Auswahl. */
  wofuer: string;
  betreff: string;
  einleitung: string;
  schluss: string;
}

const NL = String.fromCharCode(10);
const z = (...zeilen: string[]) => zeilen.join(NL);

/** Steht am Ende jeder Vorlage, damit die Unterschrift nicht dreimal dasteht. */
const GRUSS = z("", "Wir freuen uns auf dich.", "Dein Team vom Florian Zimmer Theater");

export const CODEVORLAGEN: Codevorlage[] = [
  {
    schluessel: "freiticket",
    name: "Freiticket, neutral",
    wofuer: "Wenn es einfach ein Geschenk ist: Beschwerde, Presse, Gewinnspiel.",
    betreff: "Dein Freiticket fürs Florian Zimmer Theater",
    einleitung: z(
      "Hallo,",
      "",
      "wir haben ein Geschenk für dich: eine Freikarte für eine Vorstellung",
      "deiner Wahl. Hier ist dein Code:",
    ),
    schluss: z(
      "Die Termine stehen auf shop.florianzimmertheater.de.",
      GRUSS,
    ),
  },
  {
    schluessel: "schlemmerblock",
    name: "Schlemmerblock",
    wofuer: "Zwei Karten, eine davon gratis. Bietet das zweite Menü per Antwortmail an.",
    betreff: "Deine Freikarte zum Schlemmerblock",
    einleitung: z(
      "Hallo,",
      "",
      "schön, dass du deinen Schlemmerblock bei uns einlöst. Du kaufst ein",
      "Ticket, das zweite geht auf uns. Hier ist dein Code:",
    ),
    schluss: z(
      "Noch eine Sache, damit ihr beide etwas zu essen habt:",
      "",
      "Im Shop lässt sich pro Ticket nur ein Menü dazubuchen. Zur Freikarte",
      "kannst du dort also keines auswählen. Wenn ihr zu zweit essen möchtet,",
      "antworte einfach auf diese Mail und schreib uns, welches Menü es sein",
      "soll. Wir buchen es von Hand dazu und melden uns bei dir.",
      "",
      "Ein Blick in die Karte lohnt sich, unsere Küche ist mehr als ein",
      "Beiwerk zur Show.",
      GRUSS,
    ),
  },
  {
    schluessel: "partner",
    name: "Partner und Hotels",
    wofuer: "Für den Ansprechpartner, der die Codes an seine Gäste weitergibt.",
    betreff: "Ihre Codes fürs Florian Zimmer Theater",
    einleitung: z(
      "Guten Tag,",
      "",
      "wie besprochen hier Ihre Codes für Ihre Gäste:",
    ),
    schluss: z(
      "Die Termine stehen auf shop.florianzimmertheater.de.",
      "",
      "Wenn Sie mehr Codes brauchen oder etwas nicht funktioniert, schreiben",
      "Sie uns einfach zurück. Wir kümmern uns darum.",
      "",
      "Herzliche Grüße",
      "Ihr Team vom Florian Zimmer Theater",
    ),
  },
];

export const CODEVORLAGE_STANDARD = CODEVORLAGEN[0];
