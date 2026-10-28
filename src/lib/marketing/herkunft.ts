/**
 * Woher die Verkäufe kommen. Siehe migrations/071_buchung_herkunft.sql.
 *
 * Absichtlich schlicht: eine Zeile je Kanal, mit Anteil, Karten und
 * Umsatz. Keine Trichter, keine Kurven. Die Frage, die eine Agentur
 * beantworten muss, ist "was hat es gebracht", und die beantwortet eine
 * Prozentzahl neben einem Eurobetrag (Florian, 23.09.2026).
 *
 * Gezählt wird nur, was bezahlt wurde. Ein abgebrochener Warenkorb ist
 * kein Verkauf, und eine Agentur an abgebrochenen Körben zu messen wäre
 * unfair in beide Richtungen.
 */

import { db } from "@/lib/db/client";

export interface Kanal {
  /** Der Schlüssel, wie er in der Datenbank steht. */
  quelle: string;
  /** Wie es ein Mensch nennt. */
  name: string;
  buchungen: number;
  karten: number;
  umsatzCent: number;
  anteil: number;
}

export interface Warengruppe {
  /** sitzplatz, menue, vip, bundle */
  gruppe: string;
  name: string;
  anzahl: number;
  umsatzCent: number;
  anteil: number;
}

export interface Kampagne {
  quelle: string;
  kampagne: string;
  buchungen: number;
  umsatzCent: number;
}

export interface Herkunftsbericht {
  von: string;
  bis: string;
  buchungen: number;
  karten: number;
  umsatzCent: number;
  kanaele: Kanal[];
  kampagnen: Kampagne[];
  /** Was gekauft wurde: Tickets, Menues, Zusatzleistungen. */
  waren: Warengruppe[];
  /** Anteil der Verkäufe, denen keine Herkunft anhängt. */
  ohneHerkunft: number;
  /** Was über bezahlte Klicks kam: Anzeigen, nicht Suchtreffer. */
  bezahltUmsatzCent: number;
  bezahltBuchungen: number;
}

/**
 * Aus utm_source einen Namen machen, den jeder versteht.
 *
 * Die Liste wächst mit den Kampagnen. Was hier nicht steht, erscheint so,
 * wie es der Shop gemeldet hat, damit nichts unsichtbar wird.
 */
const NAMEN: Record<string, string> = {
  "": "Direkt und unbekannt",
  google: "Google",
  "google-ads": "Google Ads",
  bing: "Bing",
  meta: "Meta",
  facebook: "Facebook",
  instagram: "Instagram",
  /*
    Radio 7 heisst in der Liste nach dem, was der Gast getan hat.

    Die Leute hoeren den Spot und tippen die Adresse ein; genau so soll
    die Zeile heissen (Florian, 14.10.2026). Der Schluessel bleibt
    radio7, damit die Kampagnenzeile darunter weiter stimmt.
  */
  radio7: "florianzimmer.com eingegeben",
  swp: "Zeitungsanzeige (SWP)",
  regiotv: "RegioTV",
  /*
    Das Stadtportal der Stadt Ulm. Unsere Termine stehen dort im
    Veranstaltungskalender LEO, und jeder Link von dort traegt
    utm_source=ulm.de (Florian, 27.10.2026: "dass wir spaeter auslesen
    koennen ob sales darueber kamen").
  */
  "ulm.de": "Stadtportal Ulm (LEO)",
  /*
    Dieselbe Zeile, wenn der Gast ohne getaggten Link kommt.

    Der Shop erkennt den Verweis von veranstaltungen.ulm.de inzwischen
    selbst und meldet dafuer schon ulm.de (attribution.ts, PORTALE).
    Die Rohnamen bleiben hier stehen, damit Besuche, die vorher
    eingegangen sind, lesbar bleiben und nicht als eigener Kanal
    auftauchen.
  */
  "veranstaltungen.ulm.de": "Stadtportal Ulm (LEO)",
  "leoonline.ulm.de": "Stadtportal Ulm (LEO)",
  "neu-ulm.de": "Stadtportal Neu-Ulm",
  bruecke: "Brückenbanner",
  eurowings: "Eurowings-Magazin",
  brevo: "Newsletter",
  newsletter: "Newsletter",
  ecosia: "Ecosia",
  duckduckgo: "DuckDuckGo",
};

