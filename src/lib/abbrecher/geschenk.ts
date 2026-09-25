/**
 * Die Geschenke für Gäste, die im Warenkorb stehen geblieben sind.
 * Siehe migrations/076_abbruch_geschenk.sql.
 *
 * Nichts davon liegt in Ditix. Das Geschenk ist auf den Namen hinterlegt:
 * Der Gast meldet sich an der Magic-Bar, das Foyer sieht ihn in der Liste
 * und hakt ab. Einfacher geht es nicht, und der Warenkorb bleibt sauber
 * (Florian, 23.09.2026).
 */

import { db } from "@/lib/db/client";

export type GeschenkArt = "baendchen" | "glas" | "zauberstab";

export const GESCHENK_TEXT: Record<GeschenkArt, string> = {
  baendchen: "VIP-Bändchen Silber",
  glas: "Souvenirglas",
  zauberstab: "Erscheinender Zauberstab",
};

/** Mit Artikel, damit die Sätze in der Mail stimmen ("wir legen dir ... dazu"). */
export const GESCHENK_DAZU: Record<GeschenkArt, string> = {
  baendchen: "das VIP-Bändchen Silber",
  glas: "ein Souvenirglas",
  zauberstab: "einen erscheinenden Zauberstab",
};

/** Was der Gast davon hat, in einem Satz für die Mail. */
export const GESCHENK_ERKLAERUNG: Record<GeschenkArt, string> = {
  baendchen: "Damit sind alle alkoholfreien Getränke an der Magic-Bar für euch bezahlt, den ganzen Abend.",
  glas: "Euer Souvenirglas von der Show, das ihr mit nach Hause nehmt.",
  zauberstab: "Ein erscheinender Zauberstab für jedes Kind, mit dem der erste eigene Trick sofort klappt.",
};

/**
 * Das Bild zum Geschenk, aus dem Shop.
 *
 * Bewusst die Adressen des Ticketshops und keine eigenen Kopien: So
 * sieht der Gast dasselbe Glas wie im Laden, und es gibt nichts, was
 * auseinanderlaufen kann. Fuers VIP-Baendchen gibt es noch kein Foto,
 * dort bleibt es beim Text (Florian, 23.09.2026).
 */
const SHOP_BILDER = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

export const GESCHENK_BILD: Record<GeschenkArt, string | null> = {
  baendchen: null,
  glas: `${SHOP_BILDER}/images/magic-cup.webp`,
  zauberstab: `${SHOP_BILDER}/images/zauberstab-video-poster.jpg`,
};

export interface Geschenk {
  id: string;
  buchungId: string | null;
  email: string;
  name: string;
  art: GeschenkArt;
  anzahl: number;
  versprochenAm: string;
  /** Bis wann der Gast zugreifen kann. */
  giltBis: string | null;
  eingeloestAm: string | null;
  eingeloestVon: string | null;
  notiz: string;
  /** Hat der Gast danach wirklich gebucht? Dann steht hier sein Abend. */
  gebuchtShow: string | null;
  gebuchtDatum: string | null;
  gebuchtUhrzeit: string | null;
  /** Wie viele Plätze er am Ende wirklich gebucht hat. */
  gebuchtPlaetze: number | null;
  /**
   * Was das Foyer herausgibt.
   *
   * Versprochen wurde so viel, wie im liegen gelassenen Korb lag. Bucht
   * er danach weniger, gilt die kleinere Zahl: Für vier Gäste gedacht,
   * gekommen sind zwei, dann gibt es auch zwei Gläser (Florian,
   * 23.09.2026). Mehr gibt es nie, auch wenn er mehr bucht, sonst
   * verschenkt ein grosser Korb beliebig viel.
   */
  gilt: number;
}

