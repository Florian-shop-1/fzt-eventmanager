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
  /** Supporter-Ticket: Freikarte, deren Gegenleistung die Bewertung ist. */
  supporter: boolean;
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
    supporter: z.supporter === true,
  };
}

/*
  Ein Token kann zu zwei Dingen gehoeren.

  Die meisten stammen aus dem Shop und stehen in shop_buchung. Seit dem
  25.09.2026 bekommen auch Firmenkunden nach ihrer Veranstaltung eine
  Bewertungsmail, und deren Token stehen in firmen_bewertung. Die
  Bewertungsseite im Shop muss davon nichts wissen: Sie schickt ihren
  Token, und hier wird nachgesehen, erst dort, dann hier.
*/
export async function buchungZurBewertung(token: string): Promise<BewerteteBuchung | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [z] = (await db()`
    select *, datum::text as datum_text from shop_buchung where zugang_token = ${token} limit 1
  `) as Array<Record<string, unknown>>;
  if (z) return baue(z);

  const [f] = (await db()`
    select *, datum::text as datum_text from firmen_bewertung where zugang_token = ${token} limit 1
  `) as Array<Record<string, unknown>>;
  return f ? baue(f) : null;
}

/** Speichert die Sterne. Ein späterer Klick überschreibt einen früheren. */
export async function sterneSpeichern(token: string, sterne: number): Promise<BewerteteBuchung | null> {
  const [z] = (await db()`
    update shop_buchung set sterne = ${sterne}, sterne_am = now()
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  if (z) return baue(z);

  const [f] = (await db()`
    update firmen_bewertung set sterne = ${sterne}, sterne_am = now()
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  return f ? baue(f) : null;
}

export async function kritikSpeichern(token: string, kritik: string): Promise<BewerteteBuchung | null> {
  const [z] = (await db()`
    update shop_buchung set kritik = ${kritik}, kritik_am = now()
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  if (z) return baue(z);

  const [f] = (await db()`
    update firmen_bewertung set kritik = ${kritik}, kritik_am = now()
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  return f ? baue(f) : null;
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

/** Wer eine Probemail bekommen darf: nur aktive Leute aus Büro und Leitung, nie Gäste. */
export async function probeEmpfaenger(): Promise<{ name: string; email: string }[]> {
  const zeilen = (await db()`
    select name, email from benutzer where aktiv and rolle in ('chef', 'team') order by name
  `) as Array<{ name: string; email: string }>;
  return zeilen.map((z) => ({ name: String(z.name), email: String(z.email) }));
}

/**
 * Auf Google oder Tripadvisor getippt. Gilt als "vermutlich bewertet": Es lässt sich nicht prüfen, ob danach wirklich etwas
 * geschrieben wurde, aber wer nicht einmal tippt, hat es sicher nicht getan. Der erste Klick bleibt stehen.
 */
export async function klickMerken(token: string, wo: string): Promise<BewerteteBuchung | null> {
  const [z] = (await db()`
    update shop_buchung
       set bewertung_klick_am = coalesce(bewertung_klick_am, now()),
           bewertung_klick_wo = case when bewertung_klick_wo is null or bewertung_klick_wo = ${wo} then ${wo} else 'beide' end
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  return z ? baue(z) : null;
}

/** "Ich habe bewertet" auf der Seite. */
export async function erledigtMerken(token: string, von: string): Promise<BewerteteBuchung | null> {
  const [z] = (await db()`
    update shop_buchung
       set bewertung_erledigt_am = coalesce(bewertung_erledigt_am, now()), bewertung_erledigt_von = coalesce(bewertung_erledigt_von, ${von})
     where zugang_token = ${token}
    returning *, datum::text as datum_text
  `) as Array<Record<string, unknown>>;
  return z ? baue(z) : null;
}

/** Vom Büro abgehakt oder wieder geöffnet. */
export async function erledigtVomBuero(id: string, von: string, erledigt: boolean): Promise<void> {
  await db()`
    update shop_buchung
       set bewertung_erledigt_am = ${erledigt ? new Date().toISOString() : null}, bewertung_erledigt_von = ${erledigt ? von : null}
     where id = ${id}::uuid and supporter
  `;
}

export interface SupporterZeile {
  id: string;
  name: string;
  email: string;
  show: string;
  datum: string;
  mailAm: Date | null;
  klickAm: Date | null;
  klickWo: string | null;
  erinnertAm: Date | null;
  erledigtAm: Date | null;
  erledigtVon: string | null;
  sterne: number | null;
}

/** Alle Supporter der letzten 120 Tage, neueste Show zuerst, mit dem, was wir über ihre Bewertung wissen. */
export async function supporterListe(): Promise<SupporterZeile[]> {
  const zeilen = (await db()`
    select id, name, email, show, datum::text as datum_text, bewertung_mail_am, bewertung_klick_am, bewertung_klick_wo,
           bewertung_erinnerung_am, bewertung_erledigt_am, bewertung_erledigt_von, sterne
      from shop_buchung
     where supporter and bestaetigt and datum > (now() - interval '120 days')::date
     order by datum desc, name
  `) as Array<Record<string, unknown>>;
  const d = (w: unknown) => (w ? new Date(w as string) : null);
  return zeilen.map((z) => ({
    id: String(z.id),
    name: String(z.name ?? ""),
    email: String(z.email ?? ""),
    show: String(z.show ?? ""),
    datum: String(z.datum_text ?? ""),
    mailAm: d(z.bewertung_mail_am),
    klickAm: d(z.bewertung_klick_am),
    klickWo: (z.bewertung_klick_wo as string) ?? null,
    erinnertAm: d(z.bewertung_erinnerung_am),
    erledigtAm: d(z.bewertung_erledigt_am),
    erledigtVon: (z.bewertung_erledigt_von as string) ?? null,
    sterne: z.sterne === null || z.sterne === undefined ? null : Number(z.sterne),
  }));
}

/** Welche dieser Buchungen sind Supporter-Tickets? */
export async function supporterIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const zeilen = (await db()`select id from shop_buchung where id = any(${ids}::uuid[]) and supporter`) as Array<{ id: string }>;
    return new Set(zeilen.map((z) => String(z.id)));
  } catch (e) {
    // Solange die Migration 216 noch nicht eingespielt ist, gibt es keine Supporter. Die normale Bewertungsmail darf daran nicht scheitern.
    console.warn("[bewertung] Supporter nicht lesbar:", e);
    return new Set();
  }
}

/** Supporter, die vor mehr als drei Tagen die Mail bekamen und weder getippt noch abgehakt haben. Je Gast nur eine Erinnerung. */
export async function supporterZuErinnern(): Promise<Array<Record<string, unknown>>> {
  return (await db()`
    select *, datum::text as datum_text from shop_buchung
     where supporter and bestaetigt and bewertung_mail_am is not null
       and bewertung_mail_am < now() - interval '3 days' and bewertung_mail_am > now() - interval '30 days'
       and bewertung_klick_am is null and bewertung_erledigt_am is null and bewertung_erinnerung_am is null
  `) as Array<Record<string, unknown>>;
}

export async function merkeErinnerung(id: string): Promise<void> {
  await db()`update shop_buchung set bewertung_erinnerung_am = now() where id = ${id}::uuid`;
}
