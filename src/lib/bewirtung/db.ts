/**
 * Bewirtungsbelege in der Datenbank. Siehe migrations/043_bewirtung.sql.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import type { BelegLesung } from "./lesen";

export interface Bewirtung {
  id: string;
  nummer: string | null;
  erstelltAm: string;
  erstelltVon: string;
  fotoHash: string;
  datum: string | null;
  restaurant: string;
  anschrift: string;
  bruttoCent: number | null;
  mwst7Cent: number;
  mwst19Cent: number;
  trinkgeldCent: number;
  zahlart: string;
  art: "bewirtung" | "einkauf";
  kategorie: string;
  zweck: string;
  /** karte oder bar, leer solange unbekannt. */
  zahlweg: "" | "karte" | "bar";
  privatAusgelegt: boolean;
  anlass: string;
  teilnehmer: string;
  bewirtender: string;
  ortDerBewirtung: string;
  lesung: BelegLesung | null;
  notiz: string;
  /** Gezeichnete Unterschrift als PNG-Datenadresse. */
  unterschrift: string | null;
  unterschriebenAm: string | null;
  status: "entwurf" | "fertig" | "storniert";
  festgeschriebenAm: string | null;
  festgeschriebenVon: string | null;
  storniertAm: string | null;
  storniertVon: string | null;
  stornoGrund: string | null;
}

const SPALTEN = `id, nummer, erstellt_am, erstellt_von, foto_hash, datum::text as datum, restaurant, anschrift,
  brutto_cent, mwst7_cent, mwst19_cent, trinkgeld_cent, zahlart, art, kategorie, zweck, zahlweg,
  privat_ausgelegt, anlass, teilnehmer, bewirtender,
  ort_der_bewirtung, lesung, notiz, unterschrift, unterschrieben_am, status, festgeschrieben_am, festgeschrieben_von, storniert_am,
  storniert_von, storno_grund`;

function baue(z: Record<string, unknown>): Bewirtung {
  const t = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(z.id),
    nummer: (z.nummer as string) ?? null,
    erstelltAm: t(z.erstellt_am)!,
    erstelltVon: String(z.erstellt_von),
    fotoHash: String(z.foto_hash),
    datum: (z.datum as string) ?? null,
    restaurant: String(z.restaurant ?? ""),
    anschrift: String(z.anschrift ?? ""),
    bruttoCent: z.brutto_cent === null ? null : Number(z.brutto_cent),
    mwst7Cent: Number(z.mwst7_cent ?? 0),
    mwst19Cent: Number(z.mwst19_cent ?? 0),
    trinkgeldCent: Number(z.trinkgeld_cent ?? 0),
    zahlart: String(z.zahlart ?? ""),
    art: (z.art as Bewirtung["art"]) ?? "bewirtung",
    kategorie: String(z.kategorie ?? ""),
    zweck: String(z.zweck ?? ""),
    zahlweg: (z.zahlweg as Bewirtung["zahlweg"]) ?? "",
    privatAusgelegt: Boolean(z.privat_ausgelegt),
    anlass: String(z.anlass ?? ""),
    teilnehmer: String(z.teilnehmer ?? ""),
    bewirtender: String(z.bewirtender ?? ""),
    ortDerBewirtung: String(z.ort_der_bewirtung ?? ""),
    lesung: (z.lesung as BelegLesung) ?? null,
    notiz: String(z.notiz ?? ""),
    unterschrift: (z.unterschrift as string) ?? null,
    unterschriebenAm: t(z.unterschrieben_am),
    status: z.status as Bewirtung["status"],
    festgeschriebenAm: t(z.festgeschrieben_am),
    festgeschriebenVon: (z.festgeschrieben_von as string) ?? null,
    storniertAm: t(z.storniert_am),
    storniertVon: (z.storniert_von as string) ?? null,
    stornoGrund: (z.storno_grund as string) ?? null,
  };
}

const cent = (euro: number) => Math.round((Number.isFinite(euro) ? euro : 0) * 100);

