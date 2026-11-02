/**
 * Gescannte Gästepostkarten: ablegen, nachschlagen, freigeben.
 * Siehe migrations/217_postkarten.sql.
 *
 * Das Original liegt als bytea in der Datenbank und wird nie als Ganzes
 * mitgeladen: Wer eine Liste holt, bekommt Text und Bewertung, aber
 * nicht Megabyte an Bildern. Das Bild kommt einzeln über bildHolen und
 * nur für angemeldete Leute.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import type { Fundstelle, Kartenbefund } from "./lesen";
import { fingerabdruck } from "./lesen";

/*
  "wartet" kam am 02.11.2026 dazu: Das Foto liegt da, gelesen wird es
  in der Nacht (Florian: "wie bei den emojis einfach über nacht ...
  weil es günstiger ist").
*/
export type Kartenstand =
  | "neu"
  | "wartet"
  | "gelesen"
  | "freigegeben"
  | "zurueck"
  | "verworfen";
export type Datenschutz = "offen" | "frei" | "gesperrt";

export interface Postkarte {
  id: string;
  status: Kartenstand;
  hatBild: boolean;
  bildOeffentlich: string;
  transkript: string;
  zitat: string;
  zusammenfassung: string;
  stimmung: string;
  bewertung: number;
  themen: string[];
  begruendung: string;
  hinweis: string;
  datenschutz: Datenschutz;
  personenbezug: Fundstelle[];
  einwilligung: string;
  highlight: boolean;
  dubletteVon: string | null;
  show: string;
  gescanntVon: string;
  notiz: string;
  fehler: string;
  erstelltAm: string;
  veroeffentlichtAm: string | null;
}

function baue(r: Record<string, unknown>): Postkarte {
  const gelesen = (r.gelesen ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    status: String(r.status) as Kartenstand,
    hatBild: Boolean(r.hat_bild),
    bildOeffentlich: String(r.bild_oeffentlich ?? ""),
    transkript: String(r.transkript ?? ""),
    zitat: String(r.zitat ?? ""),
    zusammenfassung: String(r.zusammenfassung ?? ""),
    stimmung: String(r.stimmung ?? ""),
    bewertung: Number(r.bewertung ?? 0),
    themen: Array.isArray(r.themen) ? r.themen.map(String) : [],
    begruendung: String(gelesen.begruendung ?? ""),
    hinweis: String(gelesen.hinweis ?? ""),
    datenschutz: String(r.datenschutz ?? "offen") as Datenschutz,
    personenbezug: Array.isArray(r.personenbezug) ? (r.personenbezug as Fundstelle[]) : [],
    einwilligung: String(r.einwilligung ?? "unbekannt"),
    highlight: Boolean(r.highlight),
    dubletteVon: r.dublette_von ? String(r.dublette_von) : null,
    show: String(r.show ?? ""),
    gescanntVon: String(r.gescannt_von ?? ""),
    notiz: String(r.notiz ?? ""),
    fehler: String(r.fehler ?? ""),
    erstelltAm: String(r.erstellt_am ?? ""),
    veroeffentlichtAm: r.veroeffentlicht_am ? String(r.veroeffentlicht_am) : null,
  };
}

/**
 * Eine frisch gescannte Karte ablegen, samt Befund.
 *
 * Der Datenschutzstand ergibt sich aus dem Befund, aber nur in eine
 * Richtung: Wer etwas Persönliches auf der Karte findet, sperrt sie.
 * Wer nichts findet, lässt sie offen, damit ein Mensch hinsieht. Von
 * allein wird nichts frei.
 */
export async function karteAblegen(o: {
  bild: Buffer;
  bildTyp: string;
  befund: Kartenbefund;
  von: string;
  einwilligung?: string;
}): Promise<Postkarte> {
  const abdruck = fingerabdruck(o.befund.transkript);
  const dublette = abdruck
    ? ((await db()`
        select id from postkarte
         where fingerabdruck = ${abdruck} and status <> 'verworfen'
         order by erstellt_am limit 1
      `) as Array<{ id: string }>)[0]?.id ?? null
    : null;

  const [z] = (await db()`
    insert into postkarte (
      status, bild, bild_typ, transkript, zitat, zusammenfassung, stimmung, bewertung,
      themen, gelesen, datenschutz, personenbezug, einwilligung, fingerabdruck,
      dublette_von, show, gescannt_von, gelesen_am
    ) values (
      ${dublette ? "verworfen" : "gelesen"},
      ${o.bild}, ${o.bildTyp},
      ${o.befund.transkript}, ${o.befund.zitat}, ${o.befund.zusammenfassung},
      ${o.befund.stimmung}, ${o.befund.bewertung},
      ${o.befund.themen}, ${JSON.stringify(o.befund.roh ?? {})}::jsonb,
      ${o.befund.personenbezug.length > 0 ? "gesperrt" : "offen"},
      ${JSON.stringify(o.befund.personenbezug)}::jsonb,
      ${o.einwilligung ?? "unbekannt"}, ${abdruck},
      ${dublette}::uuid, ${o.befund.show}, ${o.von}, now()
    )
    returning id, status, (bild is not null) as hat_bild, bild_oeffentlich, transkript, zitat,
           zusammenfassung, stimmung, bewertung, themen, gelesen, datenschutz, personenbezug,
           einwilligung, highlight, dublette_von, show, gescannt_von, notiz, fehler,
           erstellt_am, veroeffentlicht_am
  `) as Array<Record<string, unknown>>;
  return baue(z);
}

