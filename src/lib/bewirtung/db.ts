/**
 * Bewirtungsbelege in der Datenbank. Siehe migrations/043_bewirtung.sql.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import type { BelegLesung } from "./lesen";
import { GESELLSCHAFTEN, gesellschaftPraefix, type Gesellschaft } from "./gesellschaft";

export interface Bewirtung {
  id: string;
  nummer: string | null;
  erstelltAm: string;
  erstelltVon: string;
  fotoHash: string;
  /**
   * Womit der Beleg hereinkam: image/jpeg, image/png oder application/pdf.
   *
   * Die Anzeige braucht das. Ein PDF in ein Bildfeld zu haengen ergibt
   * ein kaputtes Symbol, und der Beleg sieht aus, als waere er weg
   * (Florian, 30.09.2026).
   */
  fotoTyp: string;
  datum: string | null;
  restaurant: string;
  anschrift: string;
  bruttoCent: number | null;
  mwst7Cent: number;
  mwst19Cent: number;
  trinkgeldCent: number;
  zahlart: string;
  art: "bewirtung" | "einkauf";
  /** Für welche Firma die Ausgabe gilt. Standard ist das Theater. */
  gesellschaft: Gesellschaft;
  kategorie: string;
  zweck: string;
  /**
   * Wie bezahlt wurde: karte, bar oder konto, leer solange unbekannt.
   *
   * "konto" heisst Lastschrift oder Ueberweisung. Bei einer Rechnung,
   * die abgebucht wird, ist die Frage nach Karte oder bar sinnlos, und
   * die Zahlung steht ohnehin auf dem Kontoauszug (Florian, 30.09.2026).
   */
  zahlweg: "" | "karte" | "bar" | "konto";
  privatAusgelegt: boolean;
  /**
   * Geschenk an "mitarbeiter" oder "partner", sonst leer.
   *
   * Sachbezuege an Mitarbeiter bleiben bis 50 Euro im Monat je Person
   * steuerfrei. Dafuer muss nachvollziehbar sein, wer wann was bekommen
   * hat, und deshalb steht beides am Beleg (Florian, 01.10.2026).
   */
  geschenk: "" | "mitarbeiter" | "partner";
  /** Fuer wen das Geschenk war. Bei Mitarbeitern der Name. */
  geschenkFuer: string;
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

const SPALTEN = `id, nummer, erstellt_am, erstellt_von, foto_hash, foto_typ, datum::text as datum, restaurant, anschrift, gesellschaft,
  brutto_cent, mwst7_cent, mwst19_cent, trinkgeld_cent, zahlart, art, kategorie, zweck, zahlweg,
  geschenk, geschenk_fuer,
  privat_ausgelegt, anlass, teilnehmer, bewirtender,
  ort_der_bewirtung, lesung, notiz, unterschrift, unterschrieben_am, status, festgeschrieben_am, festgeschrieben_von, storniert_am,
  storniert_von, storno_grund`;

function baue(z: Record<string, unknown>): Bewirtung {
  const t = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(z.id),
    nummer: (z.nummer as string) ?? null,
    gesellschaft: ((z.gesellschaft as string) ?? "fzt") as Gesellschaft,
    erstelltAm: t(z.erstellt_am)!,
    erstelltVon: String(z.erstellt_von),
    fotoHash: String(z.foto_hash),
    fotoTyp: String(z.foto_typ ?? "image/jpeg"),
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
    geschenk: (z.geschenk as Bewirtung["geschenk"]) ?? "",
    geschenkFuer: String(z.geschenk_fuer ?? ""),
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
  gesellschaft: Gesellschaft = "fzt",
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
                           art, kategorie, zweck, zahlweg, gesellschaft)
    values (decode(${fotoBase64}, 'base64'), ${typ}, ${hash}, ${von}, ${datum}::date,
            ${lesung?.restaurant ?? ""}, ${lesung?.anschrift ?? ""},
            ${lesung && lesung.brutto > 0 ? cent(lesung.brutto) : null},
            ${cent(lesung?.mwst7 ?? 0)}, ${cent(lesung?.mwst19 ?? 0)}, ${cent(lesung?.trinkgeld ?? 0)},
            ${lesung?.zahlart ?? ""}, ${lesung?.anschrift ?? ""}, ${lesung ? JSON.stringify(lesung) : null}::jsonb,
            ${lesung?.art ?? "bewirtung"}, ${lesung?.kategorie ?? ""}, ${lesung?.zweck ?? ""},
            ${lesung && lesung.zahlweg !== "unbekannt" ? lesung.zahlweg : ""}, ${gesellschaft})
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
  /**
   * Für welche Firma. Wer sie nicht wählen darf, schickt nichts, und
   * dann bleibt sie, wie sie beim Scannen war.
   */
  gesellschaft?: Gesellschaft;
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
  zahlweg: "" | "karte" | "bar" | "konto";
  privatAusgelegt: boolean;
  geschenk: "" | "mitarbeiter" | "partner";
  geschenkFuer: string;
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
      zahlweg = ${a.zahlweg}, privat_ausgelegt = ${a.privatAusgelegt},
      geschenk = ${a.geschenk}, geschenk_fuer = ${a.geschenkFuer},
      gesellschaft = coalesce(${a.gesellschaft ?? null}, gesellschaft)
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