/** Neuer Entwurf aus Foto und Lesung. Gibt die ID zurück, oder die des schon vorhandenen Belegs. */
export async function entwurfAnlegen(
  fotoBase64: string,
  typ: string,
  lesung: BelegLesung | null,
  von: string,
): Promise<{ id: string; doppelt: boolean }> {
  const hash = createHash("sha256").update(Buffer.from(fotoBase64, "base64")).digest("hex");
  const da = (await db()`
    select id from bewirtung where foto_hash = ${hash} and status <> 'storniert' limit 1
  `) as Array<{ id: string }>;
  if (da[0]) return { id: da[0].id, doppelt: true };

  const datum = lesung && /^\d{4}-\d{2}-\d{2}$/.test(lesung.datum) ? lesung.datum : null;
  const z = (await db()`
    insert into bewirtung (foto, foto_typ, foto_hash, erstellt_von, datum, restaurant, anschrift, brutto_cent,
                           mwst7_cent, mwst19_cent, trinkgeld_cent, zahlart, ort_der_bewirtung, lesung,
                           art, kategorie, zweck, zahlweg)
    values (decode(${fotoBase64}, 'base64'), ${typ}, ${hash}, ${von}, ${datum}::date,
            ${lesung?.restaurant ?? ""}, ${lesung?.anschrift ?? ""},
            ${lesung && lesung.brutto > 0 ? cent(lesung.brutto) : null},
            ${cent(lesung?.mwst7 ?? 0)}, ${cent(lesung?.mwst19 ?? 0)}, ${cent(lesung?.trinkgeld ?? 0)},
            ${lesung?.zahlart ?? ""}, ${lesung?.anschrift ?? ""}, ${lesung ? JSON.stringify(lesung) : null}::jsonb,
            ${lesung?.art ?? "bewirtung"}, ${lesung?.kategorie ?? ""}, ${lesung?.zweck ?? ""},
            ${lesung && lesung.zahlweg !== "unbekannt" ? lesung.zahlweg : ""})
    returning id
  `) as Array<{ id: string }>;
  return { id: z[0].id, doppelt: false };
}

export async function bewirtungLesen(id: string): Promise<Bewirtung | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const z = (await db().query(`select ${SPALTEN} from bewirtung where id = $1`, [id])) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

