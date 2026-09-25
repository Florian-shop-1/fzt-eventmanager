/**
 * Der kleine Nachlass für die, denen es zu teuer war.
 *
 * Sieben Prozent und nicht fünf: Fünf ist die Zahl, die jeder Onlineshop
 * verschickt, sieben liest sich wie gerechnet und nicht wie Gießkanne.
 * Auf einen durchschnittlichen Korb von 273 Euro sind das rund 19 Euro,
 * spürbar genug, um den Abend doch zu buchen, und klein genug, dass es
 * die Karten der anderen Gäste nicht entwertet (Florian, 23.09.2026).
 *
 * WICHTIG, was dieser Code NICHT tut: Er legt in Ditix nichts an. Die
 * öffentliche Shop-Schnittstelle kann nur Wertgutscheine erzeugen, also
 * solche, die bezahlt werden. Einen Prozentcode muss jemand im
 * Ditix-Backend anlegen, und der Name muss zu CODE hier passen. Solange
 * das nicht geschehen ist, bleibt AKTIV auf false, dann steht in der Mail
 * und auf der Seite kein Code, sondern der Weg über das Telefon.
 *
 * Der Code steht in der Umgebungsvariable ABBRECHER_RABATT_CODE, damit
 * er sich wechseln lässt, ohne dass jemand den Quelltext anfasst.
 */

export const RABATT = {
  /** Erst einschalten, wenn der Code in Ditix wirklich existiert. */
  aktiv: process.env.ABBRECHER_RABATT_AKTIV === "ja",
  prozent: 7,
  code: process.env.ABBRECHER_RABATT_CODE ?? "MAGIE7",
  /** So lange gilt er. Kurz genug, dass er nicht durchs Netz wandert. */
  tage: 7,
};

/**
 * Warum wir nicht mehr geben können.
 *
 * Der ehrlichste Satz, den wir haben, und der einzige, der einen
 * Nachlass von sieben Prozent nicht kleinlich wirken lässt.
 */
export const HAUS_TEXT =
  "Wir sind ein privat finanziertes Magietheater. Wir bekommen keine Fördermittel, " +
  "keinen Cent von Stadt oder Land. Was auf der Bühne steht, ist von Eintrittskarten " +
  "bezahlt, von der ersten Schraube bis zum letzten Scheinwerfer. Deshalb können wir " +
  "beim Preis nicht zaubern.";

/** Bis wann der Nachlass gilt, als deutsches Datum. */
export function rabattBis(ab = new Date()): string {
  const d = new Date(ab.getTime() + RABATT.tage * 86400000);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
