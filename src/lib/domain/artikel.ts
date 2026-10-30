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
    bezeichnung: "Magic Menü by Osman Kavak (Classic, Sea oder Veggy)",
    beschreibung:
      "Vier Gänge Fine Dining inklusive Welcome-Drink. Suppe, Salat, Hauptgang nach Wahl " +
      "und Dessert. Sonderpreis in Verbindung mit der Show. Classic, Sea oder Veggy wählt " +
      "jeder Gast für sich, der Preis ist überall derselbe; die Wahl braucht ihr erst " +
      "kurz vor dem Termin zu nennen.",
    einheit: "Stück",
    bruttoCent: 6900,
    ust: 0.07,
    gruppe: "menue",
    proPerson: true,
  },
  {
    nummer: "4GANGLOGE",
    bezeichnung: "Magic Menü by Osman Kavak, serviert in der Loge",
    beschreibung:
      "Vier Gänge Fine Dining inklusive Welcome-Drink, serviert an Ihrem Tisch in der Loge.",
    einheit: "Stück",
    bruttoCent: 7900,
    ust: 0.07,
    gruppe: "menue",
    proPerson: true,
  },

  /*
    Die sparsame Fassung: Umtrunk und Fingerfood statt Fine Dining.

    Auf der Firmenseite steht "schon ab 110 Euro pro Person, ohne Fine
    Dining, aber inklusive Umtrunk und Fingerfood". Die Rechnung dahinter
    war: Ticket Kat. 3 (49) plus Fingerfood (49) plus Empfang (12).

    ACHTUNG, das stimmt seit dem 30.10.2026 nicht mehr: "kat 3 soll gar
    nicht angeboten werden, nimm sie raus" (Florian). Die sparsame
    Fassung rechnet jetzt mit Kat. 2, also 89 plus 49 plus 12 und damit
    150 Euro. Entweder der Satz auf der Firmenseite wird angepasst, oder
    Kat. 3 kommt fuer genau dieses Paket zurueck. Das ist Florians
    Entscheidung, nicht die des Programms.
  */
  {
    nummer: "FINGERFOOD",
    bezeichnung: "Fingerfood by Osman Kavak",
    beschreibung:
      "Herzhafte und süße Kleinigkeiten aus unserer Küche, auf Etageren zum Teilen. " +
      "Vegetarisches ist immer dabei, Allergien berücksichtigen wir selbstverständlich.",
    einheit: "Stück",
    bruttoCent: 4900,
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
    /*
      Wird Firmen nicht mehr angeboten.

      "kat 3 soll gar nicht angeboten werden, nimm sie raus" (Florian,
      30.10.2026). Schon am 28.10. stand sie nicht mehr als
      Wahlmoeglichkeit unter den anderen Kategorien, weil die letzte
      Reihe dazu einlaedt, das Angebot nach unten zu verhandeln. Jetzt
      ist sie auch aus dem Baukasten und dem Regal heraus.

      Der Artikel bleibt stehen, nicht geloescht: Er steht in alten
      Angeboten und Rechnungen, und die muessen lesbar bleiben.
    */
    nummer: "TK3",
    bezeichnung: "Ticket Kat. 3",
    beschreibung: "Tickets in Reihe 9 nach Verfügbarkeit",
    einheit: "Stück",
    bruttoCent: 4900,
    ust: 0.07,
    gruppe: "ticket",
    aktiv: false,
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
  /*
    Was es im Shop zu kaufen gibt und was auch in ein Angebot kann.

    "mach einfach alles rein was wir haben bis hin zum sovenier glas und
    bundle" (Florian, 30.10.2026). Die Preise stehen so im Shop, geprüft
    an den Bestellungen in FloTix am 30.10.2026.
  */
  {
    nummer: "SOUVENIRGLAS",
    bezeichnung: "Souvenir Glas",
    beschreibung: "Das Glas zum Mitnehmen, als Andenken an den Abend",
    einheit: "Stück",
    bruttoCent: 1490,
    ust: 0.19,
    gruppe: "foyer",
  },
  {
    nummer: "VIPARMBAND",
    bezeichnung: "VIP-Armband",
    beschreibung: "Bevorzugter Einlass und ein Getränk an der Magic-Bar",
    einheit: "Stück",
    bruttoCent: 1900,
    ust: 0.19,
    gruppe: "foyer",
  },
  {
    /*
      Achtung Steuersatz: Im Bundle steckt ein Ticketanteil, der mit
      sieben Prozent zu versteuern waere. Hier stehen neunzehn, wie bei
      den uebrigen Waren. Vor dem ersten Angebot damit bitte mit dem
      Steuerbuero klaeren (offen am 30.10.2026).
    */
    nummer: "KIDSBUNDLE",
    bezeichnung: "Kids-Magic-Bundle",
    beschreibung: "Das Paket für Kinder: Zauberstab, Popcorn und eine Überraschung",
    einheit: "Stück",
    bruttoCent: 4900,
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

  /*
    Technik und Mobiliar, die wir bisher verliehen haben, ohne sie zu
    berechnen (Florian, 14.10.2026).

    Die Mikrofonpreise sind an dem orientiert, was Häuser mit eigener
    Technik nehmen: Hochschulen rechnen 15 bis 25 Euro je Gerät und Tag
    (Ruhr-Universität Bochum 25 Euro, FU Berlin 20 Euro). Bei uns kommt
    die Einweisung, die Batterie und der Techniker dazu, deshalb 30
    Euro. Alles hier ist ein Vorschlag und in einer Zeile zu ändern.
  */
  {
    nummer: "MIKROHAND",
    bezeichnung: "Funkmikrofon, Handsender",
    beschreibung: "Je Gerät für den Abend, inklusive Einweisung, Batterie und Einpegeln.",
    einheit: "Stück",
    bruttoCent: 3000,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "MIKROHEADSET",
    bezeichnung: "Funkmikrofon, Headset",
    beschreibung: "Je Gerät für den Abend, inklusive Anpassen, Batterie und Einpegeln.",
    einheit: "Stück",
    bruttoCent: 3000,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "STEHPULT",
    bezeichnung: "Stehpult mit Mikrofon und Licht",
    beschreibung: "Für Ansprachen und Ehrungen, aufgebaut und eingeleuchtet.",
    einheit: "Stück",
    bruttoCent: 4500,
    ust: 0.19,
    gruppe: "technik",
  },
  {
    nummer: "BANKETTTISCH",
    bezeichnung: "Bankett-Tisch",
    beschreibung: "Je Tisch, aufgebaut und wieder abgebaut.",
    einheit: "Stück",
    bruttoCent: 1000,
    ust: 0.19,
    gruppe: "technik",
  },

  /*
    Zusatzeffekte im Showroom.

    Der Konfetti-Shooter steht als Paar in der Liste: Es feuern immer
    zwei gleichzeitig, und ein einzelner wäre kein Effekt, sondern eine
    halbe Sache (Florian, 14.10.2026).
  */
  {
    nummer: "SPARKLER",
    bezeichnung: "Sparkler-Effekt mit zehn Geräten",
    beschreibung:
      "Kalte Funken aus acht Geräten in der Decke und zwei im Boden, zum Beispiel zum Auftritt "
      + "oder zum Anstoßen. Pauschale für den gesamten Effekt, inklusive Granulat und Einrichtung.",
    einheit: "Stück",
    bruttoCent: 35000,
    ust: 0.19,
    gruppe: "highlight",
  },
  {
    /*
      Stehtische fuer das Fingerfood im Foyer.

      "es gibt auch die Moeglichkeit Stehtische zu buchen, diese wollen
      wir individuell machen koennen" (Florian, 15.10.2026). Der Preis
      steht hier als Anhalt, im Angebot laesst er sich je Zeile
      ueberschreiben.
    */
    nummer: "STEHTISCH",
    bezeichnung: "Stehtisch im Foyer, eingedeckt",
    beschreibung: "Stehtisch mit Husse, fuer das Fingerfood oder den Empfang",
    einheit: "Stück",
    bruttoCent: 1500,
    ust: 0.19,
    gruppe: "foyer",
  },
  {
    nummer: "KONFETTI",
    bezeichnung: "Konfetti-Shooter, zwei Stück gleichzeitig",
    beschreibung: "Zwei Shooter, die zusammen feuern. Je Shooter 15 Euro.",
    einheit: "Stück",
    bruttoCent: 3000,
    ust: 0.19,
    gruppe: "highlight",
  },
  {
    nummer: "SLOWFALL",
    bezeichnung: "Slow-Fall-Konfetti",
    beschreibung: "Konfetti, das langsam durch den ganzen Saal rieselt.",
    einheit: "Stück",
    bruttoCent: 10000,
    ust: 0.19,
    gruppe: "highlight",
  },
  {
    nummer: "ENDREINIGUNG",
    bezeichnung: "Endreinigung Showroom",
    beschreibung: "Nach Veranstaltungen mit Konfetti, Buffet oder eigenem Aufbau.",
    einheit: "Stück",
    bruttoCent: 9000,
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

/**
 * Die Reihenfolge der Gruppen, einmal fuer das ganze Haus.
 *
 * "wichtig ist, dass im angebot dann auch immer nach logischem schema
 * ist ... die sitzplätze stehen immer beieinander" (Florian,
 * 30.10.2026) und "du musst auch an die korrekte sortierung denken"
 * (Florian, 30.10.2026).
 *
 * Danach sortiert sich beides: die Positionen im fertigen Angebot und
 * das Regal mit allen Leistungen darunter. Stand die Folge an zwei
 * Stellen, liefen sie auseinander, und Kevin suchte die
 * Exklusivbuchung im Regal unten, während sie im Angebot oben steht.
 */
export const GRUPPENFOLGE: ArtikelGruppe[] = [
  /*
    Die Tickets stehen oben. "die tickets muessen IMMER als erstes
    kommen im Angebot" (Florian, 30.10.2026): Der Platz im Saal ist
    das, was der Kunde kauft, alles andere kommt dazu. Vorher stand das
    Essen davor und die Sitzplaetze rutschten in die Mitte der Seite.

    Bei einer Exklusivbuchung gibt es keine einzelnen Tickets, dort
    steht die Buchung des Hauses von selbst oben.
  */
  "ticket",
  "exklusiv",
  "menue",
  "getraenke",
  "empfang",
  "loge",
  "foyer",
  "highlight",
  "technik",
  "sonstiges",
];

/** Die Ueberschrift je Gruppe, wie sie dem Nutzer gezeigt wird. */
export const GRUPPENTITEL: Record<ArtikelGruppe, string> = {
  exklusiv: "Exklusivbuchung",
  menue: "Menüs",
  ticket: "Tickets",
  getraenke: "Getränke",
  empfang: "Empfang",
  loge: "Loge",
  foyer: "Foyer und Souvenirs",
  highlight: "Highlights",
  technik: "Technik",
  sonstiges: "Sonstiges",
};

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
