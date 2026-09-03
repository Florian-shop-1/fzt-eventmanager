/**
 * Auslastung einer Vorstellung aus dem Ticketshop.
 *
 * Wie beim Spielplan gilt: nur lesen. Der Saalplan wird über dieselbe
 * öffentliche Adresse geholt, die auch jeder Besucher aufruft, wenn er
 * im Shop seine Plätze aussucht.
 *
 * Zum Aufbau der Antwort, weil sie ungewöhnlich ist:
 *  - `layout.plainSeats` enthält die Sitzgeometrie in platzsparender Form.
 *    Die Zahlenreihen sind aufsummiert zu lesen: der erste Wert ist absolut,
 *    jeder weitere ist die Differenz zum vorherigen.
 *  - `prices.seats` ist eine Liste aus [Sitz-ID, Preis-ID, {}, Status].
 *    Status ist ACTIVE (frei), SOLD (verkauft) oder BLOCKED (gesperrt).
 *  - `prices.prices` ordnet der Preis-ID den Kategorienamen zu, also
 *    "Kat. 1", "VIP Empore", "Golden Seats" und so weiter.
 */

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";

export interface KategorieAuslastung {
  name: string;
  frei: number;
  verkauft: number;
  gesperrt: number;
  gesamt: number;
}

export interface Auslastung {
  kategorien: KategorieAuslastung[];
  frei: number;
  verkauft: number;
  gesperrt: number;
  gesamt: number;
  /** Verkaufte Plätze in Prozent, gerundet. */
  prozent: number;
}

interface SaalplanAntwort {
  prices?: {
    seats?: Array<[number, number, unknown, string]>;
    prices?: Array<{ id: number; name: string }>;
  };
}

/**
 * Holt die Auslastung einer Vorstellung.
 * @param seatmapEventId Kennung aus dem Spielplan, Feld `seatmapEventId`.
 */
export async function holeAuslastung(seatmapEventId: string): Promise<Auslastung> {
  const antwort = await fetch(`${SHOP_BASIS}/api/ditix/seatmap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatmapEventId }),
    // Fünf Minuten zwischenspeichern: Verkaufszahlen ändern sich laufend,
    // aber nicht sekündlich.
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    throw new Error(`Der Saalplan konnte nicht geladen werden (${antwort.status}).`);
  }

  return auswerten((await antwort.json()) as SaalplanAntwort);
}

/** Zählt die Sitze je Kategorie und Status zusammen. */
export function auswerten(daten: SaalplanAntwort): Auslastung {
  const sitze = daten.prices?.seats ?? [];
  const kategorieName = new Map((daten.prices?.prices ?? []).map((p) => [p.id, p.name]));

  const zaehler = new Map<string, KategorieAuslastung>();
  let frei = 0;
  let verkauft = 0;
  let gesperrt = 0;

  for (const [, preisId, , status] of sitze) {
    const name = kategorieName.get(preisId) ?? `Kategorie ${preisId}`;
    let k = zaehler.get(name);
    if (!k) {
      k = { name, frei: 0, verkauft: 0, gesperrt: 0, gesamt: 0 };
      zaehler.set(name, k);
    }

    if (status === "ACTIVE") {
      k.frei += 1;
      frei += 1;
    } else if (status === "SOLD") {
      k.verkauft += 1;
      verkauft += 1;
    } else {
      // Alles andere als frei oder verkauft gilt als gesperrt.
      k.gesperrt += 1;
      gesperrt += 1;
    }
    k.gesamt += 1;
  }

  const gesamt = frei + verkauft + gesperrt;

  return {
    kategorien: [...zaehler.values()].sort((a, b) => b.gesamt - a.gesamt),
    frei,
    verkauft,
    gesperrt,
    gesamt,
    prozent: gesamt > 0 ? Math.round((verkauft / gesamt) * 100) : 0,
  };
}
