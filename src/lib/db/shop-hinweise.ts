/**
 * Unverträglichkeiten und Hinweise aus dem öffentlichen Ticketshop.
 *
 * Der Shop schickt sie an /api/shop/hinweis, sobald ein Warenkorb zur Kasse
 * geht. Das Funktionsheet zeigt sie dann neben den Angaben aus dem
 * Firmenevent-Weg. Siehe migrations/021_shop_hinweis.sql.
 */

import { db } from "@/lib/db/client";

export interface ShopHinweis {
  id: string;
  ditixEventId: string;
  uhrzeit: string | null;
  show: string;
  email: string;
  telefon: string;
  hinweis: string;
  plaetze: number | null;
  eingegangenAm: Date;
}

export interface NeuerShopHinweis {
  ditixEventId: string;
  datum: string; // YYYY-MM-DD
  uhrzeit?: string | null;
  show?: string;
  email?: string;
  telefon?: string;
  hinweis: string;
  plaetze?: number | null;
  cartId?: string | null;
}

/**
 * Legt einen Hinweis an. Schickt der Shop denselben Warenkorb ein zweites Mal
 * (Netzwerkfehler, Neuladen), wird der vorhandene Eintrag aktualisiert statt
 * ein zweiter angelegt -- die Küche soll jede Allergie genau einmal sehen.
 */
export async function speichereShopHinweis(neu: NeuerShopHinweis): Promise<void> {
  await db()`
    insert into shop_hinweis
      (ditix_event_id, datum, uhrzeit, show, email, telefon, hinweis, plaetze, cart_id)
    values
      (${neu.ditixEventId}, ${neu.datum}, ${neu.uhrzeit ?? null}, ${neu.show ?? ""},
       ${neu.email ?? ""}, ${neu.telefon ?? ""}, ${neu.hinweis}, ${neu.plaetze ?? null},
       ${neu.cartId ?? null})
    on conflict (cart_id) do update set
      hinweis  = excluded.hinweis,
      email    = excluded.email,
      telefon  = excluded.telefon,
      plaetze  = excluded.plaetze,
      uhrzeit  = excluded.uhrzeit,
      show     = excluded.show
  `;
}

/**
 * Alle Shop-Hinweise eines Tages, neueste zuerst.
 *
 * Faengt Datenbankfehler bewusst ab und liefert dann eine leere Liste: Das
 * Funktionsheet ist ein Betriebsdokument, das jeden Abend gebraucht wird. Es
 * darf nicht komplett ausfallen, nur weil diese junge Zusatzquelle klemmt --
 * etwa wenn der Code vor der Migration ausgeliefert wird und die Tabelle noch
 * gar nicht existiert.
 */
export async function shopHinweiseFuerTag(datum: string): Promise<ShopHinweis[]> {
  try {
    return await ladeHinweise(datum);
  } catch (e) {
    console.warn("[shop-hinweise] konnten nicht geladen werden:", e);
    return [];
  }
}

async function ladeHinweise(datum: string): Promise<ShopHinweis[]> {
  const zeilen = (await db()`
    select id, ditix_event_id, uhrzeit, show, email, telefon, hinweis, plaetze, eingegangen_am
      from shop_hinweis
     where datum = ${datum}
     order by eingegangen_am desc
  `) as Record<string, unknown>[];

  return zeilen.map((z) => ({
    id: String(z.id),
    ditixEventId: String(z.ditix_event_id),
    uhrzeit: (z.uhrzeit as string) ?? null,
    show: String(z.show ?? ""),
    email: String(z.email ?? ""),
    telefon: String(z.telefon ?? ""),
    hinweis: String(z.hinweis ?? ""),
    plaetze: z.plaetze === null || z.plaetze === undefined ? null : Number(z.plaetze),
    eingegangenAm: new Date(z.eingegangen_am as string),
  }));
}
