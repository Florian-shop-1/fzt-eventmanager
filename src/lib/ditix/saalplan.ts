/**
 * Der Saalplan einer Vorstellung, Platz für Platz.
 *
 * Wie beim Spielplan gilt: nur lesen. Geholt wird über dieselbe
 * öffentliche Adresse, die auch jeder Besucher aufruft, wenn er im Shop
 * seine Plätze aussucht. Der Stand ist damit immer der echte.
 *
 * Die Antwort ist platzsparend abgelegt und muss erst ausgepackt werden.
 * Drei Dinge sind dabei wichtig, und das dritte hat mich einen Anlauf
 * gekostet:
 *
 *  - `layout.plainSeats` hält die Sitze in gleich langen Zahlenreihen:
 *    Namen, Kennungen, x, y, Reihe, Sektor. Alle Zahlenreihen sind
 *    aufsummiert zu lesen, der erste Wert absolut, jeder weitere die
 *    Differenz zum vorherigen.
 *
 *  - `prices.seats` ist eine Liste aus [Sitzkennung, Preiskennung, {},
 *    Status]. Status ist ACTIVE (frei), SOLD (verkauft) oder BLOCKED
 *    (gesperrt).
 *
 *  - Auch die Kennungen in `layout.sectors` und `layout.rows` sind
 *    aufsummiert. Wer sie für sich stehende Werte hält, findet zu fast
 *    keinem Sitz die Reihe, denn dort stehen dann lauter Einsen und
 *    Fünfziger statt der echten Nummern.
 */

const SHOP_BASIS = process.env.SHOP_API_URL ?? "https://shop.florianzimmertheater.de";

/** Verkaufsstand eines einzelnen Platzes. */
export type Sitzstatus = "frei" | "verkauft" | "gesperrt";

export interface Sitz {
  id: number;
  /** Die Platznummer, wie sie auf der Karte steht. */
  name: string;
  /** Reihennummer innerhalb des Sektors. */
  reihe: string;
  /** "Kat. 1", "Golden Seats", "VIP Empore", "Rollstuhl" und so weiter. */
  sektor: string;
  /** Preiskategorie laut Ticketshop. Meist gleich dem Sektor, nicht immer. */
  kategorie: string;
  /** Lage im Saal. Kleines y ist vorne, an der Bühne. */
  x: number;
  y: number;
  status: Sitzstatus;
  /**
   * Warum dieser Platz gesperrt ist, falls jemand einen Grund eingetragen hat.
   *
   * Wichtig fuer das Umsetzen: Ein Platz, der schlicht nicht im Verkauf
   * ist, steht am Abend trotzdem im Saal und darf bespielt werden. Ein
   * Platz mit Grund ist aus einem Grund gesperrt und bleibt leer.
   */
  sperrgrund: string | null;
}

export interface Saalplan {
  sitze: Sitz[];
  /** Die Zeichnung des Saals aus dem Ticketshop, für den Hintergrund. */
  hintergrund: { svg: string; sichtfeld: { x: number; y: number; width: number; height: number } } | null;
  frei: number;
  verkauft: number;
  gesperrt: number;
}

interface Rohplan {
  layout?: {
    rows?: Array<{ id: number; rowNumber: string; sectorId: number }>;
    sectors?: Array<{ id: number; name: string }>;
    plainSeats?: {
      names?: string[];
      ids?: number[];
      x?: number[];
      y?: number[];
      rowIds?: number[];
      sectorIds?: number[];
    };
    background?: { svg?: string; viewBox?: { x: number; y: number; width: number; height: number } };
  };
  prices?: {
    seats?: Array<[number, number, unknown, string]>;
    prices?: Array<{ id: number; name: string }>;
  };
}

/** Macht aus einer aufsummierten Zahlenreihe die echten Werte. */
function auffalten(reihe: number[] | undefined): number[] {
  const raus: number[] = [];
  let wert = 0;
  for (const abstand of reihe ?? []) {
    wert += abstand;
    raus.push(wert);
  }
  return raus;
}

const STATUS: Record<string, Sitzstatus> = {
  ACTIVE: "frei",
  SOLD: "verkauft",
  BLOCKED: "gesperrt",
};

