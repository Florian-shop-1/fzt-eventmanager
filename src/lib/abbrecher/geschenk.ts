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

/*
  Die drei ersten kommen aus der Abbrecher-Strecke, die anderen tragen
  wir von Hand ein: "ich habe für den 25.10. 4 Freigetränke und 2
  Popcorn für frei rauszugeben" (Kevin, 12.10.2026). Was auf keine
  Kachel passt, läuft über "sonstiges" und den Freitext daneben.
*/
export type GeschenkArt =
  | "baendchen"
  | "glas"
  | "zauberstab"
  | "getraenk"
  | "popcorn"
  | "sonstiges";

export const GESCHENK_ARTEN: GeschenkArt[] = [
  "glas",
  "zauberstab",
  "baendchen",
  "getraenk",
  "popcorn",
  "sonstiges",
];

export const GESCHENK_TEXT: Record<GeschenkArt, string> = {
  baendchen: "VIP-Bändchen Silber",
  glas: "Souvenirglas",
  zauberstab: "Erscheinender Zauberstab",
  getraenk: "Freigetränk",
  popcorn: "Popcorn",
  sonstiges: "etwas anderes",
};

/** Was an der Bar wirklich herausgegeben wird. */
export function geschenkText(g: { art: GeschenkArt; eigenes?: string }): string {
  if (g.art === "sonstiges") return g.eigenes?.trim() || "etwas anderes, siehe Notiz";
  return GESCHENK_TEXT[g.art];
}

/** Mit Artikel, damit die Sätze in der Mail stimmen ("wir legen dir ... dazu"). */
export const GESCHENK_DAZU: Record<GeschenkArt, string> = {
  baendchen: "das VIP-Bändchen Silber",
  glas: "ein Souvenirglas",
  zauberstab: "einen erscheinenden Zauberstab",
  getraenk: "ein Freigetränk",
  popcorn: "eine Portion Popcorn",
  sonstiges: "eine Kleinigkeit",
};

/** Was der Gast davon hat, in einem Satz für die Mail. */
export const GESCHENK_ERKLAERUNG: Record<GeschenkArt, string> = {
  baendchen: "Damit sind alle alkoholfreien Getränke an der Magic-Bar für euch bezahlt, den ganzen Abend.",
  glas: "Euer Souvenirglas von der Show, das ihr mit nach Hause nehmt.",
  zauberstab: "Ein erscheinender Zauberstab für jedes Kind, mit dem der erste eigene Trick sofort klappt.",
  getraenk: "Ein Getränk an der Magic-Bar geht auf uns.",
  popcorn: "Eine Portion Popcorn für die Show geht auf uns.",
  sonstiges: "Eine Kleinigkeit von uns, du bekommst sie an der Magic-Bar.",
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
  getraenk: null,
  popcorn: null,
  sonstiges: null,
  glas: `${SHOP_BILDER}/images/magic-cup.webp`,
  zauberstab: `${SHOP_BILDER}/images/zauberstab-video-poster.jpg`,
};

