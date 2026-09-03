/**
 * Angebote lesen, samt Öffnungen des Kunden.
 *
 * Zwei Zugänge, bewusst getrennt:
 *  - `holeAngebot` für das Team, über die Angebotskennung.
 *  - `holeAngebotFuerKunden` über den Zufallsschlüssel aus dem Link. Diese
 *    Funktion gibt nur heraus, was der Kunde sehen soll, und protokolliert
 *    den Aufruf.
 */

import { db } from "@/lib/db/client";
import type { Position } from "@/lib/domain/vorgang";

export interface AngebotDetail {
  id: string;
  nummer: string;
  vorgangId: string;
  erstelltAm: string;
  gueltigBis: string;
  einleitung: string;
  schlusstext: string;
  trackingToken: string;
  versendetAm: string | null;
  angenommenAm: string | null;
  angenommenVon: string | null;
  abgelehntAm: string | null;
  ablehnungsgrund: string | null;
  positionen: Position[];
  oeffnungen: Array<{ zeitpunkt: string; geraet: string | null }>;
  kunde: { name: string; ansprechpartner: string | null; email: string };
  vorstellung: { datum: string; show: string } | null;
}

function zuPosition(z: Record<string, unknown>): Position {
  return {
    id: String(z.id),
    artikelNummer: String(z.artikel_nummer),
    bezeichnung: String(z.bezeichnung),
    beschreibung: (z.beschreibung as string) ?? undefined,
    menge: Number(z.menge),
    einheit: String(z.einheit),
    einzelBruttoCent: Number(z.einzel_brutto_cent),
    ust: Number(z.ust),
    rabattProzent: z.rabatt_prozent === null ? undefined : Number(z.rabatt_prozent),
    istAlternativeZu: (z.ist_alternative_zu as string) ?? undefined,
  };
}

async function baueAngebot(zeilen: Record<string, unknown>[]): Promise<AngebotDetail | null> {
  if (zeilen.length === 0) return null;
  const a = zeilen[0];
  const id = String(a.id);

  const positionen = (await db()`
    select id, artikel_nummer, bezeichnung, beschreibung, menge, einheit,
           einzel_brutto_cent, ust, rabatt_prozent, ist_alternative_zu
      from position where angebot_id = ${id} order by sortierung
  `) as Record<string, unknown>[];

  const oeffnungen = (await db()`
    select zeitpunkt, geraet from oeffnung where angebot_id = ${id} order by zeitpunkt desc
  `) as Array<{ zeitpunkt: string; geraet: string | null }>;

  return {
    id,
    nummer: String(a.nummer),
    vorgangId: String(a.vorgang_id),
    erstelltAm: new Date(a.erstellt_am as string).toISOString(),
    gueltigBis: String(a.gueltig_bis),
    einleitung: String(a.einleitung),
    schlusstext: String(a.schlusstext),
    trackingToken: String(a.tracking_token),
    versendetAm: a.versendet_am ? new Date(a.versendet_am as string).toISOString() : null,
    angenommenAm: a.angenommen_am ? new Date(a.angenommen_am as string).toISOString() : null,
    angenommenVon: (a.angenommen_von as string) ?? null,
    abgelehntAm: a.abgelehnt_am ? new Date(a.abgelehnt_am as string).toISOString() : null,
    ablehnungsgrund: (a.ablehnungsgrund as string) ?? null,
    positionen: positionen.map(zuPosition),
    oeffnungen: oeffnungen.map((o) => ({
      zeitpunkt: new Date(o.zeitpunkt).toISOString(),
      geraet: o.geraet,
    })),
    kunde: {
      name: String(a.kunde_name),
      ansprechpartner: (a.ansprechpartner as string) ?? null,
      email: String(a.email),
    },
    vorstellung: a.datum ? { datum: String(a.datum), show: String(a.show) } : null,
  };
}

const KOPF_ABFRAGE = `
  select a.id, a.nummer, a.vorgang_id, a.erstellt_am,
         to_char(a.gueltig_bis, 'YYYY-MM-DD') as gueltig_bis,
         a.einleitung, a.schlusstext, a.tracking_token, a.versendet_am,
         a.angenommen_am, a.angenommen_von, a.abgelehnt_am, a.ablehnungsgrund,
         k.name as kunde_name, k.ansprechpartner, k.email,
         to_char(s.datum, 'YYYY-MM-DD') as datum, s.show
    from angebot a
    join vorgang v      on v.id = a.vorgang_id
    join kunde k        on k.id = v.kunde_id
    left join vorstellung s on s.id = v.vorstellung_id
`;

/** Für das Team. */
export async function holeAngebot(angebotId: string): Promise<AngebotDetail | null> {
  const zeilen = (await db().query(KOPF_ABFRAGE + " where a.id = $1", [
    angebotId,
  ])) as Record<string, unknown>[];
  return baueAngebot(zeilen);
}

/** Alle Angebote eines Vorgangs, neueste zuerst. */
export async function angeboteZumVorgang(vorgangId: string): Promise<AngebotDetail[]> {
  const zeilen = (await db().query(
    KOPF_ABFRAGE + " where a.vorgang_id = $1 order by a.erstellt_am desc",
    [vorgangId],
  )) as Record<string, unknown>[];

  const ergebnis: AngebotDetail[] = [];
  for (const z of zeilen) {
    const eines = await baueAngebot([z]);
    if (eines) ergebnis.push(eines);
  }
  return ergebnis;
}

/**
 * Für den Kunden, über den Schlüssel aus seinem Link.
 * Der Aufruf wird protokolliert, sofern es kein wiederholtes Laden
 * innerhalb weniger Minuten ist.
 */
export async function holeAngebotFuerKunden(
  token: string,
  geraet: string | null,
): Promise<AngebotDetail | null> {
  const zeilen = (await db().query(KOPF_ABFRAGE + " where a.tracking_token = $1", [
    token,
  ])) as Record<string, unknown>[];

  const angebot = await baueAngebot(zeilen);
  if (!angebot) return null;

  // Mehrfaches Nachladen derselben Seite soll nicht als mehrere Öffnungen
  // gezählt werden. Innerhalb von zehn Minuten gilt es als ein Besuch.
  const letzte = angebot.oeffnungen[0];
  const geradeEben =
    letzte && Date.now() - new Date(letzte.zeitpunkt).getTime() < 10 * 60 * 1000;

  if (!geradeEben) {
    await db()`
      insert into oeffnung (angebot_id, geraet) values (${angebot.id}, ${geraet})
    `;
    // Der Vorgang rückt auf "geöffnet", solange er noch nicht weiter ist.
    await db()`
      update vorgang set status = 'angebot_geoeffnet', geaendert_am = now()
       where id = ${angebot.vorgangId}
         and status in ('angebot_erstellt', 'angebot_versendet')
    `;
  }

  return angebot;
}
