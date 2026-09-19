/**
 * Ort aus der Postleitzahl, wenn in der Bestellung keiner steht.
 *
 * Florian, 19.09.2026: In der Versandliste stand bei mehreren Bestellungen
 * "Bayern" oder "Baden-Wrttemberg" als Ort, einmal nur "-". Das kommt aus
 * den Kundendaten in Ditix, nicht aus unserem Formular, und lässt sich dort
 * nicht beheben. Ein Umschlag an "89081 Baden-Württemberg" kommt zwar oft
 * an, sieht aber nach Versehen aus. Deshalb wird der Ort in solchen Fällen
 * aus der Postleitzahl ergänzt.
 *
 * Quelle ist OpenPLZ (openplzapi.org), frei und ohne Schlüssel. Die Antwort
 * wird einen Monat zwischengespeichert, Postleitzahlen ändern sich kaum.
 */

const BUNDESLAENDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
  "Deutschland",
  "Germany",
];

/**
 * Nur Buchstaben a bis z. So passt auch "Baden-Wrttemberg", bei dem das ü
 * unterwegs verloren ging, auf "Baden-Württemberg".
 */
function grob(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

const LAENDER_GROB = new Set(BUNDESLAENDER.map(grob));

/** Steht da kein brauchbarer Ort? Leer, ein Strich oder ein Bundesland. */
export function ortFehlt(ort: string): boolean {
  const g = grob(ort);
  return g.length < 2 || LAENDER_GROB.has(g);
}

/** Orte zu einer deutschen Postleitzahl, oder leer, wenn nichts gefunden wird. */
export async function orteZurPlz(plz: string): Promise<string[]> {
  if (!/^\d{5}$/.test(plz.trim())) return [];
  try {
    const antwort = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz.trim()}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(5000),
    });
    if (!antwort.ok) return [];
    const daten = (await antwort.json()) as Array<{ name?: string }>;
    return [...new Set(daten.map((d) => (d.name ?? "").trim()).filter(Boolean))];
  } catch {
    return [];
  }
}
