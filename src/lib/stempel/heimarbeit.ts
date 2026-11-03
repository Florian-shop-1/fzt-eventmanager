/**
 * Heimarbeit: Stunden, die niemand gestempelt hat.
 *
 * Wer zu Hause schneidet, Plakate setzt oder telefoniert, steht an
 * keiner Uhr. Trotzdem sollen die Stunden ins System und aufs Konto
 * (Florian, 03.11.2026).
 *
 * Gespeichert wird nur, was bekannt ist: Tag, Dauer, Zweck und von wem
 * die Angabe stammt. Keine erfundenen Kommen- und Gehen-Zeiten. Im
 * Protokoll ans Lohnbuero bleiben die beiden Spalten leer, die Zeile
 * traegt die Art "Heimarbeit".
 */

import { db } from "@/lib/db/client";

/** Mehr als zehn Stunden am Tag laesst das Arbeitszeitgesetz nicht zu. */
export const HOECHSTE_MINUTEN = 600;

export interface Heimarbeitstag {
  benutzerId: string;
  name: string;
  datum: string;
  minuten: number;
  zweck: string;
  nachAngabeVon: string;
  eingetragenVon: string;
  email: string;
}

/**
 * Die Gesamtstunden gleichmaessig auf die Tage verteilen.
 *
 * Gerechnet wird in Minuten, und der Rest der Division landet auf dem
 * letzten Tag. So stimmt die Summe auf die Minute mit dem ueberein, was
 * der Mitarbeiter angegeben hat; eine Verteilung, die sich um sieben
 * Minuten verrechnet, waere im Nachweis nicht zu erklaeren.
 */
export function verteilen(minutenGesamt: number, tage: string[]): Array<{ datum: string; minuten: number }> {
  if (tage.length === 0 || minutenGesamt <= 0) return [];
  const je = Math.floor(minutenGesamt / tage.length);
  const rest = minutenGesamt - je * tage.length;
  return tage
    .map((datum, i) => ({ datum, minuten: je + (i === tage.length - 1 ? rest : 0) }))
    .filter((t) => t.minuten > 0);
}

/** Alle Tage von bis einschliesslich, als JJJJ-MM-TT. */
export function tageZwischen(von: string, bis: string): string[] {
  const tage: string[] = [];
  const ende = new Date(`${bis}T12:00:00Z`);
  for (let t = new Date(`${von}T12:00:00Z`); t <= ende; t.setUTCDate(t.getUTCDate() + 1)) {
    tage.push(t.toISOString().slice(0, 10));
  }
  return tage;
}

/** Samstag und Sonntag heraus. Wer am Wochenende gearbeitet hat, traegt die Tage einzeln nach. */
export function nurWerktage(tage: string[]): string[] {
  return tage.filter((d) => {
    const wt = new Date(`${d}T12:00:00Z`).getUTCDay();
    return wt !== 0 && wt !== 6;
  });
}

/**
 * Eintragen. Ein Tag je Person nur einmal, ein zweiter Eintrag ersetzt
 * den ersten, statt die Stunden danebenzulegen.
 */
export async function heimarbeitEintragen(o: {
  benutzerId: string;
  name: string;
  tage: Array<{ datum: string; minuten: number }>;
  zweck: string;
  nachAngabeVon: string;
  eingetragenVon: string;
  antragId?: string | null;
}): Promise<number> {
  let gesetzt = 0;
  for (const t of o.tage) {
    if (t.minuten <= 0 || t.minuten > HOECHSTE_MINUTEN) continue;
    await db()`
      insert into heimarbeit (benutzer_id, name, datum, minuten, zweck, nach_angabe_von, eingetragen_von, antrag_id)
      values (${o.benutzerId}::uuid, ${o.name}, ${t.datum}::date, ${t.minuten}, ${o.zweck},
              ${o.nachAngabeVon}, ${o.eingetragenVon}, ${o.antragId ?? null})
      on conflict (benutzer_id, datum) do update
        set minuten = excluded.minuten,
            zweck = excluded.zweck,
            nach_angabe_von = excluded.nach_angabe_von,
            eingetragen_von = excluded.eingetragen_von,
            antrag_id = coalesce(excluded.antrag_id, heimarbeit.antrag_id),
            erstellt_am = now()
    `;
    gesetzt += 1;
  }
  return gesetzt;
}

/** Die Heimarbeit eines Zeitraums, fuer die Lohnauswertung. */
export async function heimarbeitImZeitraum(von: string, bis: string): Promise<Heimarbeitstag[]> {
  const z = (await db()`
    select h.benutzer_id, h.name, to_char(h.datum, 'YYYY-MM-DD') as datum, h.minuten,
           h.zweck, h.nach_angabe_von, h.eingetragen_von, coalesce(b.email, '') as email
      from heimarbeit h
      left join benutzer b on b.id = h.benutzer_id
     where h.datum between ${von}::date and ${bis}::date
       and coalesce(b.ohne_lohnmeldung, false) = false
     order by h.benutzer_id, h.datum
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    benutzerId: String(r.benutzer_id),
    name: String(r.name ?? ""),
    datum: String(r.datum),
    minuten: Number(r.minuten),
    zweck: String(r.zweck ?? ""),
    nachAngabeVon: String(r.nach_angabe_von ?? ""),
    eingetragenVon: String(r.eingetragen_von ?? ""),
    email: String(r.email ?? ""),
  }));
}

/** Einen Tag wieder entfernen, falls er falsch eingetragen wurde. */
export async function heimarbeitEntfernen(benutzerId: string, datum: string): Promise<void> {
  await db()`delete from heimarbeit where benutzer_id = ${benutzerId}::uuid and datum = ${datum}::date`;
}
