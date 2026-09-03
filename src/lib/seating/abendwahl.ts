/**
 * Welcher Abend ist gemeint?
 *
 * Im Alltag arbeitet man an einem Tag: erst der Sitzplan, dann die
 * Parkplätze, dann das Funktionsheet, und immer geht es um denselben
 * Abend. Deshalb wandert die Wahl von Seite zu Seite mit.
 *
 * Die Reihenfolge, in der entschieden wird:
 *  1. Was in der Adresse steht. Ein Link auf einen bestimmten Abend
 *     gewinnt immer, sonst wäre er nutzlos.
 *  2. Der zuletzt angesehene Abend, gemerkt im Proxy.
 *  3. Heute, falls heute gespielt wird. Das ist der häufigste Fall:
 *     Wer das Programm öffnet, will meistens wissen, was heute los ist.
 *  4. Der nächste Termin.
 */

import { cookies } from "next/headers";
import { isoDatum } from "@/lib/zeit";

interface AbendAehnlich {
  ditixEventId: string;
  datum: string;
}

export interface Abendwahl {
  /** Kennung des zu zeigenden Abends. */
  gewaehlt: string | undefined;
  /** Monat, der in der Auswahl aufgeschlagen sein soll. */
  monat: string | undefined;
  /** Heutiges Datum als JJJJ-MM-TT, für die Hervorhebung. */
  heute: string;
}

export async function waehleAbend(
  termine: AbendAehnlich[],
  ausAdresse: { abend?: string; monat?: string },
): Promise<Abendwahl> {
  const heute = isoDatum(new Date());
  const kekse = await cookies();

  const gemerkterAbend = kekse.get("fzt_abend")?.value;
  const gemerkterMonat = kekse.get("fzt_monat")?.value;

  // Ein gemerkter Abend zählt nur, wenn es ihn hier auch gibt: Die
  // Parkplatzseite kennt andere Tage als der Sitzplan, der nur Abende mit
  // Gästen zeigt.
  const kennt = (id: string | undefined) =>
    Boolean(id && termine.some((t) => t.ditixEventId === id));

  const imMonat = (monat: string | undefined) =>
    monat ? termine.filter((t) => t.datum.startsWith(monat)) : [];

  const heutiger = termine.find((t) => t.datum === heute);

  const gewaehlt =
    (kennt(ausAdresse.abend) ? ausAdresse.abend : undefined) ??
    imMonat(ausAdresse.monat)[0]?.ditixEventId ??
    (kennt(gemerkterAbend) ? gemerkterAbend : undefined) ??
    heutiger?.ditixEventId ??
    imMonat(gemerkterMonat)[0]?.ditixEventId ??
    termine[0]?.ditixEventId;

  const monat =
    ausAdresse.monat ??
    termine.find((t) => t.ditixEventId === gewaehlt)?.datum.slice(0, 7) ??
    gemerkterMonat;

  return { gewaehlt, monat, heute };
}
