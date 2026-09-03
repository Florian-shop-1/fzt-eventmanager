/**
 * Namen aus dem Webshop aufrichten.
 *
 * Im Shop tippen Gäste ihren Namen selbst ein, und viele schreiben klein:
 * "monika reichert". Auf einem Reservierungsschild an einem Parkplatz oder
 * auf der Einlassliste sieht das nach Nachlässigkeit von uns aus, nicht
 * nach Eile beim Gast.
 *
 * Zwei Regeln, damit nichts verschlimmbessert wird:
 *
 *  - Ein Wort, das schon irgendwo einen Großbuchstaben hat, bleibt
 *    unangetastet. "McDonald", "diCaprio" und "LMU" behalten ihre Form.
 *  - Namenszusätze wie "von" oder "de" bleiben klein, außer sie stehen
 *    am Anfang. Aus "anna von sachsen" wird "Anna von Sachsen".
 *
 * Vollständig großgeschriebene Namen ("MONIKA REICHERT") werden bewusst
 * nicht angefasst: Vielleicht heißt die Firma wirklich so.
 */

/** Zusätze, die mitten im Namen klein bleiben. */
const ZUSAETZE = new Set([
  "von", "vom", "van", "de", "del", "della", "der", "den", "di", "do", "dos",
  "du", "la", "le", "zu", "zur", "zum", "af", "av", "ten", "ter", "auf",
]);

/** Ein einzelnes Wort aufrichten, auch über Bindestriche hinweg. */
function wortAufrichten(wort: string): string {
  return wort
    .split("-")
    .map((teil) => (teil ? teil[0].toUpperCase() + teil.slice(1) : teil))
    .join("-");
}

export function nameOrdentlich(name: string): string {
  const sauber = name.replace(/\s+/g, " ").trim();
  if (!sauber) return sauber;

  return sauber
    .split(" ")
    .map((wort, i) => {
      // Schon irgendwo groß: der Gast hat sich etwas dabei gedacht.
      if (wort !== wort.toLowerCase()) return wort;
      if (i > 0 && ZUSAETZE.has(wort)) return wort;
      return wortAufrichten(wort);
    })
    .join(" ");
}
