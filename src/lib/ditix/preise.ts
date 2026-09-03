/**
 * Preise aus dem Ticketshop, je Vorstellung.
 *
 * Der Grund, warum die Preise nicht mehr aus dem Artikelstamm kommen: Sie
 * sind nicht überall gleich. An Weihnachten und zu besonderen Terminen
 * kostet dasselbe Ticket mehr. Wer im Angebot mit einem festen Preis
 * rechnet, schreibt an solchen Tagen einen falschen Betrag hinein.
 *
 * In Ditix ist fast alles ein "Ticket": Showkarten, Menüs, Stehtische,
 * Parkplätze, sogar die Geschenkbox. Nur die Getränkepauschalen für
 * Firmenevents gibt es dort nicht, die bleiben im Artikelstamm.
 *
 * Zwei Quellen im Shop, weil Ditix zwei Sorten kennt:
 *  - Sitzplatzgebundene Karten (Kat. 1 bis 3, Golden Seats, VIP Empore)
 *    haben ihren Preis am Saalplan, abgefragt über seating-prices.
 *  - Alles andere hat einen eigenen Preis, abgefragt über ticket-prices.
 *
 * Gelesen wird über dieselbe öffentliche Shop-Adresse wie der Spielplan,
 * also über den Weg, den jeder Besucher der Seite ohnehin auslöst. Es
 * wird ausschließlich gelesen.
 */

import { artikel } from "@/lib/domain/artikel";
import { findeTermin } from "./spielplan";

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";

/** Eine Ticketart, wie Ditix sie kennt. */
interface Ticketart {
  id: string;
  name: string;
  isActive: boolean;
  isHiddenInShop: boolean;
  seatingPrice?: { seatmapPriceId?: string } | null;
}

interface Betrag {
  amount: number;
  scale: number;
}

/** Rechnet Ditix-Beträge in Cent um, unabhängig von der Nachkommastelle. */
function zuCent(b: Betrag | null | undefined): number | null {
  if (!b || typeof b.amount !== "number") return null;
  // scale 2 heißt: der Betrag steht bereits in Cent.
  return Math.round(b.amount * Math.pow(10, 2 - (b.scale ?? 2)));
}

