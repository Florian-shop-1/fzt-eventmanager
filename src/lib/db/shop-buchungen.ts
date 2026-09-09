/**
 * Buchungen aus dem oeffentlichen Ticketshop.
 *
 * Der Shop meldet jede Uebergabe zur Kasse an /api/shop/buchung. Erst wenn der
 * Shop bestaetigt, dass wirklich bezahlt wurde, zaehlt eine Zeile als Buchung.
 *
 * Zwei Verwendungen:
 *  1. Funktionsheet: Unvertraeglichkeiten fuer die Kueche.
 *  2. Vorfreude-Mail eine Woche vor der Show, mit genau den Leistungen, die
 *     noch NICHT gebucht wurden.
 *
 * Siehe migrations/023_shop_buchung.sql.
 */

import { db } from "@/lib/db/client";

export type PostenGruppe = "sitzplatz" | "menue" | "vip" | "bundle" | "";

export interface BuchungsPosten {
  ticketTypeId: string;
  name: string;
  anzahl: number;
  preisCent: number | null;
  gruppe: PostenGruppe;
}

export interface ShopBuchung {
  id: string;
  /** Schluessel fuer den Upgrade-Link in der Mail. Siehe Migration 027. */
  zugangToken: string;
  cartId: string | null;
  ditixEventId: string;
  datum: string;
  uhrzeit: string | null;
  show: string;
  /** Name des Kaeufers, fuer die persoenliche Anrede. Siehe Migration 029. */
  name: string;
  email: string;
  telefon: string;
  plaetze: number | null;
  gesamtCent: number | null;
  hinweis: string;
  bestaetigt: boolean;
  accessCode: string | null;
  mailGesendetAm: Date | null;
  eingegangenAm: Date;
  posten: BuchungsPosten[];
}

export interface NeueBuchung {
  cartId?: string | null;
  ditixEventId: string;
  datum: string; // JJJJ-MM-TT
  uhrzeit?: string | null;
  show?: string;
  name?: string;
  email?: string;
  telefon?: string;
  plaetze?: number | null;
  gesamtCent?: number | null;
  hinweis?: string;
  posten?: BuchungsPosten[];
}

/**
 * Legt eine Buchung an oder aktualisiert sie.
 *
 * Schickt der Shop denselben Warenkorb erneut (Netzwerkfehler, Neuladen, oder
 * weil der Gast zurueckgeht und noch etwas ergaenzt), wird die vorhandene Zeile
 * ueberschrieben statt eine zweite anzulegen. Die Posten werden dabei komplett
 * ersetzt, denn sie beschreiben immer den aktuellen Stand des Warenkorbs.
 */
export async function speichereBuchung(neu: NeueBuchung): Promise<void> {
  const zeilen = (await db()`
    insert into shop_buchung
      (cart_id, ditix_event_id, datum, uhrzeit, show, name, email, telefon, plaetze,
       gesamt_cent, hinweis)
    values
      (${neu.cartId ?? null}, ${neu.ditixEventId}, ${neu.datum}, ${neu.uhrzeit ?? null},
       ${neu.show ?? ""}, ${neu.name ?? ""}, ${neu.email ?? ""}, ${neu.telefon ?? ""},
       ${neu.plaetze ?? null}, ${neu.gesamtCent ?? null}, ${neu.hinweis ?? ""})
    on conflict (cart_id) do update set
      uhrzeit     = excluded.uhrzeit,
      show        = excluded.show,
      -- Einen einmal bekannten Namen nicht durch einen leeren ueberschreiben:
      -- Der Shop schickt bei jedem Anlauf mit, was er hat, und das ist heute
      -- nichts. Ein spaeter nachgetragener Name soll dadurch nicht verschwinden.
      name        = case when excluded.name <> '' then excluded.name else shop_buchung.name end,
      email       = excluded.email,
      telefon     = excluded.telefon,
      plaetze     = excluded.plaetze,
      gesamt_cent = excluded.gesamt_cent,
      hinweis     = excluded.hinweis
    returning id
  `) as Record<string, unknown>[];

  const id = String(zeilen[0]?.id ?? "");
  if (!id) return;

  const posten = neu.posten ?? [];
  await db()`delete from shop_buchung_posten where buchung_id = ${id}`;
  for (const p of posten) {
    if (!p.anzahl || p.anzahl <= 0) continue;
    await db()`
      insert into shop_buchung_posten (buchung_id, ticket_type_id, name, anzahl, preis_cent, gruppe)
      values (${id}, ${p.ticketTypeId ?? ""}, ${p.name ?? ""}, ${p.anzahl},
              ${p.preisCent ?? null}, ${p.gruppe ?? ""})
    `;
  }
}

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";

