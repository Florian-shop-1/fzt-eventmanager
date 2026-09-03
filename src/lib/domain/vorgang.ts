/**
 * Ein Vorgang ist ein Firmenevent von der ersten Anfrage bis zur
 * Durchführung. Er hält alles zusammen: Kunde, Termin, Gruppen,
 * Angebote, Zahlungen und Notizen.
 */

import type { Buchungsgruppe, MenueVariante } from "./types";

/**
 * Stationen eines Vorgangs.
 *
 * Wichtig: Laut Angebotstext bleibt die Reservierung bis zum
 * vollständigen Zahlungseingang unverbindlich. Erst ab "bezahlt"
 * ist die Buchung fest, vorher sind Plätze nur vorgemerkt.
 */
export type VorgangStatus =
  | "anfrage"
  | "in_klaerung"
  | "angebot_erstellt"
  | "angebot_versendet"
  | "angebot_geoeffnet"
  | "angenommen"
  | "teilzahlung"
  | "bezahlt"
  | "durchgefuehrt"
  | "abgesagt";

export const STATUS_REIHENFOLGE: VorgangStatus[] = [
  "anfrage",
  "in_klaerung",
  "angebot_erstellt",
  "angebot_versendet",
  "angebot_geoeffnet",
  "angenommen",
  "teilzahlung",
  "bezahlt",
  "durchgefuehrt",
];

export const STATUS_LABEL: Record<VorgangStatus, string> = {
  anfrage: "Anfrage",
  in_klaerung: "In Klärung",
  angebot_erstellt: "Angebot erstellt",
  angebot_versendet: "Angebot versendet",
  angebot_geoeffnet: "Angebot geöffnet",
  angenommen: "Angenommen",
  teilzahlung: "Teilzahlung",
  bezahlt: "Bezahlt und fest",
  durchgefuehrt: "Durchgeführt",
  abgesagt: "Abgesagt",
};

export interface Kunde {
  id: string;
  /** Firmenname oder bei Privatfeiern der Nachname. */
  name: string;
  ansprechpartner?: string;
  anrede?: string;
  email: string;
  telefon?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  /** Kundennummer in lexoffice, falls dort schon angelegt. */
  lexofficeKundennummer?: string;
  lexofficeKontaktId?: string;
  notiz?: string;
}

export interface Vorstellung {
  /** Datum im Format JJJJ-MM-TT. */
  datum: string;
  /** Name der Show, zum Beispiel "ULMfassbar by Florian Zimmer". */
  show: string;
  /** Kennung der Vorstellung in Ditix, sobald die Anbindung steht. */
  ditixEventId?: string;
}

/** Eine Position im Angebot, aufgebaut wie in den Musterangeboten. */
export interface Position {
  id: string;
  artikelNummer: string;
  bezeichnung: string;
  beschreibung?: string;
  menge: number;
  einheit: string;
  einzelBruttoCent: number;
  ust: number;
  rabattProzent?: number;
  /**
   * Alternativpositionen erscheinen im Angebot unter der Hauptposition
   * und zählen nicht zur Summe. Der Kunde wählt eine davon aus.
   */
  istAlternativeZu?: string;
}

/** Nachweis, dass und wann der Kunde das Angebot angesehen hat. */
export interface Oeffnung {
  zeitpunkt: string;
  /** Grob, ohne IP-Adresse zu speichern. */
  geraet?: string;
}

export interface Angebot {
  id: string;
  /** Format AG-MMJJ-NNNN, wie in lexoffice. */
  nummer: string;
  erstelltAm: string;
  gueltigBis: string;
  positionen: Position[];
  /** Einleitungstext mit dem Ablaufplan des Abends. */
  einleitung: string;
  /** Schlusstext mit den Bedingungen. */
  schlusstext: string;
  /** Zufälliger Schlüssel für den persönlichen Angebotslink. */
  trackingToken: string;
  versendetAm?: string;
  oeffnungen: Oeffnung[];
  angenommenAm?: string;
  /** Name, den der Kunde beim Annehmen eingegeben hat. */
  angenommenVon?: string;
  abgelehntAm?: string;
  ablehnungsgrund?: string;
  lexofficeVoucherId?: string;
}

export interface Zahlung {
  id: string;
  datum: string;
  betragCent: number;
  art: "anzahlung" | "restzahlung" | "vollzahlung" | "erstattung";
  notiz?: string;
  lexofficeBelegId?: string;
}

export interface Notiz {
  id: string;
  zeitpunkt: string;
  benutzer: string;
  text: string;
}

export interface Aufgabe {
  id: string;
  faellig: string;
  text: string;
  erledigt: boolean;
  benutzer?: string;
}

/** Menüwahl und Unverträglichkeiten, die der Kunde nachreicht. */
export interface Gastangaben {
  menues: Partial<Record<MenueVariante, number>>;
  unvertraeglichkeiten: string;
  /** Namen für Tischkarten, optional. */
  gaesteliste?: string[];
  eingegangenAm?: string;
}

export interface Vorgang {
  id: string;
  /** Fortlaufende interne Nummer, Format V-MMJJ-NNN. */
  nummer: string;
  status: VorgangStatus;
  kunde: Kunde;
  vorstellung: Vorstellung;
  /** Gruppen für den Sitzplaner. Meist eine, bei großen Firmen mehrere. */
  gruppen: Buchungsgruppe[];
  angebote: Angebot[];
  zahlungen: Zahlung[];
  notizen: Notiz[];
  aufgaben: Aufgabe[];
  gastangaben?: Gastangaben;
  /** Woher die Anfrage kam: Meta-Lead, Webshop-Formular, Telefon, Mail. */
  quelle: string;
  erstelltAm: string;
  geaendertAm: string;
}

/** Gesamtzahl der Personen eines Vorgangs über alle Gruppen. */
export function personenGesamt(v: Vorgang): number {
  return v.gruppen.reduce((s, g) => s + g.personen, 0);
}

/** Das zuletzt erstellte Angebot, falls es eines gibt. */
export function aktuellesAngebot(v: Vorgang): Angebot | undefined {
  return v.angebote[v.angebote.length - 1];
}

/** Summe aller eingegangenen Zahlungen, Erstattungen abgezogen. */
export function gezahltCent(v: Vorgang): number {
  return v.zahlungen.reduce(
    (s, z) => s + (z.art === "erstattung" ? -z.betragCent : z.betragCent),
    0,
  );
}

/**
 * Ab wann gilt ein Platz als gebucht statt nur reserviert?
 *
 * Maßgeblich ist der Satz aus euren Angeboten: Erst mit dem vollständigen
 * Zahlungseingang gilt die Buchung als fest bestätigt. Eine Teilzahlung
 * reicht dafür ausdrücklich nicht.
 */
export function sicherheitAusStatus(status: VorgangStatus): "reserviert" | "gebucht" {
  return status === "bezahlt" || status === "durchgefuehrt" ? "gebucht" : "reserviert";
}
