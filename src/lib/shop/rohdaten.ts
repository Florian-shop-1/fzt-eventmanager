/**
 * Liest die Rohdaten der Ticketverkäufe aus der Google-Tabelle.
 *
 * Diese Tabelle wird vom Shop befüllt: eine Zeile je Position einer
 * Bestellung. Sie ist ausführlicher als das aufbereitete Blatt daneben,
 * enthält Kundenname und Firma und reicht weiter zurück.
 *
 * WICHTIG, geprüft am 2026-09-01: Buchungen, die im Ditix-Backend von Hand
 * angelegt werden, landen hier NICHT. Die 53 Zeilen mit dem Ereignistyp
 * `order_manuell_gepflegt` kamen alle am 26.03.2026 auf einmal herein, ein
 * einmaliger Nachtrag. Seit April ist keine einzige mehr dazugekommen.
 *
 * Deshalb gilt: Diese Quelle liefert die Gäste aus dem Webshop, vollständig
 * und verlässlich. Firmenevents kommen aus der eigenen Datenbank. Wer beide
 * addiert, bekommt das vollständige Bild.
 */

import type { MenueVariante } from "@/lib/domain/types";
import { csvZerlegen, menueAenderungen, pruefeTabelle, type MenueAenderung } from "./menueliste";
import { nameOrdentlich } from "@/lib/domain/namen";

const TABELLE_ID =
  process.env.SHOP_MENUELISTE_ID ?? "1Ma0OxVsVdAhNmt9pl2xtx3Pbz2IPAVHkdORSPOUGg2g";
/** Blatt mit den Rohdaten, eine Zeile je Bestellposition. */
const ROHDATEN_GID = process.env.SHOP_ROHDATEN_GID ?? "0";