/**
 * Fragt beim Shop nach, ob ein Warenkorb bezahlt wurde.
 *
 * checkout/status liefert den Zahlungsstand plus "lastAccessCode", die
 * Bestellnummer bei Ditix. Das ist die Bruecke zwischen unserer cart_id und der
 * echten Bestellung; die beiden Kennungen sind sonst nicht ineinander
 * umrechenbar.
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

/** Offene Buchungen beim Shop nachfragen und den Stand merken. */
async function bestaetigeOffene(zeilen: Record<string, unknown>[]): Promise<void> {
  const offen = zeilen.filter((z) => !z.bestaetigt && z.cart_id);
  if (offen.length === 0) return;
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
        update shop_buchung
           set bestaetigt = ${bezahlt}, access_code = ${accessCode}, zuletzt_geprueft = now()
         where id = ${String(z.id)}
      `;
    } catch (e) {
      // Nur eine Abkuerzung fuers naechste Mal. Schlaegt es fehl, wird beim
      // naechsten Oeffnen erneut gefragt.
      console.warn("[shop-buchungen] Status konnte nicht gemerkt werden:", e);
    }
  }
}

/**
 * Der Showtag als JJJJ-MM-TT.
 *
 * Klingt trivial, war es nicht. Der Treiber gibt eine date-Spalte als
 * JavaScript-Datum zurueck, und zwar als Mitternacht in der Zeitzone des
 * Servers: Aus dem 18.09. wird 2026-09-17T22:00:00Z. Wer davon die ersten
 * zehn Zeichen nimmt, bekommt "Wed Sep 17" -- und daraus wird spaeter
 * "Invalid Date" in der Mail und auf der Upgrade-Seite.
 *
 * Deshalb fragen die Abfragen zusaetzlich datum::text ab. Postgres schreibt
 * dort genau den Kalendertag, ohne Uhrzeit und ohne Zeitzone. Der Rueckfall
 * auf das rohe Feld bleibt fuer den Fall, dass eine Abfrage die Spalte
 * einmal nicht mitliest.
 */
function kalendertag(z: Record<string, unknown>): string {
  const text = z.datum_text;
  if (typeof text === "string" && /^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const roh = z.datum;
  if (roh instanceof Date) return roh.toLocaleDateString("en-CA");
  return String(roh ?? "").slice(0, 10);
}

function baueBuchung(z: Record<string, unknown>, posten: Record<string, unknown>[]): ShopBuchung {
  return {
    id: String(z.id),
    zugangToken: String(z.zugang_token ?? ""),
    cartId: (z.cart_id as string) ?? null,
    ditixEventId: String(z.ditix_event_id),
    datum: kalendertag(z),
    uhrzeit: (z.uhrzeit as string) ?? null,
    show: String(z.show ?? ""),
    name: String(z.name ?? ""),
    email: String(z.email ?? ""),
    telefon: String(z.telefon ?? ""),
    plaetze: z.plaetze === null || z.plaetze === undefined ? null : Number(z.plaetze),
    gesamtCent: z.gesamt_cent === null || z.gesamt_cent === undefined ? null : Number(z.gesamt_cent),
    hinweis: String(z.hinweis ?? ""),
    bestaetigt: Boolean(z.bestaetigt),
    accessCode: (z.access_code as string) ?? null,
    mailGesendetAm: z.mail_gesendet_am ? new Date(z.mail_gesendet_am as string) : null,
    eingegangenAm: new Date(z.eingegangen_am as string),
    posten: posten
      .filter((p) => String(p.buchung_id) === String(z.id))
      .map((p) => ({
        ticketTypeId: String(p.ticket_type_id ?? ""),
        name: String(p.name ?? ""),
        anzahl: Number(p.anzahl ?? 0),
        preisCent: p.preis_cent === null || p.preis_cent === undefined ? null : Number(p.preis_cent),
        gruppe: String(p.gruppe ?? "") as PostenGruppe,
      })),
  };
}

/**
 * Alle Shop-Buchungen eines Tages.
 *
 * Faengt Datenbankfehler bewusst ab und liefert dann eine leere Liste: Das
 * Funktionsheet ist ein Betriebsdokument, das jeden Abend gebraucht wird. Es
 * darf nicht ausfallen, nur weil diese junge Zusatzquelle klemmt.
 */
export async function buchungenFuerTag(datum: string): Promise<ShopBuchung[]> {
  try {
    const zeilen = (await db()`
      select *, datum::text as datum_text
        from shop_buchung where datum = ${datum} order by eingegangen_am desc
    `) as Record<string, unknown>[];
    if (zeilen.length === 0) return [];
    await bestaetigeOffene(zeilen);
    const posten = (await db()`
      select * from shop_buchung_posten
       where buchung_id = any(${zeilen.map((z) => String(z.id))}::uuid[])
    `) as Record<string, unknown>[];
    return zeilen.map((z) => baueBuchung(z, posten));
  } catch (e) {
    console.warn("[shop-buchungen] konnten nicht geladen werden:", e);
    return [];
  }
}

/**
 * Haelt fest, dass die Vorfreude-Mail raus ist.
 *
 * Wird erst NACH dem erfolgreichen Versand gerufen, nie vorher. Andersherum
 * waere es sicherer gegen Dubletten, aber ein Gast, der nichts bekommen hat und
 * bei uns als angeschrieben gilt, faellt nie wieder auf.
 */
export async function merkeMailGesendet(id: string): Promise<void> {
  await db()`update shop_buchung set mail_gesendet_am = now() where id = ${id}`;
}

/**
 * Eine Buchung ueber den Zugangsschluessel aus dem Upgrade-Link.
 *
 * Bewusst OHNE Zahlungspruefung: Diese Abfrage bedient eine Seite, die ein
 * Gast aufruft, und darf deshalb nicht bei jedem Aufruf den Shop befragen.
 * Der Schluessel wird ohnehin nur mit der Mail verschickt, und die geht nur an
 * bestaetigte Buchungen.
 */
export async function buchungPerToken(token: string): Promise<ShopBuchung | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  try {
    const zeilen = (await db()`
      select *, datum::text as datum_text
        from shop_buchung where zugang_token = ${token} limit 1
    `) as Record<string, unknown>[];
    if (zeilen.length === 0) return null;
    const posten = (await db()`
      select * from shop_buchung_posten where buchung_id = ${String(zeilen[0].id)}
    `) as Record<string, unknown>[];
    return baueBuchung(zeilen[0], posten);
  } catch (e) {
    console.warn("[shop-buchungen] Token-Abfrage fehlgeschlagen:", e);
    return null;
  }
}