/**
 * Wurde für diesen Besuch bezahlt?
 *
 * "unterscheide bei Google: kam organisch oder über Ad" (Florian,
 * 14.10.2026). Das steht nicht in der Quelle, sondern im Medium: Der
 * Shop meldet für dieselbe Quelle google einmal organic und einmal cpc.
 * Zusammengezählt sah es so aus, als brächte Google 166 Buchungen,
 * dabei sind davon nur zwölf bezahlt.
 */
const BEZAHLTE_MEDIEN = new Set([
  "cpc",
  "ppc",
  "paid",
  "paid_social",
  "paidsocial",
  "ads",
  "display",
  "retargeting",
  "remarketing",
  "sea",
]);

export function istBezahlt(quelle: string, medium: string): boolean {
  const m = medium.trim().toLowerCase();
  if (BEZAHLTE_MEDIEN.has(m)) return true;
  // Manche Quellen sagen es schon im Namen: "google-ads".
  return /(^|[-_])ads?$/.test(quelle.trim().toLowerCase());
}

/** Quelle und Art zusammen: Danach wird gruppiert und sortiert. */
export function kanalSchluessel(quelle: string, medium: string): string {
  const q = quelle.trim().toLowerCase();
  if (!q) return "";
  return `${q}|${istBezahlt(q, medium) ? "bezahlt" : "frei"}`;
}

export function kanalName(quelle: string, medium: string): string {
  const q = quelle.trim().toLowerCase();
  if (!q) return NAMEN[""];

  const basis = NAMEN[q] ?? q.charAt(0).toUpperCase() + q.slice(1);
  const bezahlt = istBezahlt(q, medium);

  // "Google Ads Ads" wäre albern: Steht es schon im Namen, bleibt es dabei.
  if (bezahlt) return /ads/i.test(basis) ? basis : `${basis} Ads`;

  const m = medium.trim().toLowerCase();
  if (m === "organic") return `${basis} (organisch)`;
  if (!m || NAMEN[q]) return basis;
  return `${basis} (${m})`;
}

/**
 * Der Bericht für einen Zeitraum.
 *
 * "Gebucht am" ist der Tag der Bestellung, nicht der Showtag: Eine
 * Kampagne im September verkauft Karten für den Dezember, und die soll
 * dem September zugerechnet werden.
 */
/**
 * Der Bericht über einen Zeitraum.
 *
 * `tage` zählt rückwärts von heute. `bisVorTagen` verschiebt das Ende
 * nach hinten: So lässt sich derselbe Zeitraum davor abfragen und
 * danebenstellen. Wer wissen will, ob eine Kampagne etwas gebracht hat,
 * braucht genau das: dieselbe Länge, der Abschnitt davor
 * (Florian, 25.09.2026).
 */
