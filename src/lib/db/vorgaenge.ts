/**
 * Lesezugriffe auf Vorgänge.
 *
 * Läuft ausschließlich auf dem Server. Die Datenbank kennt nur
 * Kleinschreibung mit Unterstrich, im Programm heißen die Felder
 * wie üblich in TypeScript, deshalb die Umbenennung beim Lesen.
 */

import { db } from "./client";
import type { Buchungsgruppe, Herkunft, MenueVariante } from "@/lib/domain/types";
import { sicherheitAusStatus, type VorgangStatus } from "@/lib/domain/vorgang";

/** Eine Zeile in der Vorgangsübersicht. */
export interface VorgangZeile {
  id: string;
  nummer: string;
  status: VorgangStatus;
  kundeName: string;
  ansprechpartner: string | null;
  /** null, solange kein Termin feststeht. */
  datum: string | null;
  show: string | null;
  /** Grobe Angabe aus der Anfrage, etwa "11-50", wenn kein Termin feststeht. */
  personenUngefaehr: string | null;
  wunschzeitraum: string | null;
  personen: number;
  /** Anzahl der Angebote, die zu diesem Vorgang gehören. */
  angebote: number;
  /** Wann der Kunde das Angebot zuletzt geöffnet hat. */
  letzteOeffnung: string | null;
  /** Wie oft insgesamt geöffnet wurde. */
  oeffnungen: number;
  angebotVersendetAm: string | null;
  angenommenAm: string | null;
  gezahltCent: number;
  offeneAufgaben: number;
}

export async function listeVorgaenge(): Promise<VorgangZeile[]> {
  const zeilen = (await db()`
    select
      v.id,
      v.nummer,
      v.status,
      k.name                as kunde_name,
      k.ansprechpartner,
      to_char(s.datum, 'YYYY-MM-DD') as datum,
      s.show,
      v.personen_ungefaehr,
      v.wunschzeitraum,
      coalesce((select sum(g.personen) from gruppe g where g.vorgang_id = v.id), 0)::int as personen,
      (select count(*) from angebot a where a.vorgang_id = v.id)::int as angebote,
      (select max(o.zeitpunkt) from oeffnung o
         join angebot a on a.id = o.angebot_id
        where a.vorgang_id = v.id)                                    as letzte_oeffnung,
      (select count(*) from oeffnung o
         join angebot a on a.id = o.angebot_id
        where a.vorgang_id = v.id)::int                               as oeffnungen,
      (select max(a.versendet_am) from angebot a where a.vorgang_id = v.id) as angebot_versendet_am,
      (select max(a.angenommen_am) from angebot a where a.vorgang_id = v.id) as angenommen_am,
      coalesce((select sum(case when z.art = 'erstattung' then -z.betrag_cent else z.betrag_cent end)
                  from zahlung z where z.vorgang_id = v.id), 0)::int  as gezahlt_cent,
      (select count(*) from aufgabe f
        where f.vorgang_id = v.id and f.erledigt = false)::int        as offene_aufgaben
    from vorgang v
    join kunde k            on k.id = v.kunde_id
    left join vorstellung s on s.id = v.vorstellung_id
    -- Vorgaenge ohne Termin nach hinten, sie sind noch nicht terminiert.
    order by s.datum asc nulls last, v.nummer asc
  `) as Record<string, unknown>[];

  return zeilen.map((z) => ({
    id: String(z.id),
    nummer: String(z.nummer),
    status: z.status as VorgangStatus,
    kundeName: String(z.kunde_name),
    ansprechpartner: (z.ansprechpartner as string) ?? null,
    datum: (z.datum as string) ?? null,
    show: (z.show as string) ?? null,
    personenUngefaehr: (z.personen_ungefaehr as string) ?? null,
    wunschzeitraum: (z.wunschzeitraum as string) ?? null,
    personen: Number(z.personen),
    angebote: Number(z.angebote),
    letzteOeffnung: z.letzte_oeffnung ? new Date(z.letzte_oeffnung as string).toISOString() : null,
    oeffnungen: Number(z.oeffnungen),
    angebotVersendetAm: z.angebot_versendet_am
      ? new Date(z.angebot_versendet_am as string).toISOString()
      : null,
    angenommenAm: z.angenommen_am ? new Date(z.angenommen_am as string).toISOString() : null,
    gezahltCent: Number(z.gezahlt_cent),
    offeneAufgaben: Number(z.offene_aufgaben),
  }));
}

/** Ein Abend mit allen Gruppen, die an diesem Tag im Haus sind. */
export interface VorstellungZeile {
  id: string;
  datum: string;
  show: string;
  vorgaenge: number;
  personen: number;
}

