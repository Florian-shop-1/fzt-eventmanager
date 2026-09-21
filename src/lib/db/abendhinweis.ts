/**
 * Hinweise zu einem Abend. Siehe migrations/052_funktionsheet_hinweise.sql.
 *
 * Freier Text, damit das, was bisher im Kalender stand, eins zu eins
 * übernommen werden kann. Erscheint auf dem Funktionsheet, im Küchenblatt
 * und auf dem Foyer-Blatt, also überall dort, wo der Abend vorbereitet wird.
 */

import { db } from "@/lib/db/client";

export interface AbendHinweis {
  id: string;
  datum: string;
  titel: string;
  text: string;
  erstelltVon: string;
  erstelltAm: string;
  geaendertVon: string | null;
  geaendertAm: string | null;
}

function baue(z: Record<string, unknown>): AbendHinweis {
  const t = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(z.id),
    datum: String(z.datum),
    titel: String(z.titel ?? ""),
    text: String(z.text ?? ""),
    erstelltVon: String(z.erstellt_von),
    erstelltAm: t(z.erstellt_am)!,
    geaendertVon: (z.geaendert_von as string) ?? null,
    geaendertAm: t(z.geaendert_am),
  };
}

export async function hinweiseDesTages(datum: string): Promise<AbendHinweis[]> {
  const z = (await db()`
    select id, datum::text as datum, titel, text, erstellt_von, erstellt_am, geaendert_von, geaendert_am
      from abend_hinweis where datum = ${datum}::date order by sortierung, erstellt_am
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Wie viele Hinweise es an den kommenden Abenden gibt, für die Übersicht. */
export async function hinweisZahlen(): Promise<Map<string, number>> {
  const z = (await db()`
    select datum::text as datum, count(*)::int as n from abend_hinweis
     where datum >= (now() at time zone 'Europe/Berlin')::date group by datum
  `) as Array<{ datum: string; n: number }>;
  return new Map(z.map((r) => [r.datum, r.n]));
}

export async function hinweisAnlegen(h: { datum: string; titel: string; text: string; von: string }): Promise<void> {
  await db()`
    insert into abend_hinweis (datum, titel, text, erstellt_von)
    values (${h.datum}::date, ${h.titel}, ${h.text}, ${h.von})
  `;
}

export async function hinweisAendern(id: string, titel: string, text: string, von: string): Promise<void> {
  await db()`
    update abend_hinweis set titel = ${titel}, text = ${text}, geaendert_von = ${von}, geaendert_am = now()
     where id = ${id}
  `;
}

export async function hinweisLoeschen(id: string): Promise<void> {
  await db()`delete from abend_hinweis where id = ${id}`;
}