export async function herkunftsbericht(tage = 30, bisVorTagen = 0): Promise<Herkunftsbericht> {
  const zeilen = (await db()`
    select coalesce(nullif(quelle, ''), '') as quelle,
           coalesce(nullif(medium, ''), '') as medium,
           count(*) as buchungen,
           coalesce(sum(plaetze), 0) as karten,
           coalesce(sum(gesamt_cent), 0) as umsatz
      from shop_buchung
     where bestaetigt
       and eingegangen_am >= now() - (${tage + bisVorTagen} || ' days')::interval
       and eingegangen_am < now() - (${bisVorTagen} || ' days')::interval
     group by 1, 2
  `) as Array<Record<string, unknown>>;

  /*
    Gruppiert wird nach Quelle UND Art, nicht nur nach Quelle.

    Sonst stehen die bezahlten Klicks in derselben Zeile wie die Leute,
    die uns ohnehin gefunden hätten, und dann sieht jede Suchmaschine
    aus wie eine erfolgreiche Kampagne (Florian, 14.10.2026).
  */
  const proQuelle = new Map<string, Kanal>();
  for (const z of zeilen) {
    const quelle = String(z.quelle);
    const schluessel = kanalSchluessel(quelle, String(z.medium));
    const vorhanden = proQuelle.get(schluessel) ?? {
      quelle: schluessel,
      name: kanalName(quelle, String(z.medium)),
      buchungen: 0,
      karten: 0,
      umsatzCent: 0,
      anteil: 0,
    };
    vorhanden.buchungen += Number(z.buchungen);
    vorhanden.karten += Number(z.karten);
    vorhanden.umsatzCent += Number(z.umsatz);
    proQuelle.set(schluessel, vorhanden);
  }

  const kanaele = [...proQuelle.values()].sort((a, b) => b.umsatzCent - a.umsatzCent || b.buchungen - a.buchungen);
  const bezahlte = kanaele.filter((k) => k.quelle.endsWith("|bezahlt"));
  const bezahltUmsatzCent = bezahlte.reduce((n, k) => n + k.umsatzCent, 0);
  const bezahltBuchungen = bezahlte.reduce((n, k) => n + k.buchungen, 0);
  const umsatzCent = kanaele.reduce((n, k) => n + k.umsatzCent, 0);
  const buchungen = kanaele.reduce((n, k) => n + k.buchungen, 0);
  const karten = kanaele.reduce((n, k) => n + k.karten, 0);
  for (const k of kanaele) {
    // Anteil am Umsatz, und wenn nichts umgesetzt wurde, an den Buchungen.
    k.anteil = umsatzCent > 0 ? k.umsatzCent / umsatzCent : buchungen > 0 ? k.buchungen / buchungen : 0;
  }

  const kampagnenZeilen = (await db()`
    select quelle, kampagne, count(*) as buchungen, coalesce(sum(gesamt_cent), 0) as umsatz
      from shop_buchung
     where bestaetigt and kampagne <> ''
       and eingegangen_am >= now() - (${tage + bisVorTagen} || ' days')::interval
       and eingegangen_am < now() - (${bisVorTagen} || ' days')::interval
     group by quelle, kampagne
     order by umsatz desc
     limit 15
  `) as Array<Record<string, unknown>>;

  const warenListe = await waren(tage, bisVorTagen);

  const bis = new Date(Date.now() - bisVorTagen * 86400000);
  const von = new Date(bis.getTime() - tage * 86400000);

  return {
    bezahltUmsatzCent,
    bezahltBuchungen,
    von: von.toLocaleDateString("sv-SE"),
    bis: bis.toLocaleDateString("sv-SE"),
    buchungen,
    karten,
    umsatzCent,
    kanaele,
    waren: warenListe,
    kampagnen: kampagnenZeilen.map((z) => ({
      quelle: String(z.quelle),
      kampagne: String(z.kampagne),
      buchungen: Number(z.buchungen),
      umsatzCent: Number(z.umsatz),
    })),
    ohneHerkunft: proQuelle.get("")?.buchungen ?? 0,
  };
}

/**
 * Was in den Buchungen steckt: Tickets, Menues, VIP, Bundles.
 *
 * Die Posten meldet der Shop bei jeder Buchung mit (shop_buchung_posten).
 * Gezählt wird wieder nur, was bezahlt wurde.
 */
const WARENNAMEN: Record<string, string> = {
  sitzplatz: "Tickets",
  menue: "Menüs",
  vip: "VIP und Pause",
  bundle: "Bundles und Geschenke",
  "": "Sonstiges",
};

export async function waren(tage = 30, bisVorTagen = 0): Promise<Warengruppe[]> {
  const z = (await db()`
    select coalesce(p.gruppe, '') as gruppe,
           coalesce(sum(p.anzahl), 0) as anzahl,
           coalesce(sum(p.anzahl * coalesce(p.preis_cent, 0)), 0) as umsatz
      from shop_buchung_posten p
      join shop_buchung b on b.id = p.buchung_id
     where b.bestaetigt
       and b.eingegangen_am >= now() - (${tage + bisVorTagen} || ' days')::interval
       and b.eingegangen_am < now() - (${bisVorTagen} || ' days')::interval
     group by 1
  `) as Array<Record<string, unknown>>;

  const liste = z.map((r) => ({
    gruppe: String(r.gruppe),
    name: WARENNAMEN[String(r.gruppe)] ?? String(r.gruppe),
    anzahl: Number(r.anzahl),
    umsatzCent: Number(r.umsatz),
    anteil: 0,
  }));
  const summe = liste.reduce((n, w) => n + w.umsatzCent, 0);
  for (const w of liste) w.anteil = summe > 0 ? w.umsatzCent / summe : 0;
  return liste.sort((a, b) => b.umsatzCent - a.umsatzCent);
}

/** Verkäufe je Tag, für den Verlauf. */
export async function verlauf(tage = 30): Promise<Array<{ tag: string; buchungen: number; umsatzCent: number }>> {
  const z = (await db()`
    select to_char(eingegangen_am at time zone 'Europe/Berlin', 'YYYY-MM-DD') as tag,
           count(*) as buchungen, coalesce(sum(gesamt_cent), 0) as umsatz
      from shop_buchung
     where bestaetigt and eingegangen_am >= now() - (${tage} || ' days')::interval
     group by 1 order by 1
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({ tag: String(r.tag), buchungen: Number(r.buchungen), umsatzCent: Number(r.umsatz) }));
}
