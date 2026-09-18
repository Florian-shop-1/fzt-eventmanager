/**
 * Die Gästeliste der Show. Siehe migrations/038_gaesteliste.sql.
 */

import { db } from "@/lib/db/client";

export interface Gast {
  id: string;
  ditixEventId: string;
  datum: string;
  uhrzeit: string | null;
  name: string;
  anzahl: number;
  notiz: string;
  erstelltVon: string;
  platz: string | null;
  gesetztVon: string | null;
}

function baue(z: Record<string, unknown>): Gast {
  return {
    id: String(z.id),
    ditixEventId: String(z.ditix_event_id),
    datum: String(z.datum_text ?? ""),
    uhrzeit: (z.uhrzeit as string) ?? null,
    name: String(z.name),
    anzahl: Number(z.anzahl),
    notiz: String(z.notiz ?? ""),
    erstelltVon: String(z.erstellt_von ?? ""),
    platz: (z.platz as string) ?? null,
    gesetztVon: (z.gesetzt_von as string) ?? null,
  };
}

/** Gäste einer Vorstellung, die größten Gruppen zuerst (für sie gibt es am wenigsten Plätze). */
export async function gaesteDerVorstellung(ditixEventId: string): Promise<Gast[]> {
  const z = (await db()`
    select *, datum::text as datum_text from gaesteliste
     where ditix_event_id = ${ditixEventId}
     order by anzahl desc, name
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Gäste eines Tages, für die Einlassliste. */
export async function gaesteDesTages(datum: string): Promise<Gast[]> {
  const z = (await db()`
    select *, datum::text as datum_text from gaesteliste where datum = ${datum}::date order by name
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Die nächsten Wochen, für die Übersicht auf der Eingabeseite. */
export async function kommendeGaeste(): Promise<Gast[]> {
  const z = (await db()`
    select *, datum::text as datum_text from gaesteliste
     where datum >= (now() at time zone 'Europe/Berlin')::date
     order by datum, uhrzeit, name
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function gastAnlegen(g: {
  ditixEventId: string; datum: string; uhrzeit: string; name: string; anzahl: number; notiz: string; von: string;
}): Promise<void> {
  await db()`
    insert into gaesteliste (ditix_event_id, datum, uhrzeit, name, anzahl, notiz, erstellt_von)
    values (${g.ditixEventId}, ${g.datum}::date, ${g.uhrzeit}, ${g.name}, ${g.anzahl}, ${g.notiz || null}, ${g.von})
  `;
}

export async function gastLoeschen(id: string): Promise<void> {
  await db()`delete from gaesteliste where id = ${id}`;
}

export async function platzEintragen(id: string, platz: string, von: string): Promise<void> {
  await db()`
    update gaesteliste
       set platz = ${platz || null}, gesetzt_von = ${platz ? von : null}, gesetzt_am = ${platz ? new Date() : null}
     where id = ${id}
  `;
}
