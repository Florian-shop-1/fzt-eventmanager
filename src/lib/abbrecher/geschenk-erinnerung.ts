/**
 * Woran der Hase das Foyer erinnert: die Geschenke an der Magic-Bar.
 *
 * In 180 Tagen wurde kein einziges Geschenk abgehakt (Stand 12.10.2026).
 * Entweder fragt kaum jemand danach, oder die Liste ist abends schlicht
 * nicht präsent. Deshalb sagt der Hase beim Hereinkommen, wie viele
 * Gäste heute Abend eines bekommen.
 *
 * Nur an Abenden, an denen wirklich etwas bereitliegt: Ein Hinweis, der
 * an leeren Abenden auch kommt, ist nach einer Woche unsichtbar.
 */

import { geschenke } from "./geschenk";

export interface Geschenkstand {
  /** Wie viele Gäste an diesem Abend ein Geschenk abholen können. */
  gaeste: number;
  /** Wie viele Stücke das zusammen sind. */
  stueck: number;
  /** Davon noch nicht ausgegeben. */
  offeneGaeste: number;
  offeneStueck: number;
}

/**
 * Was an einem bestimmten Abend bereitliegt, auch das schon Ausgegebene.
 *
 * Gebraucht für die Foyer-Checkliste: Dort soll der Punkt stehen
 * bleiben und abgehakt aussehen, sobald alles über die Bar ist
 * (Florian, 12.10.2026).
 */
export async function geschenkeAmTag(datum: string): Promise<Geschenkstand | null> {
  const alle = (await geschenke(true).catch(() => []))
    .filter((g) => g.gebuchtDatum === datum);
  if (alle.length === 0) return null;
  const offen = alle.filter((g) => !g.eingeloestAm);
  return {
    gaeste: alle.length,
    stueck: alle.reduce((s, g) => s + g.gilt, 0),
    offeneGaeste: offen.length,
    offeneStueck: offen.reduce((s, g) => s + g.gilt, 0),
  };
}

/** Für den Hasen beim Einstempeln: nur, wenn heute noch etwas offen ist. */
export async function geschenkeHeute(): Promise<Geschenkstand | null> {
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const stand = await geschenkeAmTag(heute);
  return stand && stand.offeneGaeste > 0 ? stand : null;
}
