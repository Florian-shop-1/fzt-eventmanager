/**
 * Anfragen (Website und Meta-Leadformulare) in der eigenen Datenbank.
 *
 * Bisher war die Google-Tabelle „Neukundengewinnung – Eventanfragen“ die
 * Quelle: Make schrieb jede Anfrage dort hinein, der Eventmanager las sie
 * als CSV und merkte sich den Bearbeitungsstand daneben (lead_stand).
 * "wir wollen uns von den google tabellen lösen" (Florian, 14.10.2026).
 *
 * Jetzt kommt jede Anfrage über /api/anfrage direkt hierher (Julian,
 * 20.10.2026). Der Schlüssel wird genauso gebildet wie bisher aus der
 * Tabelle (Eingangsdatum, Adresse, Name), damit Bearbeitungsstand und
 * „schon gemeldet“ nahtlos weitergelten, auch während beide Wege parallel
 * laufen.
 *
 * Siehe migrations/198_anfragen.sql.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { leadSchluessel, type Lead } from "@/lib/shop/leads";
import { nameOrdentlich } from "@/lib/domain/namen";

/** Vorlage-Abfrage wie bei Neon; der Test reicht ein Postgres im Arbeitsspeicher hinein. */
export type Abfrage = (teile: TemplateStringsArray, ...werte: unknown[]) => Promise<unknown[]>;

function standard(): Abfrage {
  return db() as unknown as Abfrage;
}

/** Gleicher Inhalt wie migrations/198_anfragen.sql, damit der Eingang auch ohne vorher eingespielte Migration läuft. */
export const TABELLE_DDL = [
  `create table if not exists anfrage (
     id               uuid        primary key default gen_random_uuid(),
     schluessel       text        not null unique,
     eingang_am       timestamptz not null default now(),
     eingang          text        not null,
     kanal            text        not null default 'webseite',
     typ              text        not null default '',
     name             text        not null default '',
     email            text        not null default '',
     telefon          text        not null default '',
     teilnehmer       text        not null default '',
     wunschdatum      text        not null default '',
     kommentar        text        not null default '',
     status           text        not null default 'Anfrage eingegangen',
     ablehnungsgrund  text        not null default '',
     umsatz           text        not null default '',
     quelle_source    text        not null default '',
     quelle_medium    text        not null default '',
     quelle_campaign  text        not null default '',
     quelle_content   text        not null default '',
     quelle_term      text        not null default '',
     roh              jsonb       not null default '{}'::jsonb,
     inhalt_md5       text        not null default ''
   )`,
  "create index if not exists anfrage_eingang on anfrage (eingang_am desc)",
  // Dieselbe Meldung zweimal (Make wiederholt nach einem Fehler) wird nur einmal abgelegt.
  "create unique index if not exists anfrage_dublette on anfrage (inhalt_md5) where inhalt_md5 <> ''",
];

let bereit: Promise<void> | null = null;

function sorgeFuerTabelle(): Promise<void> {
  bereit ??= (async () => {
    const roh = db() as unknown as { query: (text: string) => Promise<unknown> };
    try {
      for (const anweisung of TABELLE_DDL) await roh.query(anweisung);
    } catch (e) {
      bereit = null;
      console.error("[anfragen] Tabelle anlegen:", e instanceof Error ? e.message : e);
    }
  })();
  return bereit;
}

/** Die übergebene Abfrage (Test, Tabellen aus den Migrationen) oder die echte, mit Tabelle. */
async function abfrage(gegeben?: Abfrage): Promise<Abfrage> {
  if (gegeben) return gegeben;
  await sorgeFuerTabelle();
  return standard();
}

/** Ein Feld als Text, gekürzt. */
function t(w: unknown, max = 2000): string {
  if (w === null || w === undefined) return "";
  return String(w).trim().slice(0, max);
}

