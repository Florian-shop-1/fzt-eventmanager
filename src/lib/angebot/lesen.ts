/**
 * Angebote lesen, samt Öffnungen des Kunden.
 *
 * Zwei Zugänge, bewusst getrennt:
 *  - `holeAngebot` für das Team, über die Angebotskennung.
 *  - `holeAngebotFuerKunden` über den Zufallsschlüssel aus dem Link. Diese
 *    Funktion gibt nur heraus, was der Kunde sehen soll, und protokolliert
 *    den Aufruf.
 */

import { nachHausordnung } from "./reihenfolge";
import { db } from "@/lib/db/client";
import type { Position } from "@/lib/domain/vorgang";
import { oeffnungMelden } from "./oeffnungsmeldung";

export interface AngebotDetail {
  id: string;
  nummer: string;
  vorgangId: string;
  erstelltAm: string;
  gueltigBis: string;
  einleitung: string;
  /** Hat ein Mensch die Reihenfolge der Positionen festgelegt? */
  reihenfolgeManuell: boolean;
  schlusstext: string;
  trackingToken: string;
  versendetAm: string | null;
  angenommenAm: string | null;
  angenommenVon: string | null;
  abgelehntAm: string | null;
  ablehnungsgrund: string | null;
  /**
   * Wie viele Plätze dieses Angebot festhält, und bis wann.
   *
   * Null, solange kein Termin feststand oder FloTix gerade nicht
   * erreichbar war. Dann steht auf der Kundenseite nichts dazu, und das
   * ist richtig so: lieber keine Zusage als eine falsche.
   */
  plaetzeGehalten: number;
  plaetzeBis: string | null;
  /**
   * Was der Kunde geaendert haben moechte, in seinen eigenen Worten.
   * Das Angebot bleibt dabei offen, siehe migrations/219.
   */
  aenderungWunsch: string | null;
  aenderungAm: string | null;
  positionen: Position[];
  oeffnungen: Array<{ zeitpunkt: string; geraet: string | null }>;
  kunde: {
    name: string;
    ansprechpartner: string | null;
    email: string;
    /* Die Anschrift fuer das Adressfeld im PDF (Florian, 15.10.2026). */
    strasse: string | null;
    plz: string | null;
    ort: string | null;
  };
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
    optional: Boolean(z.optional),
  };
}

async function baueAngebot(zeilen: Record<string, unknown>[]): Promise<AngebotDetail | null> {
  if (zeilen.length === 0) return null;
  const a = zeilen[0];
  const id = String(a.id);

  const positionen = (await db()`
    select id, artikel_nummer, bezeichnung, beschreibung, menge, einheit,
           einzel_brutto_cent, ust, rabatt_prozent, ist_alternative_zu, optional
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
    reihenfolgeManuell: Boolean(a.reihenfolge_manuell),
    schlusstext: String(a.schlusstext),
    trackingToken: String(a.tracking_token),
    versendetAm: a.versendet_am ? new Date(a.versendet_am as string).toISOString() : null,
    angenommenAm: a.angenommen_am ? new Date(a.angenommen_am as string).toISOString() : null,
    angenommenVon: (a.angenommen_von as string) ?? null,
    abgelehntAm: a.abgelehnt_am ? new Date(a.abgelehnt_am as string).toISOString() : null,
    ablehnungsgrund: (a.ablehnungsgrund as string) ?? null,
    plaetzeGehalten: Number(a.plaetze_gehalten ?? 0),
    plaetzeBis: a.plaetze_bis ? new Date(a.plaetze_bis as string).toISOString() : null,
    aenderungWunsch: (a.aenderung_wunsch as string) ?? null,
    aenderungAm: a.aenderung_am ? new Date(a.aenderung_am as string).toISOString() : null,
    /*
      Hat Kevin die Zeilen von Hand geordnet, gilt seine Reihenfolge.

      "kevin möchte gerne die einzelnen items in einem angebot per drag
      and drop neu sortieren können" (Florian, 30.10.2026). Sonst
      ordnet das Haus: Tickets zuerst, fest vor optional. Beides
      zugleich ginge nicht, dann wuerde das Programm sein Ziehen beim
      naechsten Laden zurueckwerfen.
    */
    positionen: a.reihenfolge_manuell
      ? positionen.map(zuPosition)
      : nachHausordnung(positionen.map(zuPosition)),
    oeffnungen: oeffnungen.map((o) => ({
      zeitpunkt: new Date(o.zeitpunkt).toISOString(),
      geraet: o.geraet,
    })),
    kunde: {
      name: String(a.kunde_name),
      ansprechpartner: (a.ansprechpartner as string) ?? null,
      email: String(a.email),
      strasse: (a.strasse as string) || null,
      plz: (a.plz as string) || null,
      ort: (a.ort as string) || null,
    },
    vorstellung: a.datum ? { datum: String(a.datum), show: String(a.show) } : null,
  };
}

const KOPF_ABFRAGE = `
  select a.id, a.nummer, a.vorgang_id, a.erstellt_am,
         to_char(a.gueltig_bis, 'YYYY-MM-DD') as gueltig_bis,
         a.einleitung, a.schlusstext, a.tracking_token, a.versendet_am,
         a.angenommen_am, a.angenommen_von, a.abgelehnt_am, a.ablehnungsgrund,
         a.plaetze_gehalten, a.plaetze_bis, a.aenderung_wunsch, a.aenderung_am,
         a.reihenfolge_manuell,
         k.name as kunde_name, k.ansprechpartner, k.email,
         k.strasse, k.plz, k.ort,
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
  /**
   * Den Besuch mitzaehlen.
   *
   * Falsch, wenn das Buero die Seite zur Vorschau oeffnet: Sonst steht
   * in der Oeffnungsliste ein Kunde, der nie da war, und Kevin ruft an,
   * weil er glaubt, jemand lese gerade (Florian, 29.10.2026).
   */
  protokollieren = true,
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

  if (protokollieren && !geradeEben) {
    await db()`
      insert into oeffnung (angebot_id, geraet) values (${angebot.id}, ${geraet})
    `;
    // Der Vorgang rückt auf "geöffnet", solange er noch nicht weiter ist.
    await db()`
      update vorgang set status = 'angebot_geoeffnet', geaendert_am = now()
       where id = ${angebot.vorgangId}
         and status in ('angebot_erstellt', 'angebot_versendet')
    `;

    /*
      Und jetzt soll Kevin anrufen.

      Die Meldung haengt bewusst hier und nicht am Mailversand: Eine
      geoeffnete Mail sagt wenig, eine geoeffnete Angebotsseite sagt,
      dass jemand gerade liest (Florian, 26.10.2026).

      Angehalten wird dafuer nichts. Faellt der Mailversand aus, sieht
      der Kunde sein Angebot trotzdem.
    */
    void oeffnungMelden(angebot);
  }

  return angebot;
}