export interface Geschenk {
  id: string;
  buchungId: string | null;
  email: string;
  name: string;
  art: GeschenkArt;
  /** Bei art = sonstiges: was es ist, im Klartext. */
  eigenes: string;
  anzahl: number;
  versprochenAm: string;
  /** Bis wann der Gast zugreifen kann. */
  giltBis: string | null;
  eingeloestAm: string | null;
  eingeloestVon: string | null;
  notiz: string;
  /** Hat der Gast danach wirklich gebucht? Dann steht hier sein Abend. */
  gebuchtShow: string | null;
  /** Die Vorstellung, zu der die Buchung gehört. Für die Namenssuche. */
  gebuchtEventId: string | null;
  gebuchtDatum: string | null;
  gebuchtUhrzeit: string | null;
  /** Wie viele Plätze er am Ende wirklich gebucht hat. */
  gebuchtPlaetze: number | null;
  /** Von Hand eingetragen, ohne Buchung im Shop. */
  vonHand: boolean;
  /** Wer es eingetragen hat. Nur bei Geschenken von Hand. */
  erfasstVon: string;
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
    eigenes: String(r.eigenes ?? ""),
    anzahl: Number(r.anzahl ?? 1),
    versprochenAm: new Date(r.versprochen_am as string).toISOString(),
    giltBis: r.gilt_bis ? new Date(r.gilt_bis as string).toISOString() : null,
    eingeloestAm: r.eingeloest_am ? new Date(r.eingeloest_am as string).toISOString() : null,
    eingeloestVon: (r.eingeloest_von as string) ?? null,
    notiz: String(r.notiz ?? ""),
    gebuchtShow: (r.gebucht_show as string) ?? null,
    gebuchtEventId: (r.gebucht_event_id as string) ?? null,
    gebuchtDatum: (r.gebucht_datum as string) ?? null,
    gebuchtUhrzeit: (r.gebucht_uhrzeit as string) ?? null,
    gebuchtPlaetze: r.gebucht_plaetze === null || r.gebucht_plaetze === undefined ? null : Number(r.gebucht_plaetze),
    vonHand: Boolean(r.von_hand),
    erfasstVon: String(r.erfasst_von ?? ""),
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

/**
 * Ein liegengebliebener Gutscheinkauf. Dafür gibt es kein Geschenk.
 *
 * "diese dürfen NICHT beim gutscheinverkauf versendet werden, wie
 * sollen wir da was hinterlegen, wenn wir nicht wissen, wann sie
 * kommen" (Florian, 13.10.2026).
 *
 * Genau daran hängt es: Das Geschenk liegt an einem Abend an der
 * Magic-Bar bereit. Wer einen Gutschein kauft, hat keinen Abend, und
 * oft ist der Beschenkte ein ganz anderer Mensch als der Käufer.
 *
 * Erkannt wird es am Wort im Namen der Vorstellung oder der Posten und
 * daran, dass kein richtiger Termin dranhängt.
 */
export function istGutscheinkorb(a: {
  show: string;
  ditixEventId: string;
  datum: string;
  posten: Array<{ name: string; gruppe: string }>;
}): boolean {
  if (/gutschein/i.test(a.show)) return true;
  if (a.posten.some((p) => /gutschein/i.test(p.name) || /gutschein/i.test(p.gruppe))) return true;
  // Kein Termin, kein Abend: Dann wissen wir nicht, wann jemand kommt.
  const terminFehlt = a.ditixEventId.trim().length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(a.datum.slice(0, 10));
  return terminFehlt;
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
    select g.*, null as gebucht_show, null as gebucht_event_id, null as gebucht_datum,
           null as gebucht_uhrzeit, null as gebucht_plaetze
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
           -- Von Hand eingetragene Geschenke haben keine Buchung im Shop;
           -- bei ihnen steht der Abend direkt am Geschenk.
           coalesce(direkt.show, k.show, g.hand_show) as gebucht_show,
           coalesce(direkt.ditix_event_id, k.ditix_event_id) as gebucht_event_id,
           coalesce(direkt.datum, k.datum, g.hand_datum)::text as gebucht_datum,
           coalesce(direkt.uhrzeit, k.uhrzeit, g.hand_uhrzeit) as gebucht_uhrzeit,
           coalesce(direkt.plaetze, k.plaetze) as gebucht_plaetze
      from abbruch_geschenk g
      -- Bei Show-Absagen (siehe lib/absage) steht die Buchung schon fest,
      -- bevor das Geschenk versprochen wird: dann direkt verknuepfen statt
      -- ueber die E-Mail zu suchen (Florian, 29.09.2026).
      left join shop_buchung direkt on direkt.id = g.buchung_id and direkt.bestaetigt
      left join lateral (
        select b.show, b.datum, b.uhrzeit, b.plaetze, b.ditix_event_id
          from shop_buchung b
         where b.bestaetigt and lower(b.email) = lower(g.email)
           and b.eingegangen_am >= g.versprochen_am - interval '1 hour'
         order by b.eingegangen_am desc
         limit 1
      ) k on direkt.id is null
     where g.versprochen_am >= now() - interval '180 days'
       -- Von Hand eingetragene Geschenke stehen immer in der Liste, auch
       -- ohne Buchung: Genau dafuer sind sie da (Florian, 29.09.2026).
       and (g.von_hand or coalesce(direkt.show, k.show) is not null)
       and (${alle} or g.eingeloest_am is null)
     order by coalesce(direkt.datum, k.datum, g.hand_datum) nulls last, g.versprochen_am desc
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

/**
 * Wer ein Geschenk von Hand eintragen darf: Florian, Kevin und das Foyer.
 *
 * Das Foyer steht abends mit den Gaesten zusammen und merkt als Erstes,
 * wem man eine Freude machen sollte. Deshalb darf es selbst eintragen und
 * muss nicht erst jemanden suchen (Florian, 29.09.2026).
 */
export function darfGeschenkEintragen(
  b: { rolle: string; email: string } | null | undefined,
): boolean {
  if (!b) return false;
  if (b.rolle === "chef" || b.rolle === "foyer") return true;
  return b.email.toLowerCase() === "kevin.steele@florianzimmer.com";
}

/**
 * Ein Geschenk ohne Shop-Buchung eintragen.
 *
 * Zwei Faelle: jemandem etwas Gutes tun, oder ein Abend, der telefonisch
 * gebucht wurde. Der Abend wird mitgegeben, damit das Foyer den Gast am
 * richtigen Tag in der Liste findet.
 */
export async function geschenkVonHand(o: {
  name: string;
  email: string;
  art: GeschenkArt;
  eigenes: string;
  anzahl: number;
  show: string;
  datum: string;
  uhrzeit: string;
  notiz: string;
  erfasstVon: string;
}): Promise<void> {
  const name = o.name.trim();
  if (!name) throw new Error("Bitte eintragen, für wen es ist. Sonst findet das Foyer den Gast nicht.");
  const eigenes = o.eigenes.trim().slice(0, 120);
  if (o.art === "sonstiges" && !eigenes) {
    throw new Error("Bitte dazuschreiben, was es ist. Die Bar muss wissen, was sie herausgibt.");
  }
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(o.datum) ? o.datum : null;
  if (!datum) throw new Error("Bitte den Abend angeben, an dem der Gast kommt.");

  /*
    Gueltig bis zum Abend, plus ein paar Tage Luft: Wer wegen Krankheit
    umbucht, soll sein Glas nicht verlieren.
  */
  const giltBis = new Date(`${datum}T23:59:00`);
  giltBis.setDate(giltBis.getDate() + 30);

  await db()`
    insert into abbruch_geschenk
      (email, name, art, eigenes, anzahl, gilt_bis, notiz, von_hand, erfasst_von,
       hand_show, hand_datum, hand_uhrzeit)
    values (${o.email.trim()}, ${name}, ${o.art}, ${eigenes}, ${Math.max(1, Math.min(50, o.anzahl))},
            ${giltBis.toISOString()}, ${o.notiz.trim().slice(0, 500)}, true, ${o.erfasstVon},
            ${o.show.trim().slice(0, 120) || null}, ${datum}::date, ${o.uhrzeit.trim().slice(0, 10) || null})
  `;
}
