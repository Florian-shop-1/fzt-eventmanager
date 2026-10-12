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
  /** Wie viele Gäste heute Abend ein Geschenk abholen können. */
  gaeste: number;
  /** Wie viele Stücke das zusammen sind. */
  stueck: number;
}

export async function geschenkeHeute(): Promise<Geschenkstand | null> {
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const offen = (await geschenke().catch(() => []))
    .filter((g) => g.gebuchtDatum === heute && !g.eingeloestAm);
  if (offen.length === 0) return null;
  return {
    gaeste: offen.length,
    stueck: offen.reduce((s, g) => s + g.gilt, 0),
  };
}
