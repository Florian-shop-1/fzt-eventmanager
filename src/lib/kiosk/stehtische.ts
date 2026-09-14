/**
 * Stehtische je Vorstellung, für den Food-Kiosk.
 *
 * Auf jeden Stehtisch gehört eine Zauberschnitte (Pinsa) zum Teilen. Der
 * Kiosk bereitet sie zu und bringt sie kurz vor der Pause an den Tisch.
 *
 * Was diese Datei verlässt, sind nur Zahlen: Uhrzeit, Art des Tisches,
 * Anzahl. Die Bestellungen dahinter tragen Namen, die bleiben hier. Der
 * Kiosk ist ein externer Partner und bekommt keine Kundendaten und keine
 * Gästezahlen zu sehen (migrations/034_rolle_kiosk.sql).
 */

import { kommendeTermine, termineDesTages, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { holeShopGruppen } from "@/lib/shop/rohdaten";
import { isoDatum } from "@/lib/zeit";

/** Die Pause beginnt etwa 50 Minuten bis eine Stunde nach Showbeginn. */
export const PAUSE_AB_MINUTEN = 50;
export const PAUSE_BIS_MINUTEN = 60;

/** Wie weit die Liste in die Zukunft reicht. */
const TAGE_VORAUS = 28;

export interface KioskShow {
  ditixEventId: string;
  uhrzeit: string;
  name: string;
  stehtische: number;
  /** Zum Beispiel [{ art: "Gold", anzahl: 2 }]. */
  nachArt: Array<{ art: string; anzahl: number }>;
  pauseAb: string;
  pauseBis: string;
}

export interface KioskTag {
  datum: string;
  shows: KioskShow[];
}

function art(bezeichnung: string): string {
  const k = bezeichnung.toLowerCase();
  if (k.includes("diamond")) return "Diamond";
  if (k.includes("gold")) return "Gold";
  if (k.includes("silver") || k.includes("silber")) return "Silver";
  return "Stehtisch";
}

function plusMinuten(hhmm: string, minuten: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const gesamt = h * 60 + m + minuten;
  return `${String(Math.floor(gesamt / 60) % 24).padStart(2, "0")}:${String(gesamt % 60).padStart(2, "0")}`;
}

export async function stehtischeKommenderAbende(
  jetzt: Date = new Date(),
): Promise<{ tage: KioskTag[]; fehler: string | null }> {
  const heute = isoDatum(jetzt);
  const bis = new Date(jetzt.getTime() + TAGE_VORAUS * 24 * 60 * 60 * 1000);
  const bisIso = isoDatum(bis);

  // Heute auch die Shows, die schon laufen: Die Pause kommt ja erst noch.
  const [heutige, kommende] = await Promise.all([termineDesTages(heute), kommendeTermine(400)]);
  const termine = new Map<string, Vorstellungstermin>();
  for (const t of [...heutige, ...kommende]) {
    if (t.datum >= heute && t.datum <= bisIso) termine.set(t.ditixEventId, t);
  }

  // Stehtische je Vorstellung und Art. Namen werden hier nicht übernommen.
  const zaehler = new Map<string, Map<string, number>>();
  let fehler: string | null = null;
  try {
    for (const g of await holeShopGruppen()) {
      if (!termine.has(g.ditixEventId)) continue;
      for (const z of g.zusatzleistungen) {
        if (!z.bezeichnung.toLowerCase().includes("stehtisch") || z.menge <= 0) continue;
        const jeArt = zaehler.get(g.ditixEventId) ?? new Map<string, number>();
        jeArt.set(art(z.bezeichnung), (jeArt.get(art(z.bezeichnung)) ?? 0) + z.menge);
        zaehler.set(g.ditixEventId, jeArt);
      }
    }
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const nachTag = new Map<string, KioskShow[]>();
  for (const t of [...termine.values()].sort((a, b) => a.beginn.getTime() - b.beginn.getTime())) {
    const jeArt = zaehler.get(t.ditixEventId) ?? new Map<string, number>();
    const nachArt = [...jeArt].map(([a, anzahl]) => ({ art: a, anzahl }));
    const show: KioskShow = {
      ditixEventId: t.ditixEventId,
      uhrzeit: t.uhrzeit,
      name: t.name,
      stehtische: nachArt.reduce((s, x) => s + x.anzahl, 0),
      nachArt,
      pauseAb: plusMinuten(t.uhrzeit, PAUSE_AB_MINUTEN),
      pauseBis: plusMinuten(t.uhrzeit, PAUSE_BIS_MINUTEN),
    };
    nachTag.set(t.datum, [...(nachTag.get(t.datum) ?? []), show]);
  }

  return { tage: [...nachTag].map(([datum, shows]) => ({ datum, shows })), fehler };
}