/** Die einmal hinterlegte Unterschrift, die auf jeden Bewirtungsbeleg kommt. */
export async function hinterlegteUnterschrift(): Promise<{ png: string | null; von: string | null; am: string | null }> {
  const z = (await db()`select unterschrift, unterschrift_von, unterschrift_am from beleg_einstellung where id = 1`) as Array<
    Record<string, unknown>
  >;
  return {
    png: (z[0]?.unterschrift as string) ?? null,
    von: (z[0]?.unterschrift_von as string) ?? null,
    am: z[0]?.unterschrift_am ? new Date(z[0].unterschrift_am as string).toISOString() : null,
  };
}

export async function unterschriftHinterlegen(png: string | null, von: string): Promise<void> {
  await db()`
    update beleg_einstellung set unterschrift = ${png}, unterschrift_von = ${png ? von : null},
           unterschrift_am = ${png ? new Date().toISOString() : null}::timestamptz
     where id = 1
  `;
}

export async function unterschriftSetzen(id: string, png: string): Promise<void> {
  await db()`update bewirtung set unterschrift = ${png}, unterschrieben_am = now() where id = ${id} and status = 'entwurf'`;
}

export async function festschreiben(id: string, von: string): Promise<string> {
  /*
    Jede Gesellschaft zaehlt fuer sich.

    Das Theater behaelt seine Nummern ohne Vorsatz (B-2026-001), die
    anderen beiden bekommen einen (ME-B-2026-001). Ohne getrennte Kreise
    haette das Theater Luecken in seiner Zaehlung, sobald ein Beleg fuer
    eine andere Firma dazwischenkommt, und das faellt beim Pruefen auf
    (Florian, 28.09.2026).

    Die letzte Stelle der Nummer ist der Zaehler, deshalb wird von
    hinten getrennt (split_part mit -1 gibt es nicht, also ueber die
    Laenge).
  */
  const [zeile] = (await db()`
    select gesellschaft, case when art = 'einkauf' then 'E' else 'B' end as k,
           extract(year from coalesce(datum, now()::date))::int as j
      from bewirtung where id = ${id}
  `) as Array<{ gesellschaft: string; k: string; j: number }>;
  if (!zeile) return "";

  const praefix = `${gesellschaftPraefix(zeile.gesellschaft)}${zeile.k}-${zeile.j}-`;

  const z = (await db()`
    with naechste as (
      select coalesce(max(substring(nummer from '[0-9]+$')::int), 0) + 1 as n
        from bewirtung where nummer like ${praefix + "%"}
    )
    update bewirtung set status = 'fertig', festgeschrieben_am = now(), festgeschrieben_von = ${von},
           nummer = ${praefix} || lpad((select n from naechste)::text, 3, '0')
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

export function summen(
  liste: Bewirtung[],
  art: Bewirtung["art"] = "bewirtung",
  /** Nur diese Firma zählen. Ohne Angabe alle zusammen. */
  gesellschaft?: Gesellschaft,
): Summen {
  const fertig = liste.filter(
    (b) => b.status === "fertig" && b.art === art && (!gesellschaft || b.gesellschaft === gesellschaft),
  );
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
export function nachZahlweg(
  liste: Bewirtung[],
  /** Nur diese Firma zählen. Ohne Angabe alle zusammen. */
  gesellschaft?: Gesellschaft,
): { bar: number; karte: number; privat: number } {
  const fertig = liste.filter(
    (b) => b.status === "fertig" && (!gesellschaft || b.gesellschaft === gesellschaft),
  );
  const gesamt = (b: Bewirtung) => (b.bruttoCent ?? 0) + b.trinkgeldCent;
  return {
    bar: fertig.filter((b) => b.zahlweg === "bar").reduce((n, b) => n + gesamt(b), 0),
    karte: fertig.filter((b) => b.zahlweg === "karte").reduce((n, b) => n + gesamt(b), 0),
    privat: fertig.filter((b) => b.privatAusgelegt).reduce((n, b) => n + gesamt(b), 0),
  };
}

/**
 * Welche Firmen in dieser Liste vorkommen, in der Reihenfolge der
 * Stammdaten.
 *
 * Damit zeigt eine Auswertung nur die Abschnitte, zu denen es auch
 * Belege gibt: Wer nie für die Magic-Expert GbR einkauft, sieht sie
 * auch nirgends (Florian, 28.09.2026).
 */
export function nurGesellschaft(liste: Bewirtung[], g: Gesellschaft): Bewirtung[] {
  return liste.filter((b) => b.gesellschaft === g);
}

export function vorkommendeGesellschaften(liste: Bewirtung[]): Gesellschaft[] {
  const da = new Set(liste.filter((b) => b.status === "fertig").map((b) => b.gesellschaft));
  return GESELLSCHAFTEN.map((g) => g.wert).filter((w) => da.has(w));
}