export async function listeVorstellungen(): Promise<VorstellungZeile[]> {
  const zeilen = (await db()`
    select
      s.id,
      to_char(s.datum, 'YYYY-MM-DD') as datum,
      s.show,
      v.personen_ungefaehr,
      v.wunschzeitraum,
      (select count(*) from vorgang v where v.vorstellung_id = s.id)::int as vorgaenge,
      coalesce((select sum(g.personen)
                  from gruppe g
                  join vorgang v on v.id = g.vorgang_id
                 where v.vorstellung_id = s.id
                   and v.status <> 'abgesagt'), 0)::int as personen
    from vorstellung s
    order by s.datum asc
  `) as Record<string, unknown>[];

  return zeilen.map((z) => ({
    id: String(z.id),
    datum: String(z.datum),
    show: String(z.show),
    vorgaenge: Number(z.vorgaenge),
    personen: Number(z.personen),
  }));
}

export interface VorgangDetail {
  id: string;
  nummer: string;
  status: VorgangStatus;
  quelle: string | null;
  erstelltAm: string;
  kunde: {
    id: string;
    name: string;
    ansprechpartner: string | null;
    anrede: string | null;
    email: string;
    telefon: string | null;
    strasse: string | null;
    plz: string | null;
    ort: string | null;
  };
  /** null, solange kein Termin feststeht. */
  vorstellung: { id: string; datum: string; show: string; ditixEventId: string | null } | null;
  personenUngefaehr: string | null;
  wunschzeitraum: string | null;
  gruppen: Buchungsgruppe[];
  notizen: Array<{ id: string; benutzer: string; text: string; zeitpunkt: string }>;
  aufgaben: Array<{ id: string; faellig: string; text: string; erledigt: boolean }>;
  zahlungen: Array<{ id: string; datum: string; betragCent: number; art: string; notiz: string | null }>;
  /** Alle Vorgänge desselben Kunden, für die Historie. */
  historie: Array<{ id: string; nummer: string; datum: string | null; show: string | null; personen: number; status: string }>;
}

export async function holeVorgang(id: string): Promise<VorgangDetail | null> {
  const kopf = (await db()`
    select v.id, v.nummer, v.status, v.quelle, v.erstellt_am,
           v.personen_ungefaehr, v.wunschzeitraum,
           k.id as kunde_id, k.name as kunde_name, k.ansprechpartner, k.anrede,
           k.email, k.telefon, k.strasse, k.plz, k.ort,
           s.id as vorstellung_id, to_char(s.datum, 'YYYY-MM-DD') as datum, s.show,
           s.ditix_event_id
      from vorgang v
      join kunde k            on k.id = v.kunde_id
      left join vorstellung s on s.id = v.vorstellung_id
     where v.id = ${id}
  `) as Record<string, unknown>[];

  if (kopf.length === 0) return null;
  const k = kopf[0];

  const gruppen = (await db()`
    select id, name, personen, herkunft, menues, unvertraeglichkeiten, bereich_fixiert,
           ausnahme_aktiv, ausnahme_grund, ausnahme_benutzer, ausnahme_gesetzt_am, notiz,
           getraenkepauschalen, sondervereinbarung,
           vor_ort_kassieren, vor_ort_betrag_cent, vor_ort_hinweis
      from gruppe where vorgang_id = ${id} order by sortierung, personen desc
  `) as Record<string, unknown>[];

  const notizen = (await db()`
    select id, benutzer, text, zeitpunkt from notiz
     where vorgang_id = ${id} order by zeitpunkt desc
  `) as Record<string, unknown>[];

  const aufgaben = (await db()`
    select id, to_char(faellig, 'YYYY-MM-DD') as faellig, text, erledigt
      from aufgabe where vorgang_id = ${id} order by erledigt, faellig
  `) as Record<string, unknown>[];

  const zahlungen = (await db()`
    select id, to_char(datum, 'YYYY-MM-DD') as datum, betrag_cent, art, notiz
      from zahlung where vorgang_id = ${id} order by datum
  `) as Record<string, unknown>[];

  const historie = (await db()`
    select v.id, v.nummer, to_char(s.datum, 'YYYY-MM-DD') as datum, s.show, v.status,
           coalesce((select sum(g.personen) from gruppe g where g.vorgang_id = v.id), 0)::int as personen
      from vorgang v
      left join vorstellung s on s.id = v.vorstellung_id
     where v.kunde_id = ${String(k.kunde_id)} and v.id <> ${id}
     order by s.datum desc
  `) as Record<string, unknown>[];

  return {
    id: String(k.id),
    nummer: String(k.nummer),
    status: k.status as VorgangStatus,
    quelle: (k.quelle as string) ?? null,
    erstelltAm: new Date(k.erstellt_am as string).toISOString(),
    kunde: {
      id: String(k.kunde_id),
      name: String(k.kunde_name),
      ansprechpartner: (k.ansprechpartner as string) ?? null,
      anrede: (k.anrede as string) ?? null,
      email: String(k.email),
      telefon: (k.telefon as string) ?? null,
      strasse: (k.strasse as string) ?? null,
      plz: (k.plz as string) ?? null,
      ort: (k.ort as string) ?? null,
    },
    vorstellung: k.vorstellung_id
      ? {
          id: String(k.vorstellung_id),
          datum: String(k.datum),
          show: String(k.show),
          ditixEventId: (k.ditix_event_id as string) ?? null,
        }
      : null,
    personenUngefaehr: (k.personen_ungefaehr as string) ?? null,
    wunschzeitraum: (k.wunschzeitraum as string) ?? null,
    gruppen: gruppen.map((g) => zuBuchungsgruppe(g, k.status as VorgangStatus)),
    notizen: notizen.map((n) => ({
      id: String(n.id),
      benutzer: String(n.benutzer),
      text: String(n.text),
      zeitpunkt: new Date(n.zeitpunkt as string).toISOString(),
    })),
    aufgaben: aufgaben.map((a) => ({
      id: String(a.id),
      faellig: String(a.faellig),
      text: String(a.text),
      erledigt: Boolean(a.erledigt),
    })),
    zahlungen: zahlungen.map((z) => ({
      id: String(z.id),
      datum: String(z.datum),
      betragCent: Number(z.betrag_cent),
      art: String(z.art),
      notiz: (z.notiz as string) ?? null,
    })),
    historie: historie.map((h) => ({
      id: String(h.id),
      nummer: String(h.nummer),
      datum: (h.datum as string) ?? null,
      show: (h.show as string) ?? null,
      personen: Number(h.personen),
      status: String(h.status),
    })),
  };
}

