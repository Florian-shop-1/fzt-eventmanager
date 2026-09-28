/**
 * Die Rangfolge der Ticketkategorien, für die Entschädigung bei einer
 * Show-Absage: eine Stufe besser, oder ein Souvenirglas, wenn schon die
 * beste Kategorie gebucht war. Siehe src/lib/domain/artikel.ts für die
 * Preise, aus denen sich diese Reihenfolge ergibt.
 */

const LEITER = [
  { muster: /kat\.?\s?3\b/i, anzeige: "Kat. 3" },
  { muster: /kat\.?\s?2\b/i, anzeige: "Kat. 2" },
  { muster: /kat\.?\s?1\b/i, anzeige: "Kat. 1" },
  { muster: /golden\s?seats/i, anzeige: "Golden Seats" },
] as const;

function index(kategorieName: string): number {
  return LEITER.findIndex((l) => l.muster.test(kategorieName));
}

/**
 * Die nächstbessere Kategorie, oder null, wenn die Kategorie schon die
 * beste ist oder sich nicht erkennen lässt (dann sicherheitshalber wie
 * "schon beste Kategorie" behandeln, das Büro prüft den Entwurf ohnehin).
 */
export function naechstbessereKategorie(kategorieName: string): string | null {
  const i = index(kategorieName);
  if (i === -1 || i === LEITER.length - 1) return null;
  return LEITER[i + 1].anzeige;
}
