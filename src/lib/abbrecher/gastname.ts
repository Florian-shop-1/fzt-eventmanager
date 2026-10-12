/**
 * Der Name zum Geschenk.
 *
 * "warum steht da nicht der gast-name?" (Florian, 12.10.2026). Weil wir
 * ihn nicht haben: Die Geschenke entstehen aus liegen gelassenen
 * Warenkörben, und dort gibt der Gast nur seine Mailadresse an. Bei 265
 * von 267 Geschenken steht deshalb kein Name in der Datenbank.
 *
 * Den Namen kennt nur Ditix, an der späteren Bestellung. Deshalb hier
 * derselbe Weg wie beim Dazubuchen (lib/shop/buchung-finden): Aus der
 * Adresse die Namensteile ziehen und sie mit den Bestellungen des
 * Abends vergleichen.
 *
 * Nur bei genau einem Treffer. Ein falscher Name an der Bar ist
 * schlimmer als gar keiner: Dann sucht jemand nach einem Gast, den es
 * an dem Abend nicht gibt.
 */

import { holeShopGruppen, type ShopGruppe } from "@/lib/shop/rohdaten";
import { passt, teileAusAdresse } from "@/lib/shop/buchung-finden";
import type { Geschenk } from "./geschenk";

/** Für jedes Geschenk ohne Namen: id → gefundener Name. */
export async function namenZuGeschenken(liste: Geschenk[]): Promise<Map<string, string>> {
  const gefunden = new Map<string, string>();
  const offen = liste.filter((g) => !g.name.trim() && g.gebuchtEventId && g.email.includes("@"));
  if (offen.length === 0) return gefunden;

  const bestellungen = await holeShopGruppen().catch(() => []);
  if (bestellungen.length === 0) return gefunden;

  // Die Bestellungen einmal nach Vorstellung sortieren, statt für jedes
  // Geschenk durch die ganze Verkaufsliste zu laufen.
  const jeEvent = new Map<string, ShopGruppe[]>();
  for (const b of bestellungen) {
    const vorhanden = jeEvent.get(b.ditixEventId);
    if (vorhanden) vorhanden.push(b);
    else jeEvent.set(b.ditixEventId, [b]);
  }

  for (const g of offen) {
    const gesucht = teileAusAdresse(g.email);
    if (gesucht.length === 0) continue;
    const treffer = (jeEvent.get(g.gebuchtEventId!) ?? []).filter((b) => passt(b, gesucht));
    if (treffer.length === 1 && treffer[0].name.trim()) gefunden.set(g.id, treffer[0].name.trim());
  }
  return gefunden;
}
