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

/** Anschrift und Kontaktwege. Name und Unterschrift gehören nicht dazu. */
const VERDECKEN = new Set(["adresse", "telefon", "email"]);

export function istAnschrift(f: Fundstelle): boolean {
  return VERDECKEN.has(String(f.art).toLowerCase());
}

/** Die Balken, die von sich aus gesetzt sind. */
export function standardSchwaerzung<T extends Fundstelle>(fundstellen: T[]): T[] {
  return fundstellen.filter(istAnschrift);
}

/** Was die KI sonst noch gefunden hat, zum Dazunehmen. */
export function weitereFundstellen<T extends Fundstelle>(fundstellen: T[]): T[] {
  return fundstellen.filter((f) => !istAnschrift(f));
}
