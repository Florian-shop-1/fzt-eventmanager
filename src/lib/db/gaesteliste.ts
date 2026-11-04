/**
 * Die Gästeliste der Show. Siehe migrations/038_gaesteliste.sql.
 */

import { randomBytes } from "node:crypto";
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
  /**
   * Mailadresse des Gastes, freiwillig.
   *
   * Steht eine da, gilt die Einwilligung als erteilt: Wer auf dieser
   * Liste steht, wurde vorher gefragt (Florian, 04.11.2026). Nur dann
   * geht die Bewertungsmail hinaus und nur dann wandert der Gast in die
   * Magic News.
   */
  email: string;
  /** Wer eingeladen hat, etwa "Veronika". Steht so in der Mail. */
  eingeladenVon: string;
  token: string | null;
  bewertungMailAm: string | null;
  bewertungKlickAm: string | null;
  bewertungErinnerungAm: string | null;
  newsletterAm: string | null;
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
    email: String(z.email ?? ""),
    eingeladenVon: String(z.eingeladen_von ?? ""),
    token: (z.token as string) ?? null,
    bewertungMailAm: z.bewertung_mail_am ? new Date(z.bewertung_mail_am as string).toISOString() : null,
    bewertungKlickAm: z.bewertung_klick_am ? new Date(z.bewertung_klick_am as string).toISOString() : null,
    bewertungErinnerungAm: z.bewertung_erinnerung_am ? new Date(z.bewertung_erinnerung_am as string).toISOString() : null,
    newsletterAm: z.newsletter_am ? new Date(z.newsletter_am as string).toISOString() : null,
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
  email?: string; eingeladenVon?: string;
}): Promise<void> {
  const email = (g.email ?? "").trim().toLowerCase();
  await db()`
    insert into gaesteliste (ditix_event_id, datum, uhrzeit, name, anzahl, notiz, erstellt_von,
                             email, eingeladen_von, token)
    values (${g.ditixEventId}, ${g.datum}::date, ${g.uhrzeit}, ${g.name}, ${g.anzahl}, ${g.notiz || null}, ${g.von},
            ${email || null}, ${(g.eingeladenVon ?? "").trim() || null},
            ${email ? randomBytes(18).toString("base64url") : null})
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

/* ------------------------------------------------------------------ *
 * Die Bitte um eine Bewertung.
 *
 * Eingeladene Gaeste bekommen am Morgen nach der Show dieselbe Bitte wie
 * die Supporter, nur mit dem Namen dessen davor, der sie eingeladen hat
 * (Florian, 04.11.2026). Wer nach einem Tag nicht getippt hat, bekommt
 * eine Erinnerung, und zwar genau eine.
 *
 * Ohne Mailadresse passiert nichts. Die Adresse ist hier die
 * Einwilligung, siehe den Kommentar an "email" oben.
 * ------------------------------------------------------------------ */

/** Eingeladene Gaeste eines Showtages, die noch keine Bewertungsmail haben. */
export async function gaesteZuBewerten(datum: string): Promise<Gast[]> {
  const z = (await db()`
    select *, datum::text as datum_text from gaesteliste
     where datum = ${datum}::date
       and email is not null and email <> '' and token is not null
       and bewertung_mail_am is null
     order by name
  `.catch(() => [] as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/**
 * Wer nach einem Tag nicht getippt hat.
 *
 * "wenn sie nicht geklickt haben bzw. grundsaetzlich noch mal eine
 * erinnerung ein Tag spaeter" (Florian, 04.11.2026). Nach dreissig Tagen
 * ist der Abend vorbei, dann wird nicht mehr erinnert.
 */
export async function gaesteZuErinnern(): Promise<Gast[]> {
  const z = (await db()`
    select *, datum::text as datum_text from gaesteliste
     where email is not null and email <> '' and token is not null
       and bewertung_mail_am is not null
       and bewertung_mail_am < now() - interval '1 day'
       and bewertung_mail_am > now() - interval '30 days'
       and bewertung_klick_am is null
       and bewertung_erinnerung_am is null
     order by bewertung_mail_am
  `.catch(() => [] as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function merkeGastBewertungsmail(id: string): Promise<void> {
  await db()`update gaesteliste set bewertung_mail_am = now() where id = ${id}::uuid`;
}

export async function merkeGastErinnerung(id: string): Promise<void> {
  await db()`update gaesteliste set bewertung_erinnerung_am = now() where id = ${id}::uuid`;
}

export async function merkeGastNewsletter(id: string): Promise<void> {
  await db()`update gaesteliste set newsletter_am = now() where id = ${id}::uuid`;
}

/** Der Klick auf den Bewertungslink. Danach kommt keine Erinnerung mehr. */
export async function gastKlickMerken(token: string): Promise<Gast | null> {
  const z = (await db()`
    update gaesteliste set bewertung_klick_am = coalesce(bewertung_klick_am, now())
     where token = ${token}
    returning *, datum::text as datum_text
  `.catch(() => [] as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

/** Gaeste mit Adresse, die noch nicht in den Magic News stehen. */
export async function gaesteFuerNewsletter(): Promise<Gast[]> {
  const z = (await db()`
    select *, datum::text as datum_text from gaesteliste
     where email is not null and email <> '' and newsletter_am is null
     order by erstellt_am
     limit 200
  `.catch(() => [] as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>;
  return z.map(baue);
}
