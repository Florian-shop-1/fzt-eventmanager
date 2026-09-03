/** Ergebnistypen des Sitzplaners. */

import type { BereichId, Buchungsgruppe, Sicherheit } from "@/lib/domain/types";

/** Eine Gruppe sitzt in einer oder mehreren zusammengelegten Logen. */
export interface LogenZuteilung {
  gruppeId: string;
  gruppeName: string;
  /** Reserviert oder gebucht, damit im Plan sichtbar ist, was fest steht. */
  sicherheit: Sicherheit;
  /** Zu welcher Show des Tages die Gruppe gehoert. Fuer den Service. */
  show?: Buchungsgruppe["show"];
  /** Vorgang der Gruppe, um von hier aus freigeben zu koennen. */
  vorgangId?: string;
  vorgangNummer?: string;
  /** Zusammenhaengende Logennummern, z.B. [3, 4]. */
  logenNummern: number[];
  personen: number;
  /** Regulaere Gedecke der belegten Logen zusammen. */
  plaetzeGesamt: number;
  /** Plaetze, die leer bleiben und nicht mehr verkauft werden koennen. */
  freiePlaetze: number;
  /** Zusatzstuehle an der Stirnseite, die gestellt werden muessen. */
  notstuehle: number;
  /** true, wenn Vorhaenge geoeffnet werden muessen. */
  vorhaengeOeffnen: boolean;
}

/** Eine Gruppe sitzt an einem oder mehreren zusammengestellten Tischen. */
export interface GalerieZuteilung {
  gruppeId: string;
  gruppeName: string;
  sicherheit: Sicherheit;
  show?: Buchungsgruppe["show"];
  vorgangId?: string;
  vorgangNummer?: string;
  tischIds: string[];
  /** Menschenlesbar, z.B. "Vierertisch 2 + Zweiertisch 1". */
  tischBeschreibung: string;
  personen: number;
  plaetzeGesamt: number;
  freiePlaetze: number;
}

export type HinweisArt =
  | "unterbelegung"
  | "kleine_gruppe_in_loge"
  | "grosse_gruppe_in_galerie"
  | "logen_luecke"
  | "notstuhl"
  | "kein_platz"
  | "reservierung"
  | "kapazitaet";

export type Schwere = "info" | "warnung" | "blocker";

export interface Hinweis {
  art: HinweisArt;
  schwere: Schwere;
  gruppeId?: string;
  text: string;
  /**
   * Betrag in Cent, den der Kunde als Ausgleich fuer nicht verkaufbare
   * Plaetze zahlen soll. Nur bei art "unterbelegung" gesetzt.
   */
  differenzCent?: number;
  /** true, wenn der Hinweis per Ausnahme abgeschaltet werden darf. */
  ausnahmeMoeglich: boolean;
  /** true, wenn bereits eine Ausnahme fuer diese Gruppe hinterlegt ist. */
  ausnahmeAktiv?: boolean;
}

export interface NichtPlatziert {
  gruppeId: string;
  gruppeName: string;
  personen: number;
  grund: string;
}

/** Ein vollstaendiger Platzierungsvorschlag fuer eine Vorstellung. */
export interface Plan {
  logen: LogenZuteilung[];
  galerie: GalerieZuteilung[];
  nichtPlatziert: NichtPlatziert[];
  hinweise: Hinweis[];
  /** Niedriger ist besser. Nur zum Vergleich von Varianten gedacht. */
  kosten: number;
  /** Klartextbegruendung, die im Programm angezeigt wird. */
  begruendung: string[];
  /** Summe aller Unterbelegungs-Differenzen in Cent. */
  differenzGesamtCent: number;
  /**
   * Wie viele der platzierten Gaeste fest gebucht sind und wie viele nur
   * reserviert. Sagt eine Firma ab, werden die reservierten Plaetze frei.
   */
  sicherheit: { gebucht: number; reserviert: number };
  auslastung: Record<BereichId, { belegt: number; kapazitaet: number }>;
}

export interface PlanerOptionen {
  /**
   * Ab dieser Gruppengroesse ist eine Loge sinnvoll. Darunter empfiehlt
   * der Planer die Eventgalerie. Laut Florian: unter 5 Personen Hinweis geben.
   */
  logeAbPersonen: number;
  /**
   * Zwei fremde Gruppen in dieselbe Loge zu setzen ist verboten.
   * Nur fuer Notfaelle und nur bewusst umschaltbar.
   */
  erlaubeGemischteLogen: boolean;
  /** Notstuhl an der Stirnseite mit einplanen (13. Gast in einer 12er-Loge). */
  erlaubeNotstuhl: boolean;
  /** Wie viele Varianten der Planer zurueckgeben soll. */
  anzahlVarianten: number;
}

export const STANDARD_OPTIONEN: PlanerOptionen = {
  logeAbPersonen: 5,
  erlaubeGemischteLogen: false,
  erlaubeNotstuhl: true,
  anzahlVarianten: 3,
};

export type { Buchungsgruppe };
