/**
 * Die Einheit einer Position, in der richtigen Zahl.
 *
 * "bei mehrzahl heisst es Stunden" (Florian, 30.10.2026). Stand da
 * "3 Stunde", und das liest ein Kunde, der gerade über ein Angebot
 * nachdenkt.
 *
 * Gepflegt wird nur, was im Artikelstamm wirklich vorkommt: Stück und
 * Stunde. Kommt eine neue Einheit dazu, gehört sie hier hinein; was
 * nicht dasteht, bleibt unverändert, denn eine falsch geratene
 * Mehrzahl ist schlimmer als gar keine.
 */

const MEHRZAHL: Record<string, string> = {
  Stunde: "Stunden",
  Stück: "Stück",
  Person: "Personen",
  Tag: "Tage",
  Flasche: "Flaschen",
  Glas: "Gläser",
};

/** "Stunde" bei 1, "Stunden" bei allem anderen. Auch bei 0 und bei 2,5. */
export function einheitZu(menge: number, einheit: string): string {
  const e = String(einheit ?? "").trim();
  if (!e) return "";
  return menge === 1 ? e : (MEHRZAHL[e] ?? e);
}

/**
 * Menge und Einheit zusammen, so wie es dasteht.
 *
 * "Stück" lassen wir weg: Es sagt nichts, was die Zahl nicht schon
 * sagt, und hinter jedem Menü stünde sonst ein überflüssiges Wort.
 */
export function mengeMitEinheit(menge: number, einheit: string): string {
  const zahl = String(menge).replace(".", ",");
  const e = einheitZu(menge, einheit);
  return e && e !== "Stück" ? `${zahl} ${e}` : zahl;
}