/** Alle Gruppen eines Abends, quer über alle Vorgänge. Grundlage für den Sitzplan. */
export async function gruppenDerVorstellung(vorstellungId: string): Promise<Buchungsgruppe[]> {
  const zeilen = (await db()`
    select g.id, g.name, g.personen, g.herkunft, g.menues, g.unvertraeglichkeiten,
           g.bereich_fixiert, g.ausnahme_aktiv, g.ausnahme_grund, g.ausnahme_benutzer,
           g.ausnahme_gesetzt_am, g.notiz, g.sondervereinbarung, v.status
      from gruppe g
      join vorgang v on v.id = g.vorgang_id
     where v.vorstellung_id = ${vorstellungId}
       and v.status <> 'abgesagt'
     order by g.personen desc
  `) as Record<string, unknown>[];
  return zeilen.map((z) => zuBuchungsgruppe(z, z.status as VorgangStatus));
}

function zuBuchungsgruppe(
  z: Record<string, unknown>,
  status: VorgangStatus,
): Buchungsgruppe {
  return {
    id: String(z.id),
    name: String(z.name),
    personen: Number(z.personen),
    herkunft: z.herkunft as Herkunft,
    sicherheit: sicherheitAusStatus(status),
    menues: (z.menues ?? {}) as Partial<Record<MenueVariante, number>>,
    unvertraeglichkeiten: (z.unvertraeglichkeiten as string) ?? undefined,
    bereichFixiert: (z.bereich_fixiert as Buchungsgruppe["bereichFixiert"]) ?? undefined,
    ausnahme: z.ausnahme_aktiv
      ? {
          aktiv: true,
          grund: String(z.ausnahme_grund ?? ""),
          benutzer: (z.ausnahme_benutzer as string) ?? undefined,
          gesetztAm: z.ausnahme_gesetzt_am
            ? new Date(z.ausnahme_gesetzt_am as string).toISOString()
            : undefined,
        }
      : undefined,
    sondervereinbarung: (z.sondervereinbarung as string) ?? undefined,
    vorOrtKassieren: z.vor_ort_kassieren === true,
    vorOrtBetragCent: (z.vor_ort_betrag_cent as number) ?? undefined,
    vorOrtHinweis: (z.vor_ort_hinweis as string) ?? undefined,
    notiz: (z.notiz as string) ?? undefined,
    getraenkepauschalen: (z.getraenkepauschalen as string[]) ?? [],
  };
}
