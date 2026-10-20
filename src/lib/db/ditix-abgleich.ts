/**
 * Die Buchungen aus der Ditix-Zeit gegen die Verkaufsliste abgleichen.
 *
 * Der Eventmanager schreibt jede Übergabe zur Kasse mit und fragt später
 * beim Shop nach, ob daraus ein Kauf wurde. Für die Körbe aus der
 * Ditix-Zeit gibt es diese Auskunft nicht mehr: Der Shop antwortet seit
 * dem Umschalttag mit 501, und Ditix selbst fragen wir nicht (Florian,
 * 20.10.2026: "der Abgleich gegen Ditix darf nur lesen, in Ditix ändern
 * wir nichts").
 *
 * Es gibt aber einen zweiten Zeugen, der dieselbe Wahrheit kennt: die
 * Verkaufsliste, in die der Shop jede bezahlte Bestellung geschrieben
 * hat. Aus ihr arbeiten Küche und Foyer ohnehin. Steht dort dieselbe
 * Mailadresse zu derselben Vorstellung, dann wurde bezahlt.
 *
 * Zwei Regeln, die Fehler verhindern:
 *
 *  - Verglichen wird Mailadresse UND Vorstellung, nie die Adresse
 *    allein. Wer zwei Abende gebucht hat, hat zwei Körbe, und nur der
 *    bezahlte zählt.
 *  - Je Bestellung wird genau ein Korb bestätigt, der jüngste. Wer
 *    dreimal angesetzt hat, hat drei Körbe und eine Bestellung; der
 *    letzte Anlauf ist der, der durchging. Die früheren bleiben offen,
 *    damit aus einer Buchung nicht drei werden.
 *
 * Geschrieben wird ausschliesslich in unsere eigene Tabelle, und dort
 * nur `bestaetigt`, `access_code` und `zuletzt_geprueft`.
 */

import { db } from "@/lib/db/client";
import { verkaufslisteRoh } from "@/lib/shop/rohdaten";

export interface AbgleichZeile {
  id: string;
  email: string;
  show: string;
  datum: string;
  plaetze: number;
  /** Die Bestellnummer aus der Verkaufsliste. */
  bestellung: string;
}

export interface AbgleichErgebnis {
  /** Offene Körbe, die geprüft wurden. */
  geprueft: number;
  /** Körbe, für die in der Verkaufsliste eine Bestellung steht. */
  gefunden: number;
  /** Tatsächlich bestätigt (je Bestellung nur der jüngste Korb). */
  bestaetigt: number;
  zeilen: AbgleichZeile[];
}

/**
 * Gleicht offene Körbe mit der Verkaufsliste ab.
 *
 * `nurProbe` rechnet alles durch, ohne etwas zu speichern. So lässt sich
 * vorher ansehen, was passieren würde.
 */
export async function ditixAbgleich(
  o: { tage?: number; nurProbe?: boolean } = {},
): Promise<AbgleichErgebnis> {
  const tage = o.tage ?? 60;

  const offen = (await db()`
    select id, lower(email) as email, show, datum::text as datum, plaetze,
           ditix_event_id, eingegangen_am
      from shop_buchung
     where not bestaetigt
       and email <> ''
       and ditix_event_id is not null and ditix_event_id <> ''
       and eingegangen_am >= now() - (${tage} || ' days')::interval
     order by eingegangen_am desc
  `) as Array<Record<string, unknown>>;

  if (offen.length === 0) return { geprueft: 0, gefunden: 0, bestaetigt: 0, zeilen: [] };

  // Die Verkaufsliste, so wie der Shop sie geschrieben hat: mit den
  // Ditix-Kennungen, unter denen auch unsere Körbe stehen.
  const liste = await verkaufslisteRoh();
  const nachSchluessel = new Map<string, string>();
  for (const g of liste) {
    if (!g.email || !g.ditixEventId) continue;
    nachSchluessel.set(`${g.email.toLowerCase()}|${g.ditixEventId}`, g.orderId);
  }

  const zeilen: AbgleichZeile[] = [];
  const schonVergeben = new Set<string>();
  let gefunden = 0;

  for (const r of offen) {
    const schluessel = `${String(r.email)}|${String(r.ditix_event_id)}`;
    const bestellung = nachSchluessel.get(schluessel);
    if (!bestellung) continue;
    gefunden += 1;

    // Je Bestellung nur der jüngste Korb. Die Liste ist absteigend
    // sortiert, der erste Treffer ist also der letzte Anlauf.
    if (schonVergeben.has(schluessel)) continue;
    schonVergeben.add(schluessel);

    zeilen.push({
      id: String(r.id),
      email: String(r.email),
      show: String(r.show ?? ""),
      datum: String(r.datum ?? ""),
      plaetze: Number(r.plaetze ?? 0),
      bestellung,
    });
  }

  if (!o.nurProbe) {
    for (const z of zeilen) {
      await db()`
        update shop_buchung
           set bestaetigt = true, access_code = ${z.bestellung}, zuletzt_geprueft = now()
         where id = ${z.id}::uuid and not bestaetigt
      `.catch((e) => {
        console.warn("[ditix-abgleich] nicht gespeichert:", z.id, e);
      });
    }
  }

  return { geprueft: offen.length, gefunden, bestaetigt: zeilen.length, zeilen };
}
