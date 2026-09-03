"use server";

/**
 * Preise einer Vorstellung für die Angebotsvorschau.
 *
 * Die Vorschau läuft im Browser, der Shop wird aber vom Server abgefragt.
 * Deshalb diese kleine Serverfunktion: Sie nimmt die Kennung der gewählten
 * Vorstellung und gibt die Preise als einfaches Objekt zurück.
 *
 * Fehler werden nicht geworfen, sondern gemeldet. Ist der Shop gerade
 * nicht erreichbar, soll die Vorschau weiterlaufen und deutlich sagen,
 * dass mit den Preisen aus dem Artikelstamm gerechnet wird.
 */

import { abendpreise } from "@/lib/ditix/preise";

export interface PreisAntwort {
  /** Artikelnummer zu Bruttopreis in Cent. Leer, wenn nichts gefunden. */
  preise: Record<string, number>;
  /** Artikel, die an diesem Abend anders kosten als im Artikelstamm. */
  abweichungen: Array<{ nummer: string; bezeichnung: string; stammCent: number; ditixCent: number }>;
  fehler: string | null;
}

export async function holeAngebotspreise(ditixEventId: string): Promise<PreisAntwort> {
  try {
    const p = await abendpreise(ditixEventId);
    return {
      preise: Object.fromEntries(p.cent),
      abweichungen: p.abweichungen,
      fehler: null,
    };
  } catch (e) {
    return {
      preise: {},
      abweichungen: [],
      fehler: e instanceof Error ? e.message : "Unbekannter Fehler",
    };
  }
}
