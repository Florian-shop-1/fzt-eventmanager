/**
 * Liest den Spielplan aus dem Ticketshop.
 *
 * WICHTIG, bewusste Beschränkung: Dieses Modul liest ausschließlich.
 * Es gibt hier keine Funktion, die etwas bucht, reserviert oder ändert.
 *
 * Der Grund steht in der Umgebung: Im Vercel-Projekt des Shops gibt es
 * nur EIN Paar DITIX_API_URL und DITIX_API_KEY, gültig für Preview und
 * Production gleichzeitig. Die Staging-Seite spricht also mit demselben
 * Ticketsystem wie der Livebetrieb. Eine Buchung über Staging wäre eine
 * echte Buchung mit echtem Ticket und echter Mail an den Gast.
 *
 * Solange das so ist, wird von hier aus nichts geschrieben.
 *
 * Gelesen wird über die öffentliche Shop-Adresse, also über denselben Weg,
 * den jeder Besucher der Seite ohnehin auslöst. Dafür wird kein Schlüssel
 * gebraucht, und es kann nichts verändert werden.
 */

import { isoDatum, uhrzeit, ZEITZONE } from "@/lib/zeit";

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";

/** Eine Vorstellung, wie der Shop sie liefert. */
export interface ShopVorstellung {
  /** Kennung in Ditix. Wird im Vorgang als ditix_event_id gespeichert. */
  id: string;
  code: string;
  name: string;
  timestampStart: number;
  timestampEnd: number;
  location: string;
  /** "ACTIVE", "SOLD_OUT" und weitere Zustände des Ticketverkaufs. */
  ticketSaleState?: string;
  kind?: string;
  seatmapEventId?: string;
  seatmapSchemaId?: string;
  seatingPlanVersionId?: string;
}

/** Aufbereitete Vorstellung für die Oberfläche. */
export interface Vorstellungstermin {
  ditixEventId: string;
  /** Kennung des Saalplans. Wird für die Auslastung und die Preise gebraucht. */
  seatmapEventId?: string;
  /** Kennung des Saalplan-Schemas. Ohne sie liefert der Shop keine Sitzpreise. */
  seatmapSchemaId?: string;
  /** JJJJ-MM-TT */
  datum: string;
  /** HH:MM */
  uhrzeit: string;
  name: string;
  ausverkauft: boolean;
  beginn: Date;
}

/**
 * Holt den Spielplan. Das Ergebnis wird eine Stunde zwischengespeichert,
 * damit nicht bei jedem Seitenaufruf eine Anfrage nach draußen geht.
 */
export async function holeSpielplan(): Promise<ShopVorstellung[]> {
  const antwort = await fetch(`${SHOP_BASIS}/api/ditix/events`, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(15000),
  });

  if (!antwort.ok) {
    throw new Error(
      `Der Spielplan konnte nicht geladen werden (${antwort.status}). ` +
        `Ist ${SHOP_BASIS} erreichbar?`,
    );
  }

  return (await antwort.json()) as ShopVorstellung[];
}

/**
 * Kommende Vorstellungen, aufbereitet und nach Datum sortiert.
 * Vergangene Termine fallen weg, für sie kann niemand mehr buchen.
 */
export async function kommendeTermine(maxAnzahl = 200): Promise<Vorstellungstermin[]> {
  const jetzt = Date.now();
  const alle = await holeSpielplan();

  return alle
    .filter((v) => v.timestampStart > jetzt)
    .sort((a, b) => a.timestampStart - b.timestampStart)
    .slice(0, maxAnzahl)
    .map(zuTermin);
}

function zuTermin(v: ShopVorstellung): Vorstellungstermin {
  const beginn = new Date(v.timestampStart);
  return {
    ditixEventId: v.id,
    seatmapEventId: v.seatmapEventId,
    seatmapSchemaId: v.seatmapSchemaId,
    datum: isoDatum(beginn),
    uhrzeit: uhrzeit(beginn),
    // Im Spielplan stehen teilweise nachlaufende Leerzeichen.
    name: v.name.trim(),
    ausverkauft: v.ticketSaleState === "SOLD_OUT",
    beginn,
  };
}

/**
 * Der Essensservice des Hauses.
 *
 * Entscheidend fuer alles, was mit Menues zu tun hat: Es gibt pro Tag
 * genau EINEN Essensservice, egal wie viele Vorstellungen an dem Tag
 * laufen. Das Restaurant oeffnet um 17:00, um 18:00 beginnt das Menue,
 * und alle sitzen gleichzeitig im Raum.
 *
 * Daraus folgt, wer wann isst:
 *  - Wer eine Nachmittagsvorstellung hat, isst DANACH.
 *  - Wer eine Abendvorstellung hat, isst DAVOR.
 *
 * Und daraus folgt die wichtigste Regel des Programms: Plaetze und Menues
 * werden pro TAG gezaehlt, nicht pro Vorstellung. Wer pro Vorstellung
 * zaehlt, haelt zwei mal 60 Gaeste fuer unbedenklich, obwohl 120 Menschen
 * gleichzeitig in einem Raum mit 98 Plaetzen sitzen wuerden.
 */
export const RESTAURANT_OEFFNET = "17:00";
export const MENUE_BEGINNT = "18:00";

/**
 * Isst diese Vorstellung vor der Show oder danach?
 *
 * Gemessen am Menuebeginn: Wer spaeter anfaengt als das Essen, isst davor.
 * Alles frueher ist eine Nachmittagsvorstellung, die Gaeste kommen also
 * nach der Show zum Essen.
 */
export function isstVorDerShow(uhrzeitDerShow: string): boolean {
  return uhrzeitDerShow >= MENUE_BEGINNT;
}

/** Alle Vorstellungen eines Tages, nach Uhrzeit sortiert. */
export async function termineDesTages(datum: string): Promise<Vorstellungstermin[]> {
  const alle = await holeSpielplan();
  return alle
    .map(zuTermin)
    .filter((t) => t.datum === datum)
    .sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));
}

/**
 * Zu welchem Tag gehoert eine Vorstellung?
 * Ueber diese Kennung werden Kuechenblatt, Sitzplan und Funktionsheet
 * angesprochen: Sie zeigen immer den ganzen Tag.
 */
export async function tagVon(ditixEventId: string): Promise<string | null> {
  const termin = await findeTermin(ditixEventId);
  return termin?.datum ?? null;
}

/** Anzeigetext für eine Auswahlliste, zum Beispiel "Fr, 13.11.2026, 20:00 Uhr, ULMFASSBAR". */
export function terminBeschriftung(t: Vorstellungstermin): string {
  const tag = t.beginn.toLocaleDateString("de-DE", {
    timeZone: ZEITZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${tag}, ${t.uhrzeit} Uhr, ${t.name}${t.ausverkauft ? " (ausverkauft)" : ""}`;
}

/**
 * Sucht eine Vorstellung anhand ihrer Ditix-Kennung.
 * Wird gebraucht, um zu einem gespeicherten Vorgang die Auslastung zu holen.
 */
export async function findeTermin(ditixEventId: string): Promise<Vorstellungstermin | null> {
  const alle = await holeSpielplan();
  const treffer = alle.find((v) => v.id === ditixEventId);
  return treffer ? zuTermin(treffer) : null;
}
