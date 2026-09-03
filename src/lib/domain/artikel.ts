/**
 * Artikelstamm des Florian Zimmer Theaters.
 *
 * Quellen: Artikelliste aus lexoffice (Stand 2026-08-22) sowie die beiden
 * Musterangebote AG-0826-1167 und AG-0826-1168.
 *
 * Alle Beträge sind BRUTTO in Cent. Die Artikelnummern entsprechen denen
 * in lexoffice, damit Positionen später eindeutig zugeordnet werden können.
 *
 * ACHTUNG, zwei offene Punkte (siehe README):
 *  - Bier- und Wein-Flat steht in der Artikelliste mit 25 Euro, in beiden
 *    Angeboten aber mit 35 Euro. Hier gilt vorläufig der Angebotspreis.
 *  - Steuersätze laut Florian (2026-08-23): Menüs 7 Prozent, Showtickets
 *    7 Prozent, zusätzliche Leistungen wie Geschenkboxen, Technik und
 *    Getränke 19 Prozent. Damit rechnen die bisherigen Angebote richtig.
 *    ACHTUNG: In der lexoffice-Artikelliste stehen die Menüs mit 19 Prozent.
 *    Dort sollte der Satz korrigiert werden, sonst erzeugt lexoffice bei
 *    direkt angelegten Belegen weiterhin 19 Prozent.
 */

export type Ustsatz = 0.07 | 0.19;

export type ArtikelGruppe =
  | "menue"
  | "ticket"
  | "getraenke"
  | "empfang"
  | "loge"
  | "foyer"
  | "highlight"
  | "technik"
  | "exklusiv"
  | "sonstiges";

export interface Artikel {
  /** Artikelnummer wie in lexoffice, sofern bekannt. */
  nummer: string;
  bezeichnung: string;
  beschreibung?: string;
  einheit: "Stück" | "Stunde" | "Person";
  bruttoCent: number;
  ust: Ustsatz;
  gruppe: ArtikelGruppe;
  /** true, wenn die Menge der Personenzahl entspricht. */
  proPerson?: boolean;
  /**
   * false bei Artikeln, die es nicht mehr zu kaufen gibt. Sie bleiben im
   * Stamm, damit alte Bestellungen lesbar bleiben, tauchen aber in keiner
   * Auswahlliste mehr auf.
   */
  aktiv?: boolean;
}

