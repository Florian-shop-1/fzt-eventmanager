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
  /** true, sobald der Shop bestaetigt hat, dass dieser Warenkorb bezahlt wurde. */
  bestaetigt: boolean;
  /** Bestellnummer bei Ditix, sobald bekannt. */
  accessCode: string | null;
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

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";

/**
 * Fragt beim Shop nach, ob ein Warenkorb wirklich bezahlt wurde.
 *
 * checkout/status nimmt die Warenkorb-Kennung und liefert den Zahlungsstand
 * plus "lastAccessCode" -- die Bestellnummer, unter der die fertige Bestellung
 * bei Ditix laeuft. Das ist die Bruecke zwischen unserer cart_id und der
 * echten Bestellung; die beiden IDs sind sonst nicht ineinander umrechenbar.
 */
async function pruefeBezahlt(cartId: string): Promise<{ bezahlt: boolean; accessCode: string | null }> {
  try {
    const res = await fetch(`${SHOP_BASIS}/api/ditix/checkout/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { bezahlt: false, accessCode: null };
    const daten = (await res.json()) as { status?: string; lastAccessCode?: string };
    const code = daten.lastAccessCode ?? null;
    return { bezahlt: daten.status === "SUCCESS" || Boolean(code), accessCode: code };
  } catch {
    return { bezahlt: false, accessCode: null };
  }
}

async function ladeHinweise(datum: string): Promise<ShopHinweis[]> {
  const zeilen = (await db()`
    select id, ditix_event_id, uhrzeit, show, email, telefon, hinweis, plaetze,
           bestaetigt, access_code, cart_id, eingegangen_am
      from shop_hinweis
     where datum = ${datum}
     order by eingegangen_am desc
  `) as Record<string, unknown>[];

  // Noch offene Hinweise beim Shop nachfragen. Bewusst hier und nicht in einem
  // Hintergrunddienst: Das Funktionsheet wird am Spieltag geoeffnet, bis dahin
  // ist der Zahlungsstand endgueltig. Einmal bestaetigt, wird nie wieder
  // gefragt. Damit braucht es keinen Zeitplan und nichts, was ausfallen kann.
  const offen = zeilen.filter((z) => !z.bestaetigt && z.cart_id);
  if (offen.length > 0) {
    const ergebnisse = await Promise.all(
      offen.map(async (z) => ({ z, ...(await pruefeBezahlt(String(z.cart_id))) })),
    );
    for (const { z, bezahlt, accessCode } of ergebnisse) {
      if (bezahlt) {
        z.bestaetigt = true;
        z.access_code = accessCode;
      }
      try {
        await db()`
          update shop_hinweis
             set bestaetigt = ${bezahlt}, access_code = ${accessCode},
                 zuletzt_geprueft = now()
           where id = ${String(z.id)}
        `;
      } catch (e) {
        // Das Merken ist nur eine Abkuerzung fuers naechste Mal. Schlaegt es
        // fehl, wird beim naechsten Oeffnen halt erneut gefragt.
        console.warn("[shop-hinweise] Status konnte nicht gemerkt werden:", e);
      }
    }
  }

  return zeilen.map((z) => ({
    id: String(z.id),
    ditixEventId: String(z.ditix_event_id),
    uhrzeit: (z.uhrzeit as string) ?? null,
    show: String(z.show ?? ""),
    email: String(z.email ?? ""),
    telefon: String(z.telefon ?? ""),
    hinweis: String(z.hinweis ?? ""),
    plaetze: z.plaetze === null || z.plaetze === undefined ? null : Number(z.plaetze),
    bestaetigt: Boolean(z.bestaetigt),
    accessCode: (z.access_code as string) ?? null,
    eingegangenAm: new Date(z.eingegangen_am as string),
  }));
}
