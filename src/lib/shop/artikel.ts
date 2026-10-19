/**
 * Woran man einem Artikel ansieht, was er ist.
 *
 * Diese beiden Funktionen entscheiden im ganzen Haus, was als Menü und
 * was als Showticket zählt: im Funktionsheet, auf dem Küchenblatt, im
 * Sitzplan, in der Menüliste.
 *
 * Sie stehen in einer eigenen Datei, seit die Ticketdaten aus FloTix
 * kommen können (Florian, 20.10.2026). Beide Quellen, die alte Tabelle
 * und FloTix, benutzen genau dieselbe Erkennung. Nur so heißt ein
 * Unterschied in den Zahlen wirklich, dass die Daten verschieden sind,
 * und nicht, dass zweimal verschieden erkannt wurde.
 */

import type { MenueVariante } from "@/lib/domain/types";

/**
 * Erkennt Menüs an der Artikelbezeichnung.
 *
 * Die Namen haben sich über die Jahre geändert, deshalb wird nach Mustern
 * gesucht statt nach festen Texten:
 *   "Magic Dinner CLASSIC inkl. Aperitif"          (alt)
 *   "4-Gang-Menü CLASSIC inkl. Welcome-Cocktail"   (danach)
 *   "4-Gang-Menü CLASSIC inkl. Welcome Drink"      (heute)
 */
export function menueVarianteAus(bezeichnung: string): MenueVariante | null {
  const s = bezeichnung.toLowerCase();
  const istMenue = s.includes("gang") || s.includes("magic dinner") || s.includes("menü");
  if (!istMenue) return null;
  // Upgrades und Begleitungen sind keine eigenen Menüs, sie hängen an einem.
  if (s.includes("upgrade") || s.includes("begleitung") || s.includes("arrangement")) return null;
  if (s.includes("kids")) return "kids";
  if (s.includes("sea") || s.includes("fisch")) return "sea";
  if (s.includes("veggy") || s.includes("vegan") || s.includes("vegetar")) return "veggy";
  if (s.includes("classic")) return "classic";
  return "classic";
}

/**
 * Erkennt Showtickets an der Artikelbezeichnung.
 *
 * Die Namen wechseln über die Jahre, deshalb nach Mustern statt nach
 * festen Texten. Wichtig ist die Vollständigkeit: Was hier durchrutscht,
 * gilt als Zusatzleistung und taucht in Listen auf, in die es nicht
 * gehört. "Schnupper Magic", "Kinderticket" und "Ticket ab 10 Jahre"
 * fielen genau so durch das alte Muster.
 */
export function istTicket(bezeichnung: string): boolean {
  const s = bezeichnung.toLowerCase();
  return (
    /\bkat\.?\s?\d/.test(s) ||
    s.includes("golden seat") ||
    s.includes("vip empore") ||
    s.includes("rollstuhl") ||
    s.includes("ticket") ||
    s.includes("schnupper") ||
    s.includes("show)")
  );
}
