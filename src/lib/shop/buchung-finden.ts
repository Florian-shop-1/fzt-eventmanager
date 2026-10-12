/**
 * Die Buchung eines Gastes finden, auch wenn sie nicht aus dem Shop kam.
 *
 * Der Eventmanager kennt eine Buchung nur, wenn sie über die neue Kasse
 * im Shop lief: Dann meldet der Shop sie an /api/shop/buchung, und an
 * dieser Zeile hängt der persönliche Link zum Dazubuchen.
 *
 * Ältere Karten, Telefonverkäufe und alles, was direkt in Ditix
 * entstanden ist, fehlen dort. Marion hatte zwei Karten für den
 * 21.11.2026, stand in Ditix, aber nicht in unserer Tabelle, und bekam
 * deshalb keinen Link, obwohl sie genau danach gefragt hatte (Florian,
 * 11.10.2026).
 *
 * Deshalb hier der zweite Weg: In den Ditix-Bestellungen nach dem Namen
 * suchen, und wenn genau eine passt, dafür eine Zeile anlegen. Ab dann
 * hat der Gast seinen Link, und die Vorfreude-Mail erreicht ihn auch.
 *
 * Bewusst nur bei eindeutigem Treffer. Zwei Roswitha Hülser an einem
 * Abend sind kein Fall für Automatik, da soll jemand hinsehen.
 */

import { holeShopGruppen, type ShopGruppe } from "@/lib/shop/rohdaten";
import { kommendeTermine } from "@/lib/ditix/spielplan";
import {
  naechsteBuchungZu,
  speichereBuchung,
  type BuchungsPosten,
  type ShopBuchung,
} from "@/lib/db/shop-buchungen";
import { db } from "@/lib/db/client";

/** Aus "marion.tomescheit@gmx.de" wird ["marion", "tomescheit"]. */
function teileAusAdresse(email: string): string[] {
  return email
    .split("@")[0]
    .toLowerCase()
    .split(/[._\-+0-9]+/)
    .filter((t) => t.length >= 3);
}

function teileAusName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}]/gu, ""))
    .filter((t) => t.length >= 3);
}

/**
 * Passt diese Bestellung zu dem, was wir vom Gast wissen?
 *
 * Verlangt wird ein Treffer im Nachnamen oder zwei Treffer insgesamt:
 * Ein einzelner Vorname wie "Peter" trifft an einem vollen Abend sonst
 * drei Bestellungen.
 */
function passt(bestellung: ShopGruppe, gesucht: string[]): boolean {
  if (gesucht.length === 0 || !bestellung.name) return false;
  const teile = teileAusName(bestellung.name);
  if (teile.length === 0) return false;

  const treffer = teile.filter((t) => gesucht.includes(t));
  if (treffer.length >= 2) return true;
  // Der Nachname allein reicht, er ist der seltenere Teil.
  const nachname = teile[teile.length - 1];
  return treffer.includes(nachname);
}

export interface Gefunden {
  buchung: ShopBuchung;
  /** true, wenn die Zeile gerade erst aus Ditix angelegt wurde. */
  ausDitix: boolean;
}

/**
 * Die nächste Buchung zu einer Mailadresse, notfalls über Ditix.
 *
 * Erst der direkte Weg über die Adresse. Findet sich nichts, wird in den
 * Bestellungen der kommenden Termine nach dem Namen gesucht.
 */
export async function buchungZuGast(o: {
  email: string;
  /** Name aus der Nachricht, falls vorhanden. */
  name?: string | null;
}): Promise<Gefunden | null> {
  const email = o.email.trim().toLowerCase();
  if (!email.includes("@")) return null;

  const direkt = await naechsteBuchungZu(email).catch(() => null);
  if (direkt) return { buchung: direkt, ausDitix: false };

  const gesucht = [...new Set([...teileAusAdresse(email), ...teileAusName(o.name ?? "")])];
  if (gesucht.length === 0) return null;

  const termine = await kommendeTermine().catch(() => []);
  const zuEvent = new Map(termine.map((t) => [t.ditixEventId, t]));
  const bestellungen = (await holeShopGruppen().catch(() => [])).filter(
    (g) => zuEvent.has(g.ditixEventId) && passt(g, gesucht),
  );

  // Nur bei genau einer Bestellung. Alles andere gehoert angesehen.
  if (bestellungen.length !== 1) return null;
  const b = bestellungen[0];
  const termin = zuEvent.get(b.ditixEventId)!;

  const posten: BuchungsPosten[] = [];
  if (b.tickets > 0) {
    posten.push({ ticketTypeId: "", name: "Showticket", anzahl: b.tickets, preisCent: 0, gruppe: "sitzplatz" });
  }
  for (const [variante, anzahl] of Object.entries(b.menues)) {
    if (anzahl && anzahl > 0) {
      posten.push({ ticketTypeId: "", name: String(variante), anzahl, preisCent: 0, gruppe: "menue" });
    }
  }

  await speichereBuchung({
    // Dieselbe Bestellung ergibt immer dieselbe Zeile, auch beim zweiten Mal.
    cartId: `ditix:${b.orderId}`,
    ditixEventId: b.ditixEventId,
    datum: termin.datum,
    uhrzeit: termin.uhrzeit,
    show: termin.name,
    name: b.name,
    email,
    plaetze: b.tickets || null,
    hinweis: "Aus einer Ditix-Bestellung übernommen, damit der Gast seinen Link bekommt.",
    posten,
  });

  /*
    Bestaetigt, denn die Bestellung steht in Ditix.

    Ohne dieses Haekchen gilt die Zeile als abgebrochener Warenkorb:
    Marion haette eine Mail bekommen mit der Frage, warum sie nicht
    gebucht hat, obwohl sie zwei Karten in der Hand haelt. Dieselbe
    Spalte entscheidet darueber, ob die Vorfreude-Mail rausgeht, und die
    soll sie bekommen.
  */
  await db()`
    update shop_buchung set bestaetigt = true where cart_id = ${`ditix:${b.orderId}`}
  `.catch(() => undefined);

  const neu = await naechsteBuchungZu(email).catch(() => null);
  return neu ? { buchung: neu, ausDitix: true } : null;
}
