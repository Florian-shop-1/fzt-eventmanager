/**
 * Fachliche Grundtypen fuer die Eventabwicklung im Florian Zimmer Theater.
 *
 * Wichtig zum Verstaendnis: Ein Menuegast belegt IMMER zwei Dinge:
 *   1. einen Essplatz in der Magicuisine (Loge oder Eventgalerie)
 *   2. einen Sitzplatz im Theatersaal fuer die Show (Empore oder Golden Seats)
 *
 * Ein Menue kann nur gemeinsam mit einem Showticket gebucht werden, das
 * Showticket haengt also immer am Menue. Die einzige Engstelle ist damit
 * der Essplatz: mehr Menues als Showtickets kann es gar nicht geben.
 */

/** Bereiche, in denen Gaeste platziert werden koennen. */
export type BereichId = "logen" | "eventgalerie" | "foyer";

/** Menuevarianten der Magicuisine. */
export type MenueVariante = "classic" | "sea" | "veggy" | "kids";

/** VIP-Baendchen mit inkludierten Getraenken. */
export type VipBaendchen = "silber" | "gold";

/**
 * Wie fest der Platz ist.
 *
 * Laut euren Angebotsbedingungen gilt: "Die Reservierung bleibt bis zum
 * Zahlungseingang unverbindlich." Erst mit dem Geld ist ein Platz gebucht,
 * vorher ist er reserviert und kann wieder frei werden.
 *
 * Buchungen aus dem Webshop sind immer gebucht, dort wird sofort bezahlt.
 */
export type Sicherheit = "reserviert" | "gebucht";

/** Woher die Buchung kommt. Steuert die Platzierungsstrategie. */
export type Herkunft =
  | "firma"        // Firmenevent, von Hand eingebucht
  | "privatgruppe" // private Feier, Geburtstag, Jubilaeum
  | "shop"         // ueber den Webshop gebucht, meist 2 bis 4 Tickets
  | "telefon";     // telefonisch angenommen

/**
 * Eine Buchungsgruppe, die zusammen sitzen will.
 * "Party" im gastronomischen Sinn: Menschen, die sich kennen.
 */
export interface Buchungsgruppe {
  id: string;
  /** Anzeigename, z.B. "Mueller GmbH" oder "Fam. Schneider". */
  name: string;
  /** Anzahl Personen, die einen Essplatz brauchen. */
  personen: number;
  herkunft: Herkunft;
  /**
   * Reserviert oder gebucht. Beides belegt Plätze, aber nur gebucht ist
   * verlässlich. Sagt der Kunde ab, werden reservierte Plätze wieder frei.
   */
  sicherheit: Sicherheit;
  /**
   * Zu welcher Vorstellung des Tages die Gruppe gehoert. An Tagen mit zwei
   * Shows essen alle gemeinsam um 18 Uhr, sitzen aber vor oder nach ihrer
   * eigenen Show am Tisch. Der Service braucht das, die Kueche nicht.
   */
  show?: { ditixEventId: string; uhrzeit: string; name: string; vorDerShow: boolean };
  /** Vorgang, aus dem die Gruppe stammt. Fehlt bei Shop-Buchungen. */
  vorgangId?: string;
  vorgangNummer?: string;
  /** Menuebestellung, aufgeschluesselt nach Variante. Summe = personen. */
  menues: Partial<Record<MenueVariante, number>>;
  /** Freitext pro Gruppe, z.B. "2x Nussallergie, 1x laktosefrei". */
  unvertraeglichkeiten?: string;
  /**
   * Artikelnummer der Getraenkepauschale, etwa FLATALL. Bei Firmenevents
   * gilt sie meist fuer die ganze Gruppe. Der Service braucht daraus vor
   * allem die Zahl der auszugebenden Armbaender.
   */
  /**
   * Artikelnummern der gebuchten Getraenkepauschalen. Mehrere sind
   * erlaubt: Softdrink zusammen mit Bier und Wein ist die haeufigste
   * Buchung, weil damit alle versorgt sind.
   */
  getraenkepauschalen?: string[];
  /**
   * Frei vereinbarte Leistung, im Klartext. Steht im Funktionsheet, damit
   * die Gastronomie sie ausgibt und spaeter abrechnen kann.
   */
  sondervereinbarung?: string;
  /**
   * true, wenn diese Gruppe am Abend am Tisch bezahlt. Nur in diesem Fall
   * bekommt die Gastronomie einen Preis zu sehen, denn sie kassiert ihn.
   */
  vorOrtKassieren?: boolean;
  /** Eingetragener Betrag in Cent. Leer heisst: aus den Menues gerechnet. */
  vorOrtBetragCent?: number;
  vorOrtHinweis?: string;
  /**
   * Wie viele Getraenkearmbaender diese Gruppe bekommt. Wird am Einlass
   * ausgegeben, deshalb steht die Zahl an der Gruppe und nicht nur als
   * Artikel im Angebot.
   */
  armbaender?: number;
  /** Erzwingt einen Bereich, uebersteuert die Empfehlung des Planers. */
  bereichFixiert?: BereichId;
  /** Ausnahme vom Unterbelegungs-Aufschlag, siehe Ausnahme. */
  ausnahme?: Ausnahme;
  notiz?: string;
}

/**
 * Bewusste Abweichung von einer Regel, die der Planer sonst als
 * Warnung meldet. Wird protokolliert, damit spaeter nachvollziehbar
 * bleibt, wer was warum entschieden hat.
 */
export interface Ausnahme {
  aktiv: boolean;
  /** Pflichtfeld, sobald aktiv true ist. */
  grund: string;
  /** Wer die Ausnahme gesetzt hat. */
  benutzer?: string;
  gesetztAm?: string;
}