export const ARTIKEL: Artikel[] = [
  // Menüs
  {
    nummer: "4GANG",
    bezeichnung: "4-Gang-Menü (Classic, Vegan oder Sea)",
    beschreibung: "Wundervolles Menü by Osman Kavak",
    einheit: "Stück",
    bruttoCent: 6900,
    ust: 0.07,
    gruppe: "menue",
    proPerson: true,
  },
  {
    nummer: "4GANGLOGE",
    bezeichnung: "4-Gang-Menü LOGE",
    beschreibung: "Wundervolles Menü by Osman Kavak",
    einheit: "Stück",
    bruttoCent: 7900,
    ust: 0.07,
    gruppe: "menue",
    proPerson: true,
  },

  // Showtickets. Jeder Menügast bekommt eines dazu.
  {
    nummer: "TGS",
    bezeichnung: "Ticket Golden Seats",
    beschreibung: "Tickets in den ersten beiden Reihen nach Verfügbarkeit",
    einheit: "Stück",
    bruttoCent: 13900,
    ust: 0.07,
    gruppe: "ticket",
    proPerson: true,
  },
  {
    nummer: "TK1",
    bezeichnung: "Ticket Kat. 1",
    beschreibung: "Tickets in den Reihen drei bis fünf nach Verfügbarkeit",
    einheit: "Stück",
    bruttoCent: 9900,
    ust: 0.07,
    gruppe: "ticket",
    proPerson: true,
  },
  {
    nummer: "TK2",
    bezeichnung: "Ticket Kat. 2",
    beschreibung: "Tickets in Reihe sechs bis acht nach Verfügbarkeit",
    einheit: "Stück",
    bruttoCent: 8900,
    ust: 0.07,
    gruppe: "ticket",
    proPerson: true,
  },
  {
    nummer: "TK3",
    bezeichnung: "Ticket Kat. 3",
    beschreibung: "Tickets in Reihe 9 nach Verfügbarkeit",
    einheit: "Stück",
    bruttoCent: 4900,
    ust: 0.07,
    gruppe: "ticket",
    proPerson: true,
  },

  // Getränkepauschalen
  {
    nummer: "FLATSOFT",
    bezeichnung: "Softdrink-Flat",
    beschreibung:
      "Ensinger Gourmet Wasser, Burkhardt Fruchtsäfte und Softdrinks by Coca-Cola, bis einschließlich Pause",
    einheit: "Stück",
    bruttoCent: 1900,
    ust: 0.19,
    gruppe: "getraenke",
    proPerson: true,
  },
  {
    nummer: "FLATBIERWEIN",
    bezeichnung: "Bier- und Wein-Flat (bis einschließlich Pause)",
    beschreibung:
      "Regionales Gold Ochsen Bier vom Fass und Magicuvée vom Weingut Markus Meier in Rot, Weiß oder Rosé",
    einheit: "Stück",
    bruttoCent: 3500,
    ust: 0.19,
    gruppe: "getraenke",
    proPerson: true,
  },
  {
    nummer: "FLATALL",
    bezeichnung: "ALL-INKLUSIVE-FLAT",
    beschreibung:
      "Alle Getränke bis nach der Show inklusive, außer Champagner und Kaffeespezialitäten. Nur diese Flat gilt auch nach der Show",
    einheit: "Stück",
    bruttoCent: 8800,
    ust: 0.19,
    gruppe: "getraenke",
    proPerson: true,
  },

  // Empfang
  {
    nummer: "EMPFANG",
    bezeichnung: "Magicuvée-Empfang auf unserer Eventgalerie",
    beschreibung: "Magicuvée prickelnd zum Empfang, Upgrade auf Champagner gegen Aufpreis",
    einheit: "Stück",
    bruttoCent: 1200,
    ust: 0.19,
    gruppe: "empfang",
    proPerson: true,
  },

  // Loge
  {
    nummer: "DEKOLOGE",
    bezeichnung: "Dekoration Loge",
    beschreibung: "Stilvolle Dekoration mit Blumen und dekorativen Akzenten",
    einheit: "Stück",
    bruttoCent: 13900,
    ust: 0.19,
    gruppe: "loge",
  },

  // Stehtische im Foyer
  {
    nummer: "STEHSILVER",
    bezeichnung: "SILVER-Stehtisch in der Pause (für zwei)",
    beschreibung:
      "Reservierter Stehtisch im Foyer mit zwei Gläsern Magicuvée prickelnd, einer Zauberschnitte zum Teilen (Pinsa) und einer Süßigkeit",
    einheit: "Stück",
    bruttoCent: 3500,
    ust: 0.19,
    gruppe: "foyer",
  },
  {
    nummer: "STEHGOLD",
    bezeichnung: "GOLD-Stehtisch in der Pause (ideal für zwei Personen)",
    beschreibung:
      "Reservierter Stehtisch im Foyer mit einer Flasche (0,7) Magicuvée prickelnd, einer Zauberschnitte zum Teilen (Pinsa) und einmal Popcorn",
    einheit: "Stück",
    bruttoCent: 5500,
    ust: 0.19,
    gruppe: "foyer",
  },
  {
    // Nicht mehr im Shop wählbar, steht aber noch in alten Bestellungen
    // und in der lexoffice-Artikelliste.
    nummer: "STEHDIAMOND",
    bezeichnung: "DIAMOND-Stehtisch DELUXE (ideal für zwei)",
    beschreibung:
      "Reservierter Stehtisch im Foyer mit einer Flasche Laurent Perrier Brut Cuvée Champagne Rosé, einer Zauberschnitte nach Wahl und zweimal Süßigkeit",
    einheit: "Stück",
    bruttoCent: 10900,
    ust: 0.19,
    gruppe: "foyer",
    aktiv: false,
  },

  // Highlights
  {
    nummer: "F2F",
    bezeichnung: "Face to Face Show by Florian Zimmer",
    beschreibung: "Florian Zimmer zaubert nach der Show exklusiv in Ihrer Loge",
    einheit: "Stück",
    bruttoCent: 150000,
    ust: 0.07,
    gruppe: "highlight",
  },
  {
    nummer: "AFTERSHOW",
    bezeichnung: "Aftershow Party",
    beschreibung: "Exklusive Aftershowparty mit DJ",
    einheit: "Stunde",
    bruttoCent: 100000,
    ust: 0.19,
    gruppe: "highlight",
  },
  {
    nummer: "DJ",
    bezeichnung: "DJ",
    einheit: "Stück",
    bruttoCent: 150000,
    ust: 0.19,
    gruppe: "highlight",
  },

  // Technik
  {
    nummer: "LEDFASSADE",
    bezeichnung: "Bespielen der LED-Fassade",
    beschreibung:
      "Firmenlogo oder persönliche Botschaft auf der LED-Fassade, der Hingucker für Fotos und Videos",
    einheit: "Stunde",
    bruttoCent: 35000,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "LEDWALL1",
    bezeichnung: "LED-Wall Nutzung 40qm im Showroom (erste Stunde)",
    einheit: "Stück",
    bruttoCent: 100000,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "LEDWALL2",
    bezeichnung: "LED-Wall Nutzung 40qm im Showroom (weitere Stunde)",
    einheit: "Stunde",
    bruttoCent: 15000,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "LICHT1",
    bezeichnung: "Lichtpaket (erste Stunde)",
    einheit: "Stunde",
    bruttoCent: 120000,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "LICHT2",
    bezeichnung: "Lichtpaket (weitere Stunde)",
    einheit: "Stunde",
    bruttoCent: 7500,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "SHOWROOM1",
    bezeichnung: "Miete Showroom (erste Stunde)",
    einheit: "Stunde",
    bruttoCent: 60000,
    ust: 0.19,
    gruppe: "technik",
  },

  // Exklusivbuchungen
  {
    nummer: "EXKLTHEATER",
    bezeichnung: "Exklusiv-Buchung des gesamten Florian Zimmer Theaters",
    beschreibung: "Entspricht 99 Euro pro verfügbarem Sitzplatz von insgesamt 196",
    einheit: "Stück",
    bruttoCent: 1940400,
    ust: 0.19,
    gruppe: "exklusiv",
  },
  {
    nummer: "EXKLPARKETT",
    bezeichnung: "Exklusiv-Buchung des kompletten Parketts",
    beschreibung: "Entspricht 99 Euro pro verfügbarem Sitzplatz von insgesamt 144",
    einheit: "Stück",
    bruttoCent: 1425600,
    ust: 0.19,
    gruppe: "exklusiv",
  },

  // Sonstiges
  {
    nummer: "FLEX",
    bezeichnung: "Flex-Option",
    beschreibung:
      "Umbuchung auf einen Ticketgutschein bis 48 Stunden vor Veranstaltungsbeginn, je Gast inklusive aller Zusatzleistungen",
    einheit: "Stück",
    bruttoCent: 1000,
    ust: 0.19,
    gruppe: "sonstiges",
    proPerson: true,
  },
];

/** Schneller Zugriff über die Artikelnummer. */
export function artikel(nummer: string): Artikel {
  const gefunden = ARTIKEL.find((a) => a.nummer === nummer);
  if (!gefunden) throw new Error(`Artikel ${nummer} ist im Stamm nicht hinterlegt.`);
  return gefunden;
}

/** Artikel einer Gruppe, standardmäßig ohne stillgelegte. */
export function artikelDerGruppe(gruppe: ArtikelGruppe, auchStillgelegte = false): Artikel[] {
  return ARTIKEL.filter((a) => a.gruppe === gruppe && (auchStillgelegte || a.aktiv !== false));
}

/**
 * Saalkapazität laut Artikelbeschreibung der Exklusivbuchungen.
 * Wird gebraucht, um zu prüfen, ob für alle Menügäste noch Showtickets da sind.
 */
export const THEATER_SITZPLAETZE = {
  gesamt: 196,
  parkett: 144,
};
