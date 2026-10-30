/**
 * Was auf einer Postkarte verdeckt wird, bevor sie auf die Wand kommt.
 *
 * "da es eine postkarte ist, reicht es völlig aus nur die anschrift zu
 * schwärzen. dies wurde bestätigt vom anwalt" (Florian, 30.10.2026).
 *
 * Das Modell findet mehr: den Namen im Gruß, die Unterschrift, manchmal
 * ein Wort, das ihm persönlich vorkommt. Alles davon zu verdecken war
 * übervorsichtig und hat die Karten unlesbar gemacht; auf dem Beispiel
 * vom 30.10. lagen sechs Balken auf einer Karte mit vier Zeilen Text.
 *
 * Vorgeschlagen wird deshalb nur noch, was eine Postanschrift oder ein
 * Kontaktweg ist. Die übrigen Fundstellen verschwinden nicht, sie sind
 * nur nicht mehr vorausgewählt: Wer eine davon doch verdecken will,
 * nimmt sie mit einem Klick dazu.
 */

export interface Fundstelle {
  art: string;
  text: string;
  x: number;
  y: number;
  b: number;
  h: number;
}

/** Anschrift und Kontaktwege. */
const VERDECKEN = new Set(["adresse", "telefon", "email"]);

/**
 * Wie weit ein Name von der Adresse entfernt stehen darf und trotzdem
 * dazugehört, in Prozentpunkten der Bildhöhe.
 *
 * Eine Anschrift ist ein Block aus drei, vier Zeilen. Das Modell
 * meldet "Herrn Leonard Fasih" als Namen und die Zeilen darunter als
 * Adresse, also zwei Fundstellen für dieselbe Sache.
 *
 * Nach oben ein kleiner Zuschlag für die Anrede, nach unten keiner:
 * Direkt unter der Anschrift beginnt der Gruß, und der bleibt stehen.
 * Auf der Karte vom 30.10. liegt die Adresse zwischen 0 und 45, "Herrn"
 * bei 36 und "Hallo Leonard!" bei 55. Genau dazwischen muss der Schnitt
 * liegen.
 */
const ZUSCHLAG_OBEN = 8;

function art(f: Fundstelle): string {
  return String(f.art).toLowerCase();
}

/**
 * Gehört diese Fundstelle zur Anschrift?
 *
 * "da es eine postkarte ist, reicht es völlig aus nur die anschrift zu
 * schwärzen" (Florian, 30.10.2026). Die Anschrift besteht aber aus
 * Empfängername UND Adresse: Auf der ersten freigegebenen Karte stand
 * "Herrn Leonard Fasih" oben lesbar, nur Straße und Ort waren verdeckt
 * (gefunden am 30.10.2026, nachdem die Karte schon öffentlich war).
 *
 * Ein Name zählt deshalb dazu, wenn er im selben Höhenbereich steht wie
 * eine gefundene Adresse. Der Vorname im Gruß ("Hallo Leonard!") steht
 * weiter unten im Text und bleibt stehen, so wie Florian es will.
 */
export function istAnschrift(f: Fundstelle, alle: Fundstelle[] = []): boolean {
  if (VERDECKEN.has(art(f))) return true;
  if (art(f) !== "name") return false;

  const adressen = alle.filter((x) => art(x) === "adresse");
  const mitte = f.y + f.h / 2;
  return adressen.some((a) => mitte >= a.y - ZUSCHLAG_OBEN && mitte <= a.y + a.h);
}

/** Die Balken, die von sich aus gesetzt sind. */
export function standardSchwaerzung<T extends Fundstelle>(fundstellen: T[]): T[] {
  return fundstellen.filter((f) => istAnschrift(f, fundstellen));
}

/** Was die KI sonst noch gefunden hat, zum Dazunehmen. */
export function weitereFundstellen<T extends Fundstelle>(fundstellen: T[]): T[] {
  return fundstellen.filter((f) => !istAnschrift(f, fundstellen));
}