/** Holt den Saalplan einer Vorstellung. */
export async function holeSaalplan(seatmapEventId: string): Promise<Saalplan> {
  const antwort = await fetch(`${SHOP_BASIS}/api/ditix/seatmap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatmapEventId }),
    // Kurz zwischenspeichern. Am Einlass zählt der aktuelle Stand, aber
    // sekündlich ändert sich nichts, und der Shop soll nicht bei jedem
    // Seitenaufruf antworten müssen.
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    throw new Error(`Der Saalplan konnte nicht geladen werden (${antwort.status}).`);
  }

  return entschluesseln((await antwort.json()) as Rohplan);
}

/**
 * Der Saalplan direkt aus FloTix, mit dem echten Stand (Florian, 23.10.2026).
 *
 * Der Weg ueber den Shop zeigt, was ein Gast sieht: Plaetze, die die Automatik zurueckhaelt, stehen dort als verkauft.
 * Beim Saalplan-Upgrade sind sie aber in Wirklichkeit frei. Hier kommen sie deshalb als "gesperrt" an: grau gezeichnet,
 * aber benutzbar, so wie es zu Ditix-Zeiten mit den gesperrten Plaetzen war. Verkauft ist nur, was wirklich verkauft ist.
 *
 * Die Platzkennungen sind dieselben wie auf dem Weg ueber den Shop (1.000.000 plus die Stelle in der Liste), damit
 * bereits gespeicherte Umsetzungen weiter zum selben Platz gehoeren. Die Liste kommt in derselben Reihenfolge und ohne
 * Plaetze, die keine Lage auf dem Plan haben.
 */
export async function holeSaalplanFlotix(vorstellungId: string): Promise<Saalplan> {
  const schluessel = (process.env.FLOTIX_KEY ?? "").trim();
  const basis = process.env.FLOTIX_URL ?? "https://flotix.florianzimmertheater.de";
  const antwort = await fetch(`${basis}/api/shop?aktion=saalplan&id=${encodeURIComponent(vorstellungId)}&intern=1`, {
    headers: { "x-eventmanager-key": schluessel },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(20000),
  });
  if (!antwort.ok) throw new Error(`Der Saalplan konnte nicht aus FloTix geladen werden (${antwort.status}).`);

  const daten = (await antwort.json()) as {
    plaetze?: Array<{ zustand: string; bereich: string; reihe: string; platz: string; kategorie: string; x: number | null; y: number | null; sperrgrund?: string | null }>;
  };
  const alle = (daten.plaetze ?? []).filter((p) => p.x !== null && p.y !== null);

  const sitze: Sitz[] = alle.map((p, i) => ({
    id: 1_000_000 + i,
    name: p.platz,
    reihe: p.reihe,
    sektor: p.bereich,
    kategorie: p.kategorie,
    x: Math.round(Number(p.x)),
    y: Math.round(Number(p.y)),
    status: p.zustand === "frei" ? "frei" : p.zustand === "verkauft" ? "verkauft" : "gesperrt",
    sperrgrund: (p.sperrgrund as string | null) ?? null,
  }));

  return {
    sitze,
    hintergrund: null,
    frei: sitze.filter((s) => s.status === "frei").length,
    verkauft: sitze.filter((s) => s.status === "verkauft").length,
    gesperrt: sitze.filter((s) => s.status === "gesperrt").length,
  };
}

/** Packt die Antwort aus dem Ticketshop zu einer Liste echter Plätze aus. */
export function entschluesseln(roh: Rohplan): Saalplan {
  const p = roh.layout?.plainSeats ?? {};

  // Sektoren und Reihen tragen ihre Kennung ebenfalls aufsummiert.
  const sektorIds = auffalten((roh.layout?.sectors ?? []).map((s) => s.id));
  const sektorName = new Map<number, string>();
  (roh.layout?.sectors ?? []).forEach((s, i) => sektorName.set(sektorIds[i], s.name));

  const reihenIds = auffalten((roh.layout?.rows ?? []).map((r) => r.id));
  const reihe = new Map<number, { nummer: string; sektorId: number }>();
  (roh.layout?.rows ?? []).forEach((r, i) =>
    reihe.set(reihenIds[i], { nummer: r.rowNumber, sektorId: r.sectorId }),
  );

  const kategorieName = new Map((roh.prices?.prices ?? []).map((k) => [k.id, k.name]));
  const status = new Map<number, string>();
  const preisId = new Map<number, number>();
  for (const [sitzId, pid, , st] of roh.prices?.seats ?? []) {
    status.set(sitzId, st);
    preisId.set(sitzId, pid);
  }

  const ids = auffalten(p.ids);
  const x = auffalten(p.x);
  const y = auffalten(p.y);
  const reihenZuordnung = auffalten(p.rowIds);
  const sektorZuordnung = auffalten(p.sectorIds);
  const namen = p.names ?? [];

  const sitze: Sitz[] = ids.map((id, i) => {
    const r = reihe.get(reihenZuordnung[i]);
    return {
      id,
      name: namen[i] ?? "",
      reihe: r?.nummer ?? "?",
      sektor: sektorName.get(r?.sektorId ?? sektorZuordnung[i]) ?? "?",
      kategorie: kategorieName.get(preisId.get(id) ?? -1) ?? "?",
      x: x[i],
      y: y[i],
      status: STATUS[status.get(id) ?? ""] ?? "gesperrt",
      // Ditix kannte keinen Sperrgrund, dort war gesperrt gleich gesperrt.
      sperrgrund: null,
    };
  });

  const hg = roh.layout?.background;
  return {
    sitze,
    hintergrund: hg?.svg && hg.viewBox ? { svg: hg.svg, sichtfeld: hg.viewBox } : null,
    frei: sitze.filter((s) => s.status === "frei").length,
    verkauft: sitze.filter((s) => s.status === "verkauft").length,
    gesperrt: sitze.filter((s) => s.status === "gesperrt").length,
  };
}
