/**
 * Wer in der Ditix-Zeit zusammen gebucht hat, Platz für Platz.
 *
 * Ditix gibt diese Zuordnung nicht über eine Schnittstelle heraus, in der
 * Verwaltung steht sie aber bei jeder Bestellung. Sie wird dort einmal je
 * Vorstellung abgelesen und hier abgelegt. Für alles, was über FloTix
 * verkauft wird, braucht es das nicht: Dort hängt die Buchung am Platz
 * (siehe lib/flotix/tuer.ts, flotixSitzgruppen).
 *
 * Warum der Aufwand: Die Upgrades setzen Gruppen nach vorne, und eine
 * Gruppe ist eine Buchung. Ohne diese Zuordnung wird sie aus der
 * Sitzordnung geraten, und nebeneinander heißt nicht zusammen. Am
 * 23.10.2026 standen acht Plätze als eine Gruppe da; es waren zwei
 * Buchungen (Florian, 20.10.2026).
 */

import { db } from "@/lib/db/client";

export interface SitzZeile {
  sektor: string;
  reihe: string;
  platz: string;
  bestellung: string;
  name?: string | null;
}

/** Der Schlüssel, unter dem ein Platz überall gesucht wird. */
export function platzSchluessel(s: { sektor: string; reihe: string; platz: string }): string {
  return `${s.sektor.trim()}|${s.reihe.trim()}|${s.platz.trim()}`;
}

/**
 * Die abgelesenen Plätze einer Vorstellung sichern.
 *
 * Wiederholbar: Steht ein Platz schon drin, wird er überschrieben. So
 * lässt sich eine Vorstellung nach einer Umbuchung einfach neu einlesen.
 */
export async function sitzgruppenSpeichern(
  ditixEventId: string,
  zeilen: SitzZeile[],
): Promise<number> {
  let n = 0;
  for (const z of zeilen) {
    if (!z.sektor?.trim() || !z.reihe?.trim() || !z.platz?.trim() || !z.bestellung?.trim()) continue;
    await db()`
      insert into ditix_sitzgruppe (ditix_event_id, sektor, reihe, platz, bestellung, name)
      values (${ditixEventId}, ${z.sektor.trim()}, ${z.reihe.trim()}, ${z.platz.trim()},
              ${z.bestellung.trim()}, ${z.name?.trim() || null})
      on conflict (ditix_event_id, sektor, reihe, platz) do update
        set bestellung = excluded.bestellung, name = excluded.name, erfasst_am = now()
    `;
    n += 1;
  }
  return n;
}

/**
 * Platz zu Bestellung für eine Vorstellung, leer wenn nichts erfasst ist.
 *
 * Es dürfen mehrere Kennungen hereinkommen: Abgelegt ist alles unter der
 * Ditix-Kennung, der Spielplan nennt seit dem Umschalttag aber die aus
 * FloTix. Wer beide mitgibt, findet seine Plätze in jedem Fall.
 */
export async function ditixSitzgruppen(
  kennung: string | string[],
): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  const ids = (Array.isArray(kennung) ? kennung : [kennung]).filter((k) => k && k.trim());
  if (ids.length === 0) return karte;

  const z = (await db()`
    select sektor, reihe, platz, bestellung
      from ditix_sitzgruppe where ditix_event_id = any(${ids}::text[])
  `.catch(() => [])) as Array<Record<string, unknown>>;

  for (const r of z) {
    karte.set(
      platzSchluessel({ sektor: String(r.sektor), reihe: String(r.reihe), platz: String(r.platz) }),
      String(r.bestellung),
    );
  }
  return karte;
}

/** Welche Vorstellungen schon erfasst sind, mit Anzahl der Plätze. */
export async function erfassteVorstellungen(): Promise<Array<{ eventId: string; plaetze: number }>> {
  const z = (await db()`
    select ditix_event_id, count(*)::int as n
      from ditix_sitzgruppe group by ditix_event_id order by ditix_event_id
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({ eventId: String(r.ditix_event_id), plaetze: Number(r.n) }));
}
