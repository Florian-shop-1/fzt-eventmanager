/**
 * Eine fremde Schicht übernehmen, um jemanden zu entlasten. Siehe
 * migrations/089_schicht_uebernahme.sql.
 *
 * Gehört die Schicht einer Aushilfe, übernimmt der Anbietende sofort, die
 * Zeile hier ist dann nur das Protokoll. Gehört sie jemand
 * Festangestelltem, bleibt sie offen, bis Florian oder Kevin annehmen
 * oder ablehnen (Florian, 28.09.2026).
 */

import { db } from "@/lib/db/client";

export type Bereich = "show" | "foyer";
export type UebernahmeStatus = "offen" | "angenommen" | "abgelehnt";

export interface UebernahmeAntrag {
  id: string;
  bereich: Bereich;
  ditixEventId: string | null;
  position: string | null;
  foyerDienstId: string | null;
  bisherigerId: string;
  bisherigerName: string;
  anbieterId: string;
  anbieterName: string;
  status: UebernahmeStatus;
  antwort: string;
  erstelltAm: string;
  entschiedenVon: string | null;
}

function zeile(r: Record<string, unknown>): UebernahmeAntrag {
  return {
    id: String(r.id),
    bereich: r.bereich as Bereich,
    ditixEventId: (r.ditix_event_id as string) ?? null,
    position: (r.position as string) ?? null,
    foyerDienstId: (r.foyer_dienst_id as string) ?? null,
    bisherigerId: String(r.bisheriger_id),
    bisherigerName: String(r.bisheriger_name),
    anbieterId: String(r.anbieter_id),
    anbieterName: String(r.anbieter_name),
    status: r.status as UebernahmeStatus,
    antwort: String(r.antwort ?? ""),
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
    entschiedenVon: (r.entschieden_von as string) ?? null,
  };
}

const SPALTEN = `id, bereich, ditix_event_id, position, foyer_dienst_id, bisheriger_id, bisheriger_name,
  anbieter_id, anbieter_name, status, antwort, erstellt_am, entschieden_von`;

/**
 * Legt die Anfrage an. sofortAngenommen = true (Aushilfe) schreibt sie
 * gleich als 'angenommen' weg, damit sie zugleich als Protokoll dient; die
 * eigentliche Umbuchung (dienst_einsatz / foyer_dienst) macht der
 * aufrufende Code selbst, dieser Aufruf ändert daran nichts.
 */
export async function uebernahmeAnbieten(o: {
  bereich: Bereich;
  ditixEventId?: string | null;
  position?: string | null;
  foyerDienstId?: string | null;
  bisherigerId: string;
  bisherigerName: string;
  anbieterId: string;
  anbieterName: string;
  sofortAngenommen: boolean;
}): Promise<string> {
  const z = (await db()`
    insert into schicht_uebernahme
      (bereich, ditix_event_id, position, foyer_dienst_id, bisheriger_id, bisheriger_name,
       anbieter_id, anbieter_name, status, entschieden_von, entschieden_am)
    values (${o.bereich}, ${o.ditixEventId ?? null}, ${o.position ?? null}, ${o.foyerDienstId ?? null},
            ${o.bisherigerId}, ${o.bisherigerName}, ${o.anbieterId}, ${o.anbieterName},
            ${o.sofortAngenommen ? "angenommen" : "offen"},
            ${o.sofortAngenommen ? "automatisch, Aushilfe" : null},
            ${o.sofortAngenommen ? new Date() : null})
    returning id
  `) as Array<{ id: string }>;
  return z[0].id;
}

export async function offeneUebernahmen(bereich: Bereich): Promise<UebernahmeAntrag[]> {
  const z = (await db()`
    select ${db().unsafe(SPALTEN)} from schicht_uebernahme
     where bereich = ${bereich} and status = 'offen'
     order by erstellt_am
  `) as Array<Record<string, unknown>>;
  return z.map(zeile);
}

export async function uebernahmeLesen(id: string): Promise<UebernahmeAntrag | null> {
  const z = (await db()`
    select ${db().unsafe(SPALTEN)} from schicht_uebernahme where id = ${id}
  `) as Array<Record<string, unknown>>;
  return z[0] ? zeile(z[0]) : null;
}

export async function uebernahmeEntscheiden(
  id: string,
  status: "angenommen" | "abgelehnt",
  antwort: string,
  von: string,
): Promise<UebernahmeAntrag | null> {
  const z = (await db()`
    update schicht_uebernahme
       set status = ${status}, antwort = ${antwort}, entschieden_von = ${von}, entschieden_am = now()
     where id = ${id} and status = 'offen'
    returning ${db().unsafe(SPALTEN)}
  `) as Array<Record<string, unknown>>;
  return z[0] ? zeile(z[0]) : null;
}