/**
 * Ein Foto ablegen, ohne es zu lesen.
 *
 * "bitte mach das so, dass du dir die fotos speicherst und dann den
 * antrophic scanner wie bei den emojis einfach über nacht nutzt, weil
 * es günstiger ist" (Florian, 02.11.2026).
 *
 * Gelesen wird im Nachtbatch, siehe postkarte/nachtlesung.ts. Hier
 * landet nur das Bild, mit Stand "wartet".
 *
 * Dasselbe Foto zweimal faellt schon hier auf, ueber die Pruefsumme.
 * Der Abgleich ueber den Text kann das noch nicht leisten, den Text
 * gibt es ja noch nicht.
 */
export async function fotoAblegen(o: {
  bild: Buffer;
  bildTyp: string;
  von: string;
  einwilligung?: string;
}): Promise<{ id: string; schonDa: boolean }> {
  const md5 = createHash("md5").update(o.bild).digest("hex");

  const [vorhanden] = (await db()`
    select id from postkarte where bild_md5 = ${md5} and status <> 'verworfen' limit 1
  `) as Array<{ id: string }>;
  if (vorhanden) return { id: String(vorhanden.id), schonDa: true };

  const [z] = (await db()`
    insert into postkarte (status, bild, bild_typ, bild_md5, einwilligung, gescannt_von)
    values ('wartet', ${o.bild}, ${o.bildTyp}, ${md5},
            ${o.einwilligung ?? "unbekannt"}, ${o.von})
    returning id
  `) as Array<{ id: string }>;
  return { id: String(z.id), schonDa: false };
}

/** Wie viele Karten auf die Nachtlesung warten. */
export async function wartendeKarten(): Promise<number> {
  const [z] = (await db()`
    select count(*)::int as n from postkarte where status = 'wartet'
  `) as Array<{ n: number }>;
  return Number(z?.n ?? 0);
}

/** Das Original einer Karte. Nur für angemeldete Leute. */
export async function bildHolen(id: string): Promise<{ bild: Buffer; typ: string } | null> {
  const [z] = (await db()`
    select bild, bild_typ from postkarte where id = ${id}::uuid
  `) as Array<{ bild: Buffer | null; bild_typ: string }>;
  if (!z?.bild) return null;
  return { bild: Buffer.from(z.bild), typ: String(z.bild_typ || "image/jpeg") };
}

export async function karten(o: {
  status?: Kartenstand;
  abBewertung?: number;
  nurHighlights?: boolean;
  anzahl?: number;
} = {}): Promise<Postkarte[]> {
  const anzahl = Math.max(1, Math.min(500, o.anzahl ?? 60));
  const zeilen = (await db()`
    select id, status, (bild is not null) as hat_bild, bild_oeffentlich, transkript, zitat,
           zusammenfassung, stimmung, bewertung, themen, gelesen, datenschutz, personenbezug,
           einwilligung, highlight, dublette_von, show, gescannt_von, notiz, fehler,
           erstellt_am, veroeffentlicht_am
      from postkarte
     where (${o.status ?? null}::text is null or status = ${o.status ?? null})
       and bewertung >= ${o.abBewertung ?? 0}
       and (${o.nurHighlights ?? false} = false or highlight)
     order by erstellt_am desc
     limit ${anzahl}
  `) as Array<Record<string, unknown>>;
  return zeilen.map(baue);
}

export async function karteHolen(id: string): Promise<Postkarte | null> {
  const [z] = (await db()`
    select id, status, (bild is not null) as hat_bild, bild_oeffentlich, transkript, zitat,
           zusammenfassung, stimmung, bewertung, themen, gelesen, datenschutz, personenbezug,
           einwilligung, highlight, dublette_von, show, gescannt_von, notiz, fehler,
           erstellt_am, veroeffentlicht_am
      from postkarte where id = ${id}::uuid
  `) as Array<Record<string, unknown>>;
  return z ? baue(z) : null;
}

