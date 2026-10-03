/**
 * Die Show-Checkliste. Siehe migrations/133_showcheck.sql.
 *
 * Drei Listen je Vorstellung: vor der Show, in der Pause, nach der Show.
 * Abgehakt wird je Vorstellung, nicht je Tag: Laufen zwei Shows, hat jede
 * ihre eigene Liste, denn die Kerze muss zweimal brennen.
 *
 * Die Punkte stehen in der Datenbank, nicht im Programmtext. Eine
 * Checkliste ändert sich mit jeder neuen Nummer, und dafür soll niemand
 * den Eventmanager neu bauen müssen (Florian, 03.10.2026).
 */

import { db } from "@/lib/db/client";

export type Bereich = "vor_show" | "pause" | "nach_show";

export const BEREICHE: Bereich[] = ["vor_show", "pause", "nach_show"];

export const BEREICH_TITEL: Record<Bereich, string> = {
  vor_show: "Vor der Show",
  pause: "In der Pause",
  nach_show: "Nach der Show",
};

export interface Punkt {
  id: string;
  bereich: Bereich;
  text: string;
  reihenfolge: number;
  /** Gesetzt, wenn er für diese Vorstellung schon abgehakt ist. */
  erledigtVon: string | null;
  erledigtAm: string | null;
}

/** Alle Punkte einer Vorstellung, mit dem Stand des Abends. */
export async function checkliste(ditixEventId: string): Promise<Punkt[]> {
  const z = (await db()`
    select p.id, p.bereich, p.text, p.reihenfolge, h.erledigt_von, h.erledigt_am
      from showcheck_punkt p
      left join showcheck_haken h
        on h.punkt_id = p.id and h.ditix_event_id = ${ditixEventId}
     where p.aktiv
     order by p.bereich, p.reihenfolge, p.angelegt_am
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    id: String(r.id),
    bereich: r.bereich as Bereich,
    text: String(r.text),
    reihenfolge: Number(r.reihenfolge ?? 0),
    erledigtVon: r.erledigt_von ? String(r.erledigt_von) : null,
    erledigtAm: r.erledigt_am ? new Date(r.erledigt_am as string).toISOString() : null,
  }));
}

export async function haken(o: {
  ditixEventId: string;
  datum: string;
  punktId: string;
  wer: string;
}): Promise<void> {
  await db()`
    insert into showcheck_haken (ditix_event_id, punkt_id, datum, erledigt_von)
    values (${o.ditixEventId}, ${o.punktId}::uuid, ${o.datum}::date, ${o.wer})
    on conflict (ditix_event_id, punkt_id) do update
      set erledigt_von = excluded.erledigt_von, erledigt_am = now()
  `;
}

export async function hakenWeg(ditixEventId: string, punktId: string): Promise<void> {
  await db()`
    delete from showcheck_haken
     where ditix_event_id = ${ditixEventId} and punkt_id = ${punktId}::uuid
  `;
}

/**
 * Wie weit die Listen eines Abends sind.
 *
 * Für die Erinnerung und für den Blick von außen: Das Büro soll sehen
 * können, ob vor der Show alles abgehakt war, ohne jede Zeile zu lesen.
 */
export async function stand(ditixEventId: string): Promise<Record<Bereich, { offen: number; gesamt: number }>> {
  const punkte = await checkliste(ditixEventId);
  const leer = { offen: 0, gesamt: 0 };
  const ergebnis: Record<Bereich, { offen: number; gesamt: number }> = {
    vor_show: { ...leer },
    pause: { ...leer },
    nach_show: { ...leer },
  };
  for (const p of punkte) {
    ergebnis[p.bereich].gesamt += 1;
    if (!p.erledigtAm) ergebnis[p.bereich].offen += 1;
  }
  return ergebnis;
}

/** Einen Punkt ergänzen, ändern oder herausnehmen: nur für Florian. */
export async function punktAnlegen(bereich: Bereich, text: string): Promise<void> {
  const z = (await db()`
    select coalesce(max(reihenfolge), 0) + 10 as naechste from showcheck_punkt where bereich = ${bereich}
  `) as Array<{ naechste: number }>;
  await db()`
    insert into showcheck_punkt (bereich, text, reihenfolge)
    values (${bereich}, ${text}, ${Number(z[0]?.naechste ?? 10)})
  `;
}

export async function punktAendern(id: string, text: string): Promise<void> {
  await db()`update showcheck_punkt set text = ${text} where id = ${id}::uuid`;
}

export async function punktWeg(id: string): Promise<void> {
  // Nicht löschen: Was abgehakt wurde, soll nachvollziehbar bleiben.
  await db()`update showcheck_punkt set aktiv = false where id = ${id}::uuid`;
}