/** Eine Bestellung aus dem Shop, über ihre Positionen zusammengefasst. */
export interface ShopGruppe {
  orderId: string;
  /** Name des Bestellers. Wird im Sitzplan als Gruppenname verwendet. */
  name: string;
  firma: string | null;
  ditixEventId: string;
  /** Alle Menüs dieser Bestellung. */
  menues: Partial<Record<MenueVariante, number>>;
  menuesGesamt: number;
  /** Sitzplätze im Saal, also gekaufte Showtickets. */
  tickets: number;
  getraenkeArmbaender: number;
  /**
   * Alles, was weder Menue noch Ticket ist, mit Bezeichnung und Menge:
   * Stehtische, Armbaender, Geschenkboxen. Namentlich, denn im Foyer
   * muss klar sein, welcher Tisch fuer wen ist und was darauf gehoert.
   */
  zusatzleistungen: Array<{ bezeichnung: string; menge: number }>;
  /** Wann die Bestellung eingegangen ist. */
  eingegangen: string;
  /** true, wenn die Bestellung im Backend von Hand angelegt wurde. */
  manuell: boolean;
}

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
function istTicket(bezeichnung: string): boolean {
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

/**
 * Holt alle Bestellungen aus dem Rohdatenblatt, so wie sie der Shop
 * gemeldet hat: ohne Storno, ohne Korrektur.
 *
 * Fast ueberall ist holeShopGruppen() gemeint. Die rohe Liste braucht
 * nur, wer zeigen will, was abgezogen wurde (Florian, 04.10.2026).
 */
export async function holeShopGruppenRoh(): Promise<ShopGruppe[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${TABELLE_ID}/export` +
    `?format=csv&gid=${ROHDATEN_GID}`;

  const antwort = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(25000),
  });

  if (!antwort.ok) {
    throw new Error(
      `Die Verkaufsliste konnte nicht gelesen werden (${antwort.status}). ` +
        `Prüfe, ob die Google-Tabelle noch über den Link freigegeben ist.`,
    );
  }

  const inhalt = await antwort.text();
  pruefeTabelle(inhalt, "Die Verkaufsliste");

  const zeilen = csvZerlegen(inhalt);
  if (zeilen.length < 2) return [];

  const kopf = zeilen[0].map((s) => s.trim().toLowerCase());
  const sp = (name: string) => kopf.indexOf(name);

  const iOrder = sp("order_id");
  const iName = sp("customer_name");
  const iFirma = sp("customer_company");
  const iEvent = sp("event_id");
  const iTyp = sp("tickettype_name");
  const iMenge = sp("qty");
  const iZeit = sp("received_at");
  const iArt = sp("event_type");

  if (iOrder < 0 || iEvent < 0 || iTyp < 0) {
    throw new Error(
      "Der Verkaufsliste fehlen Spalten (order_id, event_id oder tickettype_name). " +
        "Wurde die Tabelle umgebaut?",
    );
  }

  const gruppen = new Map<string, ShopGruppe>();

  for (const z of zeilen.slice(1)) {
    if (!z.some((f) => f.trim())) continue;

    const orderId = (z[iOrder] ?? "").trim();
    const eventId = (z[iEvent] ?? "").trim();
    if (!orderId || !eventId) continue;

    // Ein Kunde kann für mehrere Vorstellungen bestellen, deshalb beides
    // im Schlüssel.
    const schluessel = `${orderId}|${eventId}`;

    let g = gruppen.get(schluessel);
    if (!g) {
      const firma = (z[iFirma] ?? "").trim();
      g = {
        orderId,
        // Klein getippte Namen aufrichten: Der Gast hatte es eilig,
        // auf unseren Listen und Schildern soll es trotzdem gut aussehen.
        name: nameOrdentlich((z[iName] ?? "").trim()) || "Ohne Namen",
        firma: firma && firma !== "KEINE ANGABE" ? nameOrdentlich(firma) : null,
        ditixEventId: eventId,
        menues: {},
        menuesGesamt: 0,
        tickets: 0,
        getraenkeArmbaender: 0,
        zusatzleistungen: [],
        eingegangen: (z[iZeit] ?? "").trim(),
        manuell: (z[iArt] ?? "").trim() === "order_manuell_gepflegt",
      };
      gruppen.set(schluessel, g);
    }

    const bezeichnung = (z[iTyp] ?? "").trim();
    const menge = parseInt((z[iMenge] ?? "").trim(), 10);
    if (!Number.isFinite(menge) || menge <= 0) continue;

    const variante = menueVarianteAus(bezeichnung);
    if (variante) {
      g.menues[variante] = (g.menues[variante] ?? 0) + menge;
      g.menuesGesamt += menge;
    } else if (istTicket(bezeichnung)) {
      g.tickets += menge;
    } else {
      // Alles andere bleibt namentlich erhalten. Frueher fielen
      // Stehtische hier stillschweigend heraus, und im Foyer stand dann
      // "1 Stehtisch", ohne zu wissen welcher und fuer wen.
      if (bezeichnung.toLowerCase().includes("armband")) {
        g.getraenkeArmbaender += menge;
      }
      const vorhanden = g.zusatzleistungen.find((z) => z.bezeichnung === bezeichnung);
      if (vorhanden) vorhanden.menge += menge;
      else g.zusatzleistungen.push({ bezeichnung, menge });
    }
  }

  return [...gruppen.values()];
}

/*
  Storno und Korrektur gelten ueberall.

  Diese Liste speist das Funktionsheet, das Kuechenblatt, den Sitzplan
  und die Belegung. Wird eine Bestellung im Eventmanager gestrichen,
  muss sie ueberall verschwinden und nicht nur in einer Summe
  (Florian, 03.10.2026). Der Schluessel ist die Bestellnummer, dieselbe
  wie in der Menueliste.
*/
function anwenden(
  gruppen: ShopGruppe[],
  aenderungen: Map<string, MenueAenderung>,
): ShopGruppe[] {
  const angepasst: ShopGruppe[] = [];
  for (const g of gruppen) {
    const a = aenderungen.get(g.orderId);
    if (a?.art === "storno") continue;
    if (a?.art === "korrektur") {
      const menues: Partial<Record<MenueVariante, number>> = { ...g.menues };
      for (const [variante, menge] of Object.entries(a.mengen)) {
        if (menge !== undefined) menues[variante as MenueVariante] = menge;
      }
      const gesamt = Object.values(menues).reduce((sum, n) => sum + (n ?? 0), 0);
      angepasst.push({ ...g, menues, menuesGesamt: gesamt });
      continue;
    }
    angepasst.push(g);
  }
  return angepasst;
}

/** Alle Bestellungen aus dem Shop, mit Storno und Korrektur. */
export async function holeShopGruppen(): Promise<ShopGruppe[]> {
  const [roh, aenderungen] = await Promise.all([
    holeShopGruppenRoh(),
    menueAenderungen().catch(() => new Map<string, MenueAenderung>()),
  ]);
  return anwenden(roh, aenderungen);
}

/** Was an einem Abend von Hand gestrichen oder korrigiert wurde. */
export interface StornoWirkung {
  /** Menues, die gebucht waren, bevor jemand eingegriffen hat. */
  gebucht: number;
  /** Was dadurch wegfaellt. Positiv heisst: so viele Menues weniger. */
  abgezogen: number;
  /** Davon aus ganz gestrichenen Bestellungen. */
  ausStorno: number;
  /** Davon aus korrigierten Mengen. Negativ, wenn jemand aufgestockt hat. */
  ausKorrektur: number;
  /** Wie viele Bestellungen betroffen sind. */
  stornos: number;
  korrekturen: number;
}

/**
 * Was Storno und Korrektur an diesem Abend ausmachen.
 *
 * Fuer die Anzeige: Eine Zahl, die kleiner geworden ist, erklaert sich
 * nicht von selbst. In der Kueche soll stehen, was gebucht war und was
 * davon abgezogen wurde, sonst sucht jemand den Fehler im Programm
 * (Florian, 04.10.2026).
 */
export async function stornoWirkung(ditixEventId: string): Promise<StornoWirkung> {
  const [roh, aenderungen] = await Promise.all([
    holeShopGruppenRoh(),
    menueAenderungen().catch(() => new Map<string, MenueAenderung>()),
  ]);

  const desAbends = roh.filter((g) => g.ditixEventId === ditixEventId);
  const w: StornoWirkung = {
    gebucht: desAbends.reduce((s, g) => s + g.menuesGesamt, 0),
    abgezogen: 0,
    ausStorno: 0,
    ausKorrektur: 0,
    stornos: 0,
    korrekturen: 0,
  };

  for (const g of desAbends) {
    const a = aenderungen.get(g.orderId);
    if (!a) continue;
    if (a.art === "storno") {
      // Eine gestrichene Bestellung ohne Menue zaehlt nicht als Abzug,
      // sie war ja nie in der Kuechenzahl drin.
      if (g.menuesGesamt > 0) {
        w.stornos += 1;
        w.ausStorno += g.menuesGesamt;
      }
      continue;
    }
    const menues: Partial<Record<MenueVariante, number>> = { ...g.menues };
    for (const [variante, menge] of Object.entries(a.mengen)) {
      if (menge !== undefined) menues[variante as MenueVariante] = menge;
    }
    const nachher = Object.values(menues).reduce((sum, n) => sum + (n ?? 0), 0);
    if (nachher === g.menuesGesamt) continue;
    w.korrekturen += 1;
    w.ausKorrektur += g.menuesGesamt - nachher;
  }

  w.abgezogen = w.ausStorno + w.ausKorrektur;
  return w;
}

/** Alle Shop-Gruppen einer Vorstellung, die ein Menü gebucht haben. */
export async function shopGruppenMitMenue(ditixEventId: string): Promise<ShopGruppe[]> {
  const alle = await holeShopGruppen();
  return alle
    .filter((g) => g.ditixEventId === ditixEventId && g.menuesGesamt > 0)
    .sort((a, b) => b.menuesGesamt - a.menuesGesamt);
}

/**
 * Alle Shop-Bestellungen einer Vorstellung, auch die ohne Menü.
 *
 * Gebraucht für das Funktionsheet: Auch an Abenden ohne Menügäste ist die
 * Gastronomie im Haus, dann eben mit Bar und Foyer. Dafür zählt, wie viele
 * Leute überhaupt kommen.
 */
export async function shopGruppenDesAbends(ditixEventId: string): Promise<ShopGruppe[]> {
  const alle = await holeShopGruppen();
  return alle
    .filter((g) => g.ditixEventId === ditixEventId)
    .sort((a, b) => b.menuesGesamt - a.menuesGesamt || b.tickets - a.tickets);
}
