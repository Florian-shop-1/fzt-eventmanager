/**
 * Gescannte Visitenkarten: ablegen, nachschlagen, übertragen.
 * Siehe migrations/209_visitenkarte.sql.
 */

import { db } from "@/lib/db/client";
import type { Kartendaten } from "./lesen";

export type Kartenstand = "neu" | "uebertragen" | "verworfen";

export interface Visitenkarte {
  id: string;
  status: Kartenstand;
  bildUrl: string;
  vorname: string;
  nachname: string;
  firma: string;
  position: string;
  email: string;
  telefon: string;
  webseite: string;
  adresse: string;
  sicherheit: "sicher" | "unsicher";
  hinweis: string;
  notiz: string;
  gescanntVon: string;
  erstelltAm: string;
  uebertragenAm: string | null;
  fehler: string;
}

function baue(r: Record<string, unknown>): Visitenkarte {
  const gelesen = (r.gelesen ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    status: String(r.status) as Kartenstand,
    bildUrl: String(r.bild_url ?? ""),
    vorname: String(r.vorname ?? ""),
    nachname: String(r.nachname ?? ""),
    firma: String(r.firma ?? ""),
    position: String(r.position ?? ""),
    email: String(r.email ?? ""),
    telefon: String(r.telefon ?? ""),
    webseite: String(r.webseite ?? ""),
    adresse: String(r.adresse ?? ""),
    sicherheit: r.sicherheit === "sicher" ? "sicher" : "unsicher",
    hinweis: String(gelesen.hinweis ?? ""),
    notiz: String(r.notiz ?? ""),
    gescanntVon: String(r.gescannt_von ?? ""),
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
    uebertragenAm: r.uebertragen_am ? new Date(r.uebertragen_am as string).toISOString() : null,
    fehler: String(r.fehler ?? ""),
  };
}

/** Eine frisch gelesene Karte ablegen. */
export async function karteAblegen(o: {
  daten: Kartendaten;
  bildUrl: string;
  von: string;
}): Promise<Visitenkarte> {
  const [z] = (await db()`
    insert into visitenkarte
      (bild_url, vorname, nachname, firma, position, email, telefon, webseite, adresse,
       gelesen, sicherheit, gescannt_von)
    values (${o.bildUrl}, ${o.daten.vorname}, ${o.daten.nachname}, ${o.daten.firma},
            ${o.daten.position}, ${o.daten.email}, ${o.daten.telefon}, ${o.daten.webseite},
            ${o.daten.adresse}, ${JSON.stringify(o.daten)}::jsonb, ${o.daten.sicherheit}, ${o.von})
    returning *
  `) as Array<Record<string, unknown>>;
  return baue(z);
}

export async function karten(staende: Kartenstand[], grenze = 60): Promise<Visitenkarte[]> {
  const z = (await db()`
    select * from visitenkarte
     where status = any(${staende})
     order by erstellt_am desc
     limit ${grenze}
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function karteLesen(id: string): Promise<Visitenkarte | null> {
  const z = (await db()`select * from visitenkarte where id = ${id}::uuid`) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

/**
 * Die Felder von Hand berichtigen.
 *
 * Das Modell liest gut, aber eine Visitenkarte kann im Gegenlicht liegen
 * oder zwei Adressen tragen. Wer die Karte in der Hand hält, entscheidet.
 */
export async function karteAendern(
  id: string,
  felder: Partial<Pick<Visitenkarte, "vorname" | "nachname" | "firma" | "position" | "email" | "telefon" | "webseite" | "notiz">>,
): Promise<void> {
  await db()`
    update visitenkarte set
      vorname  = coalesce(${felder.vorname ?? null}, vorname),
      nachname = coalesce(${felder.nachname ?? null}, nachname),
      firma    = coalesce(${felder.firma ?? null}, firma),
      position = coalesce(${felder.position ?? null}, position),
      email    = coalesce(${felder.email ?? null}, email),
      telefon  = coalesce(${felder.telefon ?? null}, telefon),
      webseite = coalesce(${felder.webseite ?? null}, webseite),
      notiz    = coalesce(${felder.notiz ?? null}, notiz)
     where id = ${id}::uuid
  `;
}

export async function karteStand(id: string, status: Kartenstand, fehler = ""): Promise<void> {
  await db()`
    update visitenkarte
       set status = ${status},
           fehler = ${fehler},
           uebertragen_am = case when ${status} = 'uebertragen' then now() else uebertragen_am end
     where id = ${id}::uuid
  `;
}

/**
 * Steht diese Adresse schon als übertragen in der Liste?
 *
 * `ausser` ist die Karte selbst: Wer eine schon übertragene Karte
 * berichtigt, soll nicht an seiner eigenen Adresse scheitern.
 */
export async function schonUebertragen(email: string, ausser?: string): Promise<boolean> {
  const adresse = email.trim().toLowerCase();
  if (!adresse) return false;
  const z = (await db()`
    select 1 from visitenkarte
     where lower(email) = ${adresse} and status = 'uebertragen'
       and (${ausser ?? null}::uuid is null or id <> ${ausser ?? null}::uuid)
     limit 1
  `) as unknown[];
  return z.length > 0;
}

export async function kartenZahlen(): Promise<{ neu: number; uebertragen: number; verworfen: number }> {
  const z = (await db()`
    select status, count(*)::int as n from visitenkarte group by status
  `) as Array<{ status: string; n: number }>;
  const hole = (s: string) => z.find((x) => x.status === s)?.n ?? 0;
  return { neu: hole("neu"), uebertragen: hole("uebertragen"), verworfen: hole("verworfen") };
}