/** "20.10.2026" in Berliner Zeit, wie Make es in die Tabelle schrieb. */
export function deutschesDatum(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Meta-Leads erkennt man an der Herkunft fb/ig (so liefert sie die Kampagne). */
function kanalVon(quelle: string, medium: string): string {
  const q = `${quelle} ${medium}`.toLowerCase();
  return /\b(fb|ig|facebook|instagram|meta)\b/.test(q) ? "meta" : "webseite";
}

export interface Angenommen {
  schluessel: string;
  neu: boolean;
}

/**
 * Nimmt eine Anfrage an. Felder wie im bisherigen Make-Webhook:
 * typ, name, email, telefon, teilnehmerzahl, wunschdatum, kommentar,
 * quelle_source, quelle_medium, quelle_campaign, quelle_content, quelle_term.
 * Alles andere bleibt im Rohinhalt erhalten.
 */
export async function anfrageAnnehmen(
  roh: Record<string, unknown>,
  jetzt: Date = new Date(),
  gegeben?: Abfrage,
): Promise<Angenommen> {
  const sql = await abfrage(gegeben);

  const name = t(roh.name, 200);
  const email = t(roh.email, 200);
  const eingang = deutschesDatum(jetzt);
  const quelle = t(roh.quelle_source ?? roh.utm_source, 200);
  const medium = t(roh.quelle_medium ?? roh.utm_medium, 200);
  const md5 = createHash("md5").update(JSON.stringify(roh)).digest("hex");

  // Dieselbe Meldung schon da?
  const doppelt = (await sql`select schluessel from anfrage where inhalt_md5 = ${md5}`) as Array<{ schluessel: string }>;
  if (doppelt.length) return { schluessel: doppelt[0].schluessel, neu: false };

  // Schlüssel wie in der Tabelle: zweite Anfrage am selben Tag von derselben Adresse bekommt #2.
  const basis = leadSchluessel(eingang, email, name);
  const vorhanden = (await sql`
    select schluessel from anfrage where schluessel = ${basis} or schluessel like ${basis + "#%"}
  `) as Array<{ schluessel: string }>;
  const schluessel = vorhanden.length === 0 ? basis : `${basis}#${vorhanden.length + 1}`;

  await sql`
    insert into anfrage (
      schluessel, eingang_am, eingang, kanal, typ, name, email, telefon, teilnehmer, wunschdatum,
      kommentar, quelle_source, quelle_medium, quelle_campaign, quelle_content, quelle_term, roh, inhalt_md5
    ) values (
      ${schluessel}, ${jetzt.toISOString()}, ${eingang}, ${kanalVon(quelle, medium)}, ${t(roh.typ, 100)},
      ${name}, ${email}, ${t(roh.telefon, 60)}, ${t(roh.teilnehmerzahl ?? roh.teilnehmer, 60)},
      ${t(roh.wunschdatum, 100)}, ${t(roh.kommentar)}, ${quelle}, ${medium},
      ${t(roh.quelle_campaign ?? roh.utm_campaign, 200)}, ${t(roh.quelle_content ?? roh.utm_content, 200)},
      ${t(roh.quelle_term ?? roh.utm_term, 200)}, ${JSON.stringify(roh)}, ${md5}
    )
    on conflict do nothing
  `;
  return { schluessel, neu: true };
}

/**
 * Firma aus dem Rohinhalt. Make reicht das Meta-Feld „Name des Unternehmens“
 * je nach Zuordnung unter einem dieser Namen durch; eine eigene Spalte braucht
 * es dafür nicht.
 */
export const FIRMA_FELDER = ["firma", "company_name", "firmenname", "unternehmen", "company"] as const;

export function firmaAus(roh: Record<string, unknown> | null | undefined): string {
  for (const f of FIRMA_FELDER) {
    const w = t(roh?.[f], 200);
    if (w) return w;
  }
  return "";
}

/** Alle Anfragen aus der Datenbank, im selben Format wie bisher aus der Tabelle. */
export async function anfragenAusDatenbank(gegeben?: Abfrage): Promise<Lead[]> {
  const sql = await abfrage(gegeben);
  const zeilen = (await sql`
    select schluessel, eingang, name, telefon, email, teilnehmer, wunschdatum, typ, status,
           ablehnungsgrund, kommentar, umsatz, quelle_source, quelle_campaign, roh
      from anfrage
     order by eingang_am desc
  `) as Array<Record<string, string> & { roh: unknown }>;
  return zeilen.map((z) => ({
    schluessel: z.schluessel,
    eingang: z.eingang,
    name: nameOrdentlich(z.name),
    firma: firmaAus(typeof z.roh === "string" ? JSON.parse(z.roh) : (z.roh as Record<string, unknown>)),
    telefon: z.telefon,
    email: z.email,
    teilnehmer: z.teilnehmer,
    wunschdatum: z.wunschdatum,
    anfragetyp: z.typ,
    status: z.status,
    ablehnungsgrund: z.ablehnungsgrund,
    kommentar: z.kommentar,
    umsatz: z.umsatz,
    herkunft: z.quelle_source ? [z.quelle_source, z.quelle_campaign].filter(Boolean).join(" · ") : null,
  }));
}

/**
 * Wie viele Anfragen noch niemand angefasst hat, und welche zuletzt kam.
 *
 * Für das rote Zeichen in der Navigation (Florian, 28.10.2026): "immer wenn eine neue kommt, dann muss da ein
 * zeichen dran sein wie bei whats app. für uns sehr wichtig."
 *
 * Neu heißt: Der Stand steht noch auf "Anfrage eingegangen". Das Zeichen verschwindet also nicht schon dadurch,
 * dass jemand die Liste aufmacht, sondern erst, wenn jemand die Anfrage angefasst hat, und dann für alle. Eine
 * Anfrage, die nur angeschaut und wieder zugeklappt wurde, bleibt sichtbar liegen.
 *
 * Unser eigener Stand hat Vorrang vor dem der Anfrage selbst, genau wie auf der Seite /leads.
 *
 * Störungsmeldungen aus dem Shop laufen durch dieselbe Tabelle, gehören aber nicht in den Vertrieb und zählen
 * deshalb hier nicht mit (siehe istStoerung in lib/shop/leads.ts).
 */
export interface AnfragenStand {
  neu: number;
  /** Davon von vor heute: Das sind die, die der Knopf auf /leads abhaken würde. */
  altbestand: number;
  neueste: { schluessel: string; name: string; typ: string; eingang: string } | null;
}

export async function anfragenStand(gegeben?: Abfrage): Promise<AnfragenStand> {
  const sql = await abfrage(gegeben);
  const zeilen = (await sql`
    select a.schluessel, a.name, a.typ, a.eingang,
           a.eingang_am < date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin' as alt
      from anfrage a
      left join lead_stand s on s.schluessel = a.schluessel
     where coalesce(nullif(s.status, ''), a.status) = 'Anfrage eingegangen'
       and a.typ !~* 'st(ö|oe)rung'
     order by a.eingang_am desc
  `) as Array<Record<string, string> & { alt: boolean }>;

  const erste = zeilen[0];
  return {
    neu: zeilen.length,
    altbestand: zeilen.filter((z) => z.alt).length,
    neueste: erste
      ? {
          schluessel: erste.schluessel,
          name: nameOrdentlich(erste.name) || "ohne Namen",
          typ: erste.typ ?? "",
          eingang: erste.eingang ?? "",
        }
      : null,
  };
}

/**
 * Den Bestand aus der Google-Tabelle einmalig übernehmen (scripts/anfragen-import.ts).
 * Gleicher Schlüssel wie bisher, deshalb gelten Bearbeitungsstand und „gemeldet“ weiter.
 * Was schon da ist, bleibt unverändert.
 */
export async function ausTabelleUebernehmen(leads: Lead[], gegeben?: Abfrage): Promise<number> {
  const sql = await abfrage(gegeben);
  let neu = 0;
  for (const l of leads) {
    const [quelle, kampagne] = (l.herkunft ?? "").split(" · ");
    const m = l.eingang.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    // Uhrzeit kennt die Tabelle nicht; Mittag Berliner Zeit hält das Datum stabil.
    const am = m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 10)).toISOString() : new Date(0).toISOString();
    const r = (await sql`
      insert into anfrage (
        schluessel, eingang_am, eingang, kanal, typ, name, email, telefon, teilnehmer, wunschdatum,
        kommentar, status, ablehnungsgrund, umsatz, quelle_source, quelle_campaign
      ) values (
        ${l.schluessel}, ${am}, ${l.eingang}, ${kanalVon(quelle ?? "", "")}, ${l.anfragetyp}, ${l.name}, ${l.email},
        ${l.telefon}, ${l.teilnehmer}, ${l.wunschdatum}, ${l.kommentar}, ${String(l.status || "Anfrage eingegangen")},
        ${l.ablehnungsgrund}, ${l.umsatz}, ${quelle ?? ""}, ${kampagne ?? ""}
      )
      on conflict (schluessel) do nothing
      returning schluessel
    `) as unknown[];
    neu += r.length;
  }
  return neu;
}