async function shopPost<T>(pfad: string, koerper: unknown): Promise<T> {
  const antwort = await fetch(`${SHOP_BASIS}/api/ditix/${pfad}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(koerper),
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok) {
    throw new Error(`Der Shop antwortet auf ${pfad} mit ${antwort.status}.`);
  }
  return (await antwort.json()) as T;
}

/** Preis einer Ticketart an einem bestimmten Abend. */
export interface DitixPreis {
  ticketTypeId: string;
  name: string;
  bruttoCent: number;
  /** true, wenn der Preis am Saalplan hängt. */
  ueberSaalplan: boolean;
}

/**
 * Holt alle Preise einer Vorstellung aus dem Shop.
 * Wirft, wenn der Shop nicht erreichbar ist: Ein Angebot mit geratenen
 * Preisen wäre schlimmer als eines, das erst später fertig wird.
 */
export async function preiseDerVorstellung(ditixEventId: string): Promise<DitixPreis[]> {
  const termin = await findeTermin(ditixEventId);
  if (!termin) throw new Error("Diese Vorstellung steht nicht im Spielplan.");

  const arten = await shopPost<Ticketart[]>("ticket-types", { eventId: ditixEventId });
  const brauchbar = arten.filter((a) => a.isActive && !a.isHiddenInShop);
  const ergebnis: DitixPreis[] = [];

  // 1. Alles ohne Sitzplatzbindung: Menüs, Stehtische, Parkplatz, Zubehör.
  const frei = brauchbar.filter((a) => !a.seatingPrice?.seatmapPriceId);
  if (frei.length > 0) {
    const preise = await shopPost<
      Array<{ ticketTypeId: string; name: string; grossPriceWithFees?: Betrag }>
    >("ticket-prices", {
      tickets: frei.map((a) => ({ quantity: 1, ticketType: a.id })),
    });

    for (const p of preise) {
      const cent = zuCent(p.grossPriceWithFees);
      if (cent === null) continue;
      ergebnis.push({
        ticketTypeId: p.ticketTypeId,
        name: p.name,
        bruttoCent: cent,
        ueberSaalplan: false,
      });
    }
  }

  // 2. Die Sitzplatzkarten über den Saalplan.
  const amPlan = brauchbar.filter((a) => a.seatingPrice?.seatmapPriceId);
  if (amPlan.length > 0 && termin.seatmapEventId) {
    const roh = await shopPost<{
      seatingPriceTicketPrices?: Array<{ seatmapPriceId: string; cheapest?: Betrag }>;
    }>("seating-prices", {
      seatmapSchemaId: termin.seatmapSchemaId,
      seatmapEventId: termin.seatmapEventId,
    }).catch(() => null);

    const nachPreisId = new Map<string, number>();
    for (const e of roh?.seatingPriceTicketPrices ?? []) {
      const cent = zuCent(e.cheapest);
      if (cent !== null) nachPreisId.set(String(e.seatmapPriceId), cent);
    }

    for (const a of amPlan) {
      const cent = nachPreisId.get(String(a.seatingPrice!.seatmapPriceId));
      if (cent === undefined) continue;
      ergebnis.push({
        ticketTypeId: a.id,
        name: a.name,
        bruttoCent: cent,
        ueberSaalplan: true,
      });
    }
  }

  return ergebnis;
}

/**
 * Ordnet unsere Artikelnummern den Ticketarten in Ditix zu.
 *
 * Über Muster statt über feste Namen, weil die Bezeichnungen im Shop
 * gepflegt und gelegentlich umbenannt werden. Ausgeschlossen sind die
 * Varianten für Kinder und die POS-Karten für den Verkauf an der Kasse:
 * Im Firmenangebot geht es um den regulären Preis.
 */
const ZUORDNUNG: Array<{ nummer: string; passt: (name: string) => boolean }> = [
  { nummer: "TGS", passt: (n) => /golden seats/i.test(n) },
  { nummer: "TK1", passt: (n) => /^kat\.?\s?1\b/i.test(n) },
  { nummer: "TK2", passt: (n) => /^kat\.?\s?2\b/i.test(n) },
  { nummer: "TK3", passt: (n) => /^kat\.?\s?3\b/i.test(n) },
  { nummer: "4GANG", passt: (n) => /4-gang.*classic/i.test(n) },
  { nummer: "STEHSILVER", passt: (n) => /silver.?stehtisch/i.test(n) },
  { nummer: "STEHGOLD", passt: (n) => /gold.?stehtisch/i.test(n) },
];

/** Kinder- und Kassenvarianten gehören nicht ins Firmenangebot. */
function istSondervariante(name: string): boolean {
  return /kids|pos-|pos ticket/i.test(name);
}

export interface Abendpreise {
  /** Artikelnummer zu Bruttopreis in Cent, so wie er an diesem Abend gilt. */
  cent: Map<string, number>;
  /** Artikel, deren Preis vom Artikelstamm abweicht. Für den Hinweis im Angebot. */
  abweichungen: Array<{ nummer: string; bezeichnung: string; stammCent: number; ditixCent: number }>;
  /** Was nicht in Ditix steht und weiter aus dem Artikelstamm kommt. */
  ausStamm: string[];
}

/**
 * Baut die Preisliste für ein Angebot zu einer bestimmten Vorstellung.
 *
 * Was Ditix kennt, kommt aus Ditix. Was Ditix nicht kennt, etwa die
 * Getränkepauschalen für Firmen und der Magicuvée-Empfang, bleibt beim
 * Artikelstamm. Die Steuersätze kommen immer aus dem Artikelstamm: Ditix
 * liefert nur Bruttobeträge.
 */
export async function abendpreise(ditixEventId: string): Promise<Abendpreise> {
  const ausShop = await preiseDerVorstellung(ditixEventId);
  const cent = new Map<string, number>();
  const abweichungen: Abendpreise["abweichungen"] = [];

  for (const { nummer, passt } of ZUORDNUNG) {
    const treffer = ausShop.find((p) => !istSondervariante(p.name) && passt(p.name));
    if (!treffer) continue;

    cent.set(nummer, treffer.bruttoCent);

    const stamm = artikel(nummer);
    if (stamm.bruttoCent !== treffer.bruttoCent) {
      abweichungen.push({
        nummer,
        bezeichnung: stamm.bezeichnung,
        stammCent: stamm.bruttoCent,
        ditixCent: treffer.bruttoCent,
      });
    }
  }

  // Das Logenmenü gibt es in Ditix nicht, es ist unser eigener Aufschlag
  // auf das reguläre Menü. Damit es an teuren Terminen mitwandert, wird
  // der Aufschlag aus dem Artikelstamm auf den Ditix-Preis gerechnet.
  const menueDitix = cent.get("4GANG");
  if (menueDitix !== undefined) {
    const aufschlag = artikel("4GANGLOGE").bruttoCent - artikel("4GANG").bruttoCent;
    cent.set("4GANGLOGE", menueDitix + aufschlag);
  }

  return {
    cent,
    abweichungen,
    ausStamm: ["FLATSOFT", "FLATBIERWEIN", "FLATALL", "EMPFANG"],
  };
}