function baue(r: Record<string, unknown>): Geschenk {
  return {
    id: String(r.id),
    buchungId: (r.buchung_id as string) ?? null,
    email: String(r.email),
    name: String(r.name ?? ""),
    art: r.art as GeschenkArt,
    anzahl: Number(r.anzahl ?? 1),
    versprochenAm: new Date(r.versprochen_am as string).toISOString(),
    giltBis: r.gilt_bis ? new Date(r.gilt_bis as string).toISOString() : null,
    eingeloestAm: r.eingeloest_am ? new Date(r.eingeloest_am as string).toISOString() : null,
    eingeloestVon: (r.eingeloest_von as string) ?? null,
    notiz: String(r.notiz ?? ""),
    gebuchtShow: (r.gebucht_show as string) ?? null,
    gebuchtDatum: (r.gebucht_datum as string) ?? null,
    gebuchtUhrzeit: (r.gebucht_uhrzeit as string) ?? null,
    gebuchtPlaetze: r.gebucht_plaetze === null || r.gebucht_plaetze === undefined ? null : Number(r.gebucht_plaetze),
    gilt: (() => {
      const versprochen = Number(r.anzahl ?? 1);
      const gebucht = r.gebucht_plaetze === null || r.gebucht_plaetze === undefined ? null : Number(r.gebucht_plaetze);
      return gebucht === null ? versprochen : Math.max(1, Math.min(versprochen, gebucht));
    })(),
  };
}

/**
 * Welches Geschenk passt?
 *
 * Bei den Familienshows der Zauberstab, sonst das Glas. Das Bändchen
 * vergibt die wöchentliche Ziehung.
 */
export function passendesGeschenk(show: string): GeschenkArt {
  return /zirkus|family|kinder/i.test(show) ? "zauberstab" : "glas";
}

export async function geschenkVersprechen(o: {
  buchungId: string;
  email: string;
  name: string;
  art: GeschenkArt;
  anzahl: number;
  giltBis: Date;
}): Promise<void> {
  await db()`
    insert into abbruch_geschenk (buchung_id, email, name, art, anzahl, gilt_bis)
    values (${o.buchungId}, ${o.email}, ${o.name}, ${o.art}, ${Math.max(1, o.anzahl)}, ${o.giltBis.toISOString()})
  `;
}

/** Das Geschenk zu einer Buchung, für die Angebotsseite. */
export async function geschenkZurBuchung(buchungId: string): Promise<Geschenk | null> {
  const z = (await db()`
    select g.*, null as gebucht_show, null as gebucht_datum, null as gebucht_uhrzeit,
           null as gebucht_plaetze
      from abbruch_geschenk g
     where g.buchung_id = ${buchungId}
     order by g.versprochen_am desc limit 1
  `) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

/**
 * Was im Foyer bereitliegt.
 *
 * Es zählt nur, wer nach dem Versprechen wirklich gebucht hat. Wer nie
 * gekauft hat, taucht hier gar nicht auf, auch nicht unter "auch schon
 * ausgegeben": Im Foyer steht abends jemand unter Zeitdruck vor der
 * Liste, und Namen, die nie kommen, verwirren nur (Florian, 23.09.2026).
 * Wem etwas versprochen wurde, steht weiterhin unter Abbrüche.
 *
 * "alle" heißt deshalb nur noch: die schon ausgegebenen mit anzeigen.
 */
export async function geschenke(alle = false): Promise<Geschenk[]> {
  const z = (await db()`
    select g.*,
           k.show as gebucht_show, k.datum::text as gebucht_datum, k.uhrzeit as gebucht_uhrzeit,
           k.plaetze as gebucht_plaetze
      from abbruch_geschenk g
      left join lateral (
        select b.show, b.datum, b.uhrzeit, b.plaetze
          from shop_buchung b
         where b.bestaetigt and lower(b.email) = lower(g.email)
           and b.eingegangen_am >= g.versprochen_am - interval '1 hour'
         order by b.eingegangen_am desc
         limit 1
      ) k on true
     where g.versprochen_am >= now() - interval '180 days'
       and k.show is not null
       and (${alle} or g.eingeloest_am is null)
     order by k.datum nulls last, g.versprochen_am desc
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function geschenkEinloesen(id: string, wer: string): Promise<void> {
  await db()`
    update abbruch_geschenk
       set eingeloest_am = now(), eingeloest_von = ${wer}
     where id = ${id} and eingeloest_am is null
  `;
}

export async function geschenkZurueck(id: string): Promise<void> {
  await db()`update abbruch_geschenk set eingeloest_am = null, eingeloest_von = null where id = ${id}`;
}