/** Alle Belege eines Jahres, neueste zuerst. Entwürfe immer, egal aus welchem Jahr. */
export async function bewirtungenDesJahres(jahr: number): Promise<Bewirtung[]> {
  const z = (await db().query(
    `select ${SPALTEN} from bewirtung
      where status = 'entwurf' or extract(year from coalesce(datum, erstellt_am::date)) = $1
      order by coalesce(datum, erstellt_am::date) desc, erstellt_am desc`,
    [jahr],
  )) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function fotoLesen(id: string): Promise<{ bytes: Buffer; typ: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const z = (await db()`
    select encode(foto, 'base64') as b, foto_typ from bewirtung where id = ${id}
  `) as Array<{ b: string; foto_typ: string }>;
  return z[0] ? { bytes: Buffer.from(z[0].b, "base64"), typ: z[0].foto_typ } : null;
}

export interface Angaben {
  datum: string;
  restaurant: string;
  anschrift: string;
  bruttoCent: number;
  mwst7Cent: number;
  mwst19Cent: number;
  trinkgeldCent: number;
  zahlart: string;
  art: "bewirtung" | "einkauf";
  kategorie: string;
  zweck: string;
  zahlweg: "" | "karte" | "bar";
  privatAusgelegt: boolean;
  anlass: string;
  teilnehmer: string;
  bewirtender: string;
  ortDerBewirtung: string;
  notiz: string;
}

/** Entwurf speichern (nur solange er noch nicht festgeschrieben ist). */
export async function entwurfSpeichern(id: string, a: Angaben): Promise<void> {
  await db()`
    update bewirtung set
      datum = ${a.datum || null}::date, restaurant = ${a.restaurant}, anschrift = ${a.anschrift},
      brutto_cent = ${a.bruttoCent}, mwst7_cent = ${a.mwst7Cent}, mwst19_cent = ${a.mwst19Cent},
      trinkgeld_cent = ${a.trinkgeldCent}, zahlart = ${a.zahlart}, anlass = ${a.anlass},
      teilnehmer = ${a.teilnehmer}, bewirtender = ${a.bewirtender}, ort_der_bewirtung = ${a.ortDerBewirtung},
      notiz = ${a.notiz}, art = ${a.art}, kategorie = ${a.kategorie}, zweck = ${a.zweck},
      zahlweg = ${a.zahlweg}, privat_ausgelegt = ${a.privatAusgelegt}
    where id = ${id} and status = 'entwurf'
  `;
}

/**
 * Festschreiben: Ab jetzt unveränderbar (die Datenbank verhindert jede
 * Änderung, siehe Trigger). Vergibt die laufende Nummer des Jahres.
 */
/**
 * Belege, die derselbe sein könnten: gleiches Datum und gleicher Betrag.
 * Der Fingerabdruck des Fotos hilft hier nicht, denn ein zweites Foto
 * desselben Zettels hat einen anderen.
 */
export async function moeglicheDubletten(b: Pick<Bewirtung, "id" | "datum" | "bruttoCent">): Promise<Array<{ id: string; nummer: string | null; restaurant: string; status: string }>> {
  if (!b.datum || !b.bruttoCent) return [];
  return (await db()`
    select id, nummer, restaurant, status from bewirtung
     where id <> ${b.id} and status <> 'storniert' and datum = ${b.datum}::date and brutto_cent = ${b.bruttoCent}
     order by erstellt_am
  `) as Array<{ id: string; nummer: string | null; restaurant: string; status: string }>;
}

export async function unterschriftSetzen(id: string, png: string): Promise<void> {
  await db()`update bewirtung set unterschrift = ${png}, unterschrieben_am = now() where id = ${id} and status = 'entwurf'`;
}

export async function festschreiben(id: string, von: string): Promise<string> {
  const z = (await db()`
    with jahr as (
      select extract(year from coalesce(datum, now()::date))::int as j,
             case when art = 'einkauf' then 'E' else 'B' end as k
        from bewirtung where id = ${id}
    ), naechste as (
      select coalesce(max(split_part(nummer, '-', 3)::int), 0) + 1 as n
        from bewirtung, jahr where nummer like jahr.k || '-' || jahr.j || '-%'
    )
    update bewirtung set status = 'fertig', festgeschrieben_am = now(), festgeschrieben_von = ${von},
           nummer = (select k from jahr) || '-' || (select j from jahr) || '-' || lpad((select n from naechste)::text, 3, '0')
     where id = ${id} and status = 'entwurf'
    returning nummer
  `) as Array<{ nummer: string }>;
  return z[0]?.nummer ?? "";
}

export async function entwurfVerwerfen(id: string): Promise<void> {
  await db()`delete from bewirtung where id = ${id} and status = 'entwurf'`;
}

export async function stornieren(id: string, von: string, grund: string): Promise<void> {
  await db()`
    update bewirtung set status = 'storniert', storniert_am = now(), storniert_von = ${von}, storno_grund = ${grund}
     where id = ${id} and status = 'fertig'
  `;
}

/** Summen fürs Steuerbüro. Stornierte und Entwürfe zählen nicht. Bei Bewirtungen gilt die 70-%-Regel. */
export interface Summen {
  anzahl: number;
  bruttoCent: number;
  trinkgeldCent: number;
  vorsteuerCent: number;
  /** Nettobetrag inklusive Trinkgeld. */
  nettoCent: number;
  /** 70 % des Nettos, als Betriebsausgabe abziehbar. */
  abziehbarCent: number;
  /** 30 % des Nettos, nicht abziehbar. */
  nichtAbziehbarCent: number;
}

export function summen(liste: Bewirtung[], art: Bewirtung["art"] = "bewirtung"): Summen {
  const fertig = liste.filter((b) => b.status === "fertig" && b.art === art);
  const brutto = fertig.reduce((n, b) => n + (b.bruttoCent ?? 0), 0);
  const trinkgeld = fertig.reduce((n, b) => n + b.trinkgeldCent, 0);
  const vorsteuer = fertig.reduce((n, b) => n + b.mwst7Cent + b.mwst19Cent, 0);
  const netto = brutto - vorsteuer + trinkgeld;
  // Einkäufe sind voll Betriebsausgabe, Bewirtungen zu 70 %.
  const abziehbar = art === "bewirtung" ? Math.round(netto * 0.7) : netto;
  return {
    anzahl: fertig.length,
    bruttoCent: brutto,
    trinkgeldCent: trinkgeld,
    vorsteuerCent: vorsteuer,
    nettoCent: netto,
    abziehbarCent: abziehbar,
    nichtAbziehbarCent: netto - abziehbar,
  };
}

export function euro(cent: number | null | undefined): string {
  return ((cent ?? 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/** Wie viel wurde bar, mit Karte, und privat ausgelegt bezahlt (alle Arten). */
export function nachZahlweg(liste: Bewirtung[]): { bar: number; karte: number; privat: number } {
  const fertig = liste.filter((b) => b.status === "fertig");
  const gesamt = (b: Bewirtung) => (b.bruttoCent ?? 0) + b.trinkgeldCent;
  return {
    bar: fertig.filter((b) => b.zahlweg === "bar").reduce((n, b) => n + gesamt(b), 0),
    karte: fertig.filter((b) => b.zahlweg === "karte").reduce((n, b) => n + gesamt(b), 0),
    privat: fertig.filter((b) => b.privatAusgelegt).reduce((n, b) => n + gesamt(b), 0),
  };
}
