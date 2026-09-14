/**
 * Bewertungen nach der Show: Schalter, Sterne, Kritik.
 * Siehe migrations/033_bewertung.sql.
 */

import { db } from "@/lib/db/client";

export async function bewertungAktiv(): Promise<{ aktiv: boolean; geaendertAm: string; geaendertVon: string | null }> {
  const [z] = (await db()`select aktiv, geaendert_am, geaendert_von from bewertung_einstellung where id = 1`) as Array<
    Record<string, unknown>
  >;
  return {
    aktiv: z?.aktiv === true,
    geaendertAm: z?.geaendert_am ? new Date(z.geaendert_am as string).toISOString() : new Date().toISOString(),
    geaendertVon: (z?.geaendert_von as string) ?? null,
  };
}

export async function bewertungAktivSetzen(aktiv: boolean, von: string): Promise<void> {
  await db()`update bewertung_einstellung set aktiv = ${aktiv}, geaendert_am = now(), geaendert_von = ${von} where id = 1`;
}

/** Erst nach erfolgreichem Versand, wie bei der Vorfreude-Mail. */
export async function merkeBewertungMail(id: string): Promise<void> {
  await db()`update shop_buchung set bewertung_mail_am = now() where id = ${id}`;
}

export interface BewerteteBuchung {
  id: string;
  name: string;
  email: string;
  telefon: string;
  show: string;
  datum: string;
  uhrzeit: string | null;
  sterne: number | null;
  sterneAm: Date | null;
  kritik: string | null;
  unterhaltung: string | null;
}

function baue(z: Record<string, unknown>): BewerteteBuchung {
  return {
    id: String(z.id),
    name: String(z.name ?? ""),
    email: String(z.email ?? ""),
    telefon: String(z.telefon ?? ""),
    show: String(z.show ?? ""),
    datum: String(z.datum_text ?? z.datum ?? ""),
    uhrzeit: (z.uhrzeit as string) ?? null,
    sterne: z.sterne === null || z.sterne === undefined ? null : Number(z.sterne),
    sterneAm: z.sterne_am ? new Date(z.sterne_am as string) : null,
    kritik: (z.kritik as string) ?? null,
    unterhaltung: (z.bewertung_unterhaltung as string) ?? null,
  };
}

export async function buchungZurBewertung(token: string): Promise<BewerteteBuchung | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [z] = (await db()`
    select *, datum::text as datum_text from shop_buchung where zugang_token = ${token} limit 1
  `) as Array<Record<string, unknown>>;
  return z ? baue(z) : null;
}

/** Speichert die Sterne. Ein späterer Klick überschreibt einen früheren. */
export async function sterneSpeichern(token: string, sterne: number): Promise<BewerteteBuchung | null> {
  const [z] = (await db()`
    update shop_buchung set sterne = ${sterne}, sterne_am = now()
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  return z ? baue(z) : null;
}

export async function kritikSpeichern(token: string, kritik: string): Promise<BewerteteBuchung | null> {
  const [z] = (await db()`
    update shop_buchung set kritik = ${kritik}, kritik_am = now()
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  return z ? baue(z) : null;
}

export async function unterhaltungMerken(id: string, waId: string): Promise<void> {
  await db()`update shop_buchung set bewertung_unterhaltung = ${waId} where id = ${id}`;
}

export interface Bewertungsuebersicht {
  verschickt: number;
  bewertet: number;
  verteilung: Record<number, number>;
  letzte: Array<BewerteteBuchung & { sterneAmText: string }>;
}

/** Für die Seite im Eventmanager: die letzten 60 Tage. */
export async function bewertungsuebersicht(): Promise<Bewertungsuebersicht> {
  const [zahlen] = (await db()`
    select count(*) filter (where bewertung_mail_am is not null)::int as verschickt,
           count(*) filter (where sterne is not null)::int as bewertet,
           count(*) filter (where sterne = 1)::int as s1, count(*) filter (where sterne = 2)::int as s2,
           count(*) filter (where sterne = 3)::int as s3, count(*) filter (where sterne = 4)::int as s4,
           count(*) filter (where sterne = 5)::int as s5
      from shop_buchung where datum > now() - interval '60 days'
  `) as Array<Record<string, number>>;
  const zeilen = (await db()`
    select *, datum::text as datum_text from shop_buchung
     where sterne is not null order by sterne_am desc limit 40
  `) as Array<Record<string, unknown>>;
  return {
    verschickt: Number(zahlen?.verschickt ?? 0),
    bewertet: Number(zahlen?.bewertet ?? 0),
    verteilung: { 1: zahlen?.s1 ?? 0, 2: zahlen?.s2 ?? 0, 3: zahlen?.s3 ?? 0, 4: zahlen?.s4 ?? 0, 5: zahlen?.s5 ?? 0 },
    letzte: zeilen.map((z) => ({ ...baue(z), sterneAmText: z.sterne_am ? new Date(z.sterne_am as string).toISOString() : "" })),
  };
}