/** Der Stand für das Armaturenbrett. */
export async function stand(): Promise<{
  gesamt: number;
  gelesen: number;
  geeignet: number;
  veroeffentlicht: number;
  zurueck: number;
  gesperrt: number;
  schnitt: number;
}> {
  const [z] = (await db()`
    select count(*)::int as gesamt,
           count(*) filter (where status = 'gelesen')::int as gelesen,
           count(*) filter (where bewertung >= 9 and status <> 'verworfen')::int as geeignet,
           count(*) filter (where status = 'freigegeben' and datenschutz = 'frei')::int as veroeffentlicht,
           count(*) filter (where status = 'zurueck')::int as zurueck,
           count(*) filter (where datenschutz = 'gesperrt')::int as gesperrt,
           coalesce(round(avg(bewertung) filter (where bewertung > 0), 1), 0)::float as schnitt
      from postkarte
  `) as Array<Record<string, unknown>>;
  return {
    gesamt: Number(z?.gesamt ?? 0),
    gelesen: Number(z?.gelesen ?? 0),
    geeignet: Number(z?.geeignet ?? 0),
    veroeffentlicht: Number(z?.veroeffentlicht ?? 0),
    zurueck: Number(z?.zurueck ?? 0),
    gesperrt: Number(z?.gesperrt ?? 0),
    schnitt: Number(z?.schnitt ?? 0),
  };
}

export async function standSetzen(id: string, status: Kartenstand, notiz = ""): Promise<void> {
  await db()`
    update postkarte
       set status = ${status},
           notiz = case when ${notiz} = '' then notiz else ${notiz} end,
           veroeffentlicht_am = case when ${status} = 'freigegeben' then now() else veroeffentlicht_am end
     where id = ${id}::uuid
  `;
}

/**
 * Die geschwärzte Fassung eintragen und damit den Datenschutz abhaken.
 *
 * Das geht nur zusammen: Freigegeben ist eine Karte erst, wenn es ein
 * Bild gibt, auf dem nichts Persönliches mehr steht. Wer nur den Haken
 * setzen will, kommt hier nicht durch.
 */
export async function datenschutzFreigeben(id: string, bildUrl: string, von: string): Promise<void> {
  await db()`
    update postkarte
       set datenschutz = 'frei',
           bild_oeffentlich = ${bildUrl},
           notiz = case when notiz = '' then ${`Schwärzung bestätigt von ${von}`} else notiz end
     where id = ${id}::uuid
  `;
}

export async function datenschutzSperren(id: string, grund: string): Promise<void> {
  await db()`
    update postkarte
       set datenschutz = 'gesperrt', bild_oeffentlich = '', status = 'zurueck', notiz = ${grund}
     where id = ${id}::uuid
  `;
}

export async function highlightSetzen(id: string, an: boolean): Promise<void> {
  await db()`update postkarte set highlight = ${an} where id = ${id}::uuid`;
}

export async function zitatAendern(id: string, zitat: string): Promise<void> {
  await db()`update postkarte set zitat = ${zitat} where id = ${id}::uuid`;
}

/**
 * Die Karten für die öffentliche Wand.
 *
 * Zwei Bedingungen, und beide müssen erfüllt sein: freigegeben UND
 * datenschutzrechtlich frei. Dazu eine geschwärzte Fassung, denn ohne
 * Bild gibt es nichts zu zeigen.
 */
export async function wand(o: { thema?: string; anzahl?: number } = {}): Promise<Array<{
  id: string;
  zitat: string;
  transkriptKurz: string;
  bild: string;
  themen: string[];
  stimmung: string;
  bewertung: number;
  highlight: boolean;
  show: string;
}>> {
  const anzahl = Math.max(1, Math.min(300, o.anzahl ?? 120));
  const zeilen = (await db()`
    select id, zitat, bild_oeffentlich, themen, stimmung, bewertung, highlight, show
      from postkarte
     where status = 'freigegeben'
       and datenschutz = 'frei'
       and bild_oeffentlich <> ''
       and (${o.thema ?? null}::text is null or ${o.thema ?? null} = any(themen))
     order by highlight desc, bewertung desc, veroeffentlicht_am desc
     limit ${anzahl}
  `) as Array<Record<string, unknown>>;

  return zeilen.map((r) => ({
    id: String(r.id),
    zitat: String(r.zitat ?? ""),
    /*
      Nach draussen geht nur das Zitat, nie das Transkript.

      Gefunden am 30.10.2026: Das Bild war geschwaerzt, der Text nicht.
      Ueber diese Schnittstelle gingen Anrede, Name und vollstaendige
      Anschrift im Klartext hinaus, und auf der Gaestewand standen sie,
      sobald jemand eine Karte antippte.

      Das Zitat ist die einzige Fassung, die ein Mensch gesehen und
      freigegeben hat; es laesst sich im Eventmanager auch berichtigen.
      Das Transkript dagegen ist die Rohlesung der ganzen Karte, Adresse
      inbegriffen. Es bleibt im Haus.
    */
    transkriptKurz: String(r.zitat ?? ""),
    bild: String(r.bild_oeffentlich ?? ""),
    themen: Array.isArray(r.themen) ? r.themen.map(String) : [],
    stimmung: String(r.stimmung ?? ""),
    bewertung: Number(r.bewertung ?? 0),
    highlight: Boolean(r.highlight),
    show: String(r.show ?? ""),
  }));
}
