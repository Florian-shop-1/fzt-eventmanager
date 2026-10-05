/**
 * Wer an diesem Abend eingeteilt ist.
 *
 * Gebraucht fuer die geteilten Zugaenge: Am Tablet meldet sich niemand
 * persoenlich an, trotzdem soll an jedem Haken ein Name stehen. Statt
 * tippen zu lassen, bietet die Liste die Leute des Abends an, und wer
 * nicht dabei ist, schreibt sich selbst dazu (Florian, 05.10.2026).
 *
 * Zwei Quellen, je nach Liste: der Dienstplan des Showteams und der
 * Foyer-Dienstplan.
 */

import { db } from "@/lib/db/client";
import type { Liste } from "./db";

export async function namenImDienst(o: {
  liste: Liste;
  /** Alle Vorstellungen des Tages. */
  eventIds: string[];
  /** JJJJ-MM-TT, fuer den Foyerplan. */
  datum: string;
}): Promise<string[]> {
  try {
    if (o.liste === "foyer") {
      const z = (await db()`
        select b.name
          from foyer_dienst d
          join benutzer b on b.id = d.benutzer_id
         where d.datum = ${o.datum}::date
         order by d.nummer
      `) as Array<{ name: string }>;
      return eindeutig(z.map((r) => String(r.name)));
    }

    if (o.eventIds.length === 0) return [];
    const z = (await db()`
      select b.name
        from dienst_einsatz e
        join benutzer b on b.id = e.benutzer_id
       where e.ditix_event_id = any(${o.eventIds})
       order by e.position
    `) as Array<{ name: string }>;
    return eindeutig(z.map((r) => String(r.name)));
  } catch (f) {
    // Ohne Vorschlagsliste kann man den Namen immer noch schreiben.
    console.error("[showcheck] Namen des Abends nicht lesbar:", f);
    return [];
  }
}

function eindeutig(namen: string[]): string[] {
  return [...new Set(namen.filter(Boolean))];
}
