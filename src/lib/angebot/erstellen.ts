/**
 * Erzeugt aus einem Vorgang die Positionen eines Angebots.
 *
 * Der Aufbau folgt genau den Musterangeboten AG-0826-1167 und
 * AG-0826-1168: erst das Menü, dann das Showticket mit drei
 * Alternativpositionen, damit der Kunde die Kategorie selbst wählen kann.
 */

import { artikel, artikelDerGruppe, THEATER_SITZPLAETZE } from "@/lib/domain/artikel";
import {
  ANGEBOT_GUELTIG_TAGE,
  STANDARD_TICKET,
  TICKET_ALTERNATIVEN,
  eur,
  mitRabatt,
  steueranteil,
} from "@/lib/domain/pricing";
import type { Position, Vorgang } from "@/lib/domain/vorgang";
import type { Plan } from "@/lib/seating/types";
import { ablaufFuer, ablaufUeberschrift, mitEssen, mitShow, type Tageszeit, type Variante } from "./ablaufplan";
import { datumLang } from "@/lib/zeit";

/**
 * Was auf den Tisch kommt.
 *
 * "finedining" ist der Normalfall: das Magic Menü by Osman Kavak.
 * "fingerfood" ist die sparsame Fassung für Gruppen, die auf ein Budget
 * von etwa 110 Euro pro Gast kommen wollen (Florian, 25.09.2026).
 */
export type Verpflegung = "finedining" | "fingerfood";

/**
 * Einzelplaetze oder das Haus fuer sich allein.
 *
 * "gib die Moeglichkeit auch fuer Exklusivevent, da ist dann kein
 * Ticket oder Sitzplatzwahl erforderlich" (Florian, 15.10.2026). Bei
 * einer Exklusivbuchung gibt es keine Kategorien, keine
 * Wahlmoeglichkeiten und auch keine Unterbelegung: Es ist ohnehin alles
 * bezahlt.
 */
export type Angebotsart = "einzelplaetze" | "theater" | "parkett";

/** Welcher Artikel hinter einer Exklusivbuchung steht. */
const EXKLUSIVARTIKEL: Record<"theater" | "parkett", string> = {
  theater: "EXKLTHEATER",
  parkett: "EXKLPARKETT",
};

export interface AngebotsOptionen {
  /**
   * Welche Fassung: Show mit Menü, mit Fingerfood, nur Show oder
   * Exklusivevent mit und ohne Show (Florian, 15.10.2026).
   *
   * Sie bestimmt beides, den Ablauf oben im Angebot und die Positionen
   * darunter. Ohne Angabe bleibt es bei Show mit Menü.
   */
  variante?: Variante;
  /** Nachmittagsshow oder Abendshow. Dreht bei 15 Uhr den Ablauf um. */
  tageszeit?: Tageszeit;
  /** Uhrzeit der Vorstellung, wenn ein Termin feststeht. */
  showzeit?: string;
  /**
   * Für welchen Wochentag angeboten wird, wenn noch kein Termin
   * feststeht: 0 ist Sonntag, 4 Donnerstag.
   *
   * "wichtig ist, dass man auch auswählen kann Termin steht noch nicht
   * fest, dass man für einen bestimmten Wochentag anbieten kann, so dass
   * der Kunde sieht, dass es Donnerstag günstiger wäre als Freitag oder
   * Samstag" (Florian, 15.10.2026).
   */
  wochentag?: number | null;
  /** Freier Zeitraum dazu, etwa "im November oder Dezember 2026". */
  zeitraum?: string;
  /**
   * Einzelplaetze (Normalfall) oder Exklusivbuchung des Theaters bzw.
   * des Parketts.
   */
  art?: Angebotsart;
  /**
   * Fine Dining oder Fingerfood. Ohne Angabe Fine Dining, das ist der
   * Normalfall und war es auch, bevor es die Wahl gab.
   */
  verpflegung?: Verpflegung;
  /** Ticketkategorie als Hauptposition. Standard ist Kat. 2. */
  ticket: string;
  /**
   * Mehrere Ticketkategorien mit eigener Stueckzahl, etwa 20 Karten
   * Kat. 1 und 15 Karten Kat. 2.
   *
   * "es muss moeglich sein jeweils mehrere Kategorien in einem Angebot
   * darzustellen" (Florian, 15.10.2026). Bei Firmen sitzt die
   * Geschaeftsleitung vorne und der Rest weiter hinten, das war bisher
   * nicht abbildbar: Es gab eine Hauptkategorie, die anderen standen nur
   * als Wahlmoeglichkeit darunter.
   *
   * Stehen hier zwei oder mehr Kategorien, zaehlt jede mit eigener
   * Stueckzahl zur Summe. Bei einer einzigen bleibt es beim bisherigen
   * Verhalten mit Wahlmoeglichkeiten.
   */
  kategorien?: Array<{ nummer: string; menge: number }>;
  /** Rabatt auf die Tickets in Prozent, wie die 15 Prozent in AG-0826-1168. */
  ticketRabatt: number;
  /**
   * Eigener Ticketpreis in Bruttocent, der fuer jede Kategorie gilt.
   *
   * "wir machen manchmal gerne 99 EUR auf jedem Sitzplatz" (Florian,
   * 15.10.2026). Bei Firmenabenden ist der Einheitspreis der leichtere
   * Weg als ein Rabatt in Prozent, der auf jeder Kategorie eine andere
   * krumme Zahl ergibt. Ohne Angabe gelten die Kategoriepreise aus dem
   * Ticketshop.
   */
  ticketPreisCent?: number;
  /**
   * Artikelnummern der Getränkepauschalen. Mehrere sind erlaubt und
   * üblich: Softdrink-Flat zusammen mit Bier- und Wein-Flat ist die
   * beliebteste Kombination. Jede wird zu einer eigenen Position.
   */
  getraenkepauschalen: string[];
  /**
   * Wie viele Flats je Pauschale, falls nicht fuer alle dieselbe.
   *
   * "wenn kinder dabei sind brauchen wir eine moeglichkeit, z.b. bei 12
   * teilnehmern 10 bier wein flat und 2 softdrink flat" (Florian,
   * 28.10.2026). Genau dafuer: Artikelnummer zu Anzahl. Was hier nicht
   * steht, gilt wie bisher fuer alle Teilnehmer.
   */
  getraenkeMengen?: Record<string, number>;
  /**
   * Wo gegessen wird: auf der Eventgalerie oder in einer Loge.
   *
   * "Plätze auf der VIP-Empore, VIP-Empore oder Logenplatz zum essen soll
   * auch getrennt angeboten werden können. also z.B. sitzen in den golden
   * seats, essen in loge" (Florian, 28.10.2026).
   *
   * Platz im Saal und Platz am Tisch sind im Haus zwei verschiedene Dinge:
   * Aus der Loge sieht man die Show nicht, jeder Logengast hat zusätzlich
   * ein Showticket (siehe domain/venue.ts). Im Angebot hing der Essplatz
   * bisher am Sitzplan, und der steht beim Anbieten meist noch gar nicht
   * fest. Deshalb hier als eigene Wahl:
   *
   *   automatisch  wie bisher aus dem Sitzplan
   *   galerie      alle essen auf der Eventgalerie
   *   loge         alle essen in einer Loge
   */
  essplatz?: "automatisch" | "galerie" | "loge";
  /**
   * Die Loge zusätzlich als Wahlmöglichkeit anbieten.
   *
   * "Loge soll man optional mit anbieten können" (Florian, 28.10.2026).
   * Dann steht unter dem Menü auf der Eventgalerie dasselbe Menü in der
   * Loge, mit Preis in Klammern und nicht in der Summe.
   */
  logeDazu?: boolean;
  /**
   * Welche Leistungen nur als Wahlmöglichkeit dastehen sollen.
   *
   * Artikelnummern. Was hier steht, steht im Angebot grau, mit Preis in
   * Klammern, und zählt nicht zur Summe.
   *
   * "gut ist so ein button bei den getränkeflats oder was auch immer
   * menü, stehtisch: ich will dass es drin ist im angebot / ich will
   * dass es drin ist, aber optional. optional ist immer in klammern dann
   * beim kunden auf dem angebot" (Florian, 28.10.2026).
   *
   * Bewusst eine Liste von Artikelnummern und kein Haken je Leistung: So
   * gilt dieselbe Entscheidung für alles, was ein Angebot hergibt, ohne
   * dass für jede neue Leistung wieder ein eigenes Feld dazukommt.
   */
  optionalePositionen?: string[];
  /**
   * Das Firmenlogo auf der LED-Außenfassade mit anbieten.
   *
   * "im Angebot muss man auch anklicken können Logo auf der Fassade.
   * optional" (Florian, 28.10.2026). Steht als optionale Position da,
   * und unten im Angebot steht, was eine Werbepartnerschaft bedeutet.
   */
  mitFassade?: boolean;
  /** Wie viele Stunden die Fassade bespielt wird. Ohne Angabe eine. */
  fassadeStunden?: number;
  /**
   * Highlights, die beim Bauen angehakt wurden.
   *
   * "kann man face to face show mit anklicken für 1500 in der loge -
   * das ist bei angeboterstellung auch wichtig. wo finde ich den punkt
   * (kevin hatte ihn übersehen)" (Florian, 30.10.2026).
   *
   * Es gab sie nur als Nachtrag, also erst an einem fertigen Angebot
   * unter "Position hinzufügen". Wer ein Angebot von vorn baute, sah
   * sie nie. Jetzt stehen sie im Baukasten, je Artikelnummer aus der
   * Gruppe "highlight".
   */
  highlights?: string[];
  /** Magicuvée-Empfang auf der Eventgalerie mit anbieten. */
  mitEmpfang: boolean;
  /** Nicht belegte Logenplätze in Rechnung stellen. */
  mitUnterbelegung: boolean;
  /**
   * Preise dieser Vorstellung aus Ditix, Artikelnummer zu Bruttocent.
   *
   * Der Grund: Preise sind nicht überall gleich. An Silvester kostet das
   * Menü 89 statt 69 Euro. Was hier steht, gilt; was fehlt, kommt aus dem
   * Artikelstamm. Steuersätze kommen immer aus dem Stamm, Ditix liefert
   * nur Bruttobeträge.
   */
  preise?: Map<string, number>;
  /**
   * Preise, die fuer dieses eine Angebot von Hand gesetzt wurden.
   *
   * "bitte die 350 eur pro stunde LED Fassade aenderbar machen.
   * grundsaetzlich ist auch gut, wenn preise bei uns aenderbar sind"
   * (Florian, 28.10.2026).
   *
   * Artikelnummer zu Bruttocent. Geht allem vor: dem Artikelstamm und
   * den Abendpreisen aus dem Ticketshop. Zusammengefuehrt wird beim
   * Speichern, siehe angebot/speichern.ts.
   */
  eigenePreise?: Record<string, number>;
}

export const STANDARD_ANGEBOTSOPTIONEN: AngebotsOptionen = {
  art: "einzelplaetze",
  ticket: STANDARD_TICKET,
  ticketRabatt: 0,
  getraenkepauschalen: [],
  mitEmpfang: true,
  mitUnterbelegung: true,
  verpflegung: "finedining",
};

/**
 * Die sparsame Fassung, wie sie auf der Firmenseite beworben wird.
 *
 * Ticket Kat. 3 statt Kat. 2, Fingerfood statt Menü, Empfang bleibt:
 * zusammen 110 Euro brutto pro Gast.
 */
export const FINGERFOOD_ANGEBOTSOPTIONEN: AngebotsOptionen = {
  ...STANDARD_ANGEBOTSOPTIONEN,
  ticket: "TK3",
  verpflegung: "fingerfood",
};

/**
 * Die Einleitung des Angebots: Überschrift und Ablauf des Tages.
 *
 * Der Ablauf kommt aus ablaufplan.ts und richtet sich nach Fassung und
 * Tageszeit: "Ablauf passt sich an, was wann passiert, dass rauskommt:
 * so sieht Ihr Abend aus" (Florian, 15.10.2026). Das PDF liest die
 * Uhrzeiten später wieder aus diesem Text heraus, deshalb bleibt der
 * Aufbau: Zeile mit Uhrzeit, darunter der Text.
 */
export function einleitungstext(
  vorgang: Vorgang,
  optionen: {
    variante?: Variante;
    tageszeit?: Tageszeit;
    showzeit?: string;
    wochentag?: number | null;
    zeitraum?: string;
    /** Steht ein Termin fest? Dann nennt die Überschrift das Datum. */
    terminSteht?: boolean;
  } = {},
): string {
  const variante = optionen.variante ?? "menue";
  const tageszeit = optionen.tageszeit ?? "abend";

  const stationen = ablaufFuer({
    variante,
    tageszeit,
    showname: vorgang.vorstellung.show,
    showzeit: optionen.showzeit,
  });

  const kopf = ablaufUeberschrift({
    datum: optionen.terminSteht === false ? null : vorgang.vorstellung.datum,
    wochentag: optionen.wochentag,
    zeitraum: optionen.zeitraum,
  });

  return [
    `${kopf}, ein Erlebnis für alle Sinne`,
    "",
    ...stationen.flatMap((st) => [`${st.zeit} UHR`, `${st.titel}. ${st.text}`, ""]),
  ]
    .join(String.fromCharCode(10))
    .trimEnd();
}

/** Die Bedingungen, die in beiden Musterangeboten unten stehen. */
export const SCHLUSSTEXT = [
  "Wir freuen uns darauf, Ihren Abend bei uns zu einem unvergesslichen Erlebnis zu machen.",
  "",
  "Bitte beachten Sie: Die Reservierung bleibt bis zum Zahlungseingang unverbindlich. Erst mit " +
    "dem vollständigen Zahlungseingang gilt Ihre Buchung als fest bestätigt.",
  "",
  "Alle aufgeführten Preise verstehen sich als Bruttopreise inklusive der gesetzlichen Mehrwertsteuer.",
  "",
  "Für Ihre kulinarische Begleitung bitten wir Sie, uns spätestens 7 Tage vor der Veranstaltung " +
    "Ihre Menüwahl (Fleisch, Fisch oder Vegan) sowie mögliche Allergien oder Unverträglichkeiten " +
    "mitzuteilen. Unser Küchenteam geht selbstverständlich individuell auf Ihre Wünsche ein.",
  "",
  "Gerne berücksichtigen wir auch kurzfristige Ergänzungen oder besondere Arrangements, stets im " +
    "Rahmen der Verfügbarkeit, damit Ihr Abend perfekt wird.",
].join("\n");

/**
 * Was eine Werbepartnerschaft bedeutet. Steht unter dem Angebot, sobald
 * das Logo auf der Fassade mit angeboten wird (Florian, 28.10.2026).
 *
 * Nach seinem Text für die Rechnung, aber in der Sprache eines Angebots:
 * Dort stehen Sätze wie "diese Rechnung stellt ein verbindliches Angebot
 * dar" naturgemäß noch nicht. Was bleibt, ist das Wesentliche: was
 * gezeigt wird, dass Werbung und Veranstaltung getrennt abgerechnet
 * werden, und bis wann wir das Logo brauchen.
 */
export const WERBUNG_TEXT = [
  "Werbepartnerschaft und vereinbarte Partnerkonditionen",
  "",
  "Die Werbeleistungen umfassen die Präsentation Ihres Unternehmenslogos auf der großflächigen " +
    "LED-Außenfassade des Florian Zimmer Theaters sowie gegebenenfalls weitere ausdrücklich " +
    "vereinbarte Werbe- und Brandingmaßnahmen, beispielsweise an den Sitzplätzen im Theater. Art, " +
    "Umfang und Ausstrahlungszeitraum ergeben sich aus den Angebotspositionen.",
  "",
  "Im Zusammenhang mit der Werbepartnerschaft räumen wir Ihnen die individuell vereinbarten " +
    "Partnerkonditionen für ausgewählte Showtickets und gastronomische Leistungen ein.",
  "",
  "Werbeleistungen und Veranstaltungsleistungen werden gesondert ausgewiesen und abgerechnet. Der " +
    "Vertrag über die Werbeleistung kommt mit vollständigem Eingang des Rechnungsbetrags zustande.",
  "",
  "Bitte übermitteln Sie uns Ihr Logo spätestens eine Woche vor der Werbemaßnahme als JPG- oder " +
    "PNG-Datei.",
].join(String.fromCharCode(10));

let laufendeNummer = 0;

function neueId(praefix: string): string {
  laufendeNummer += 1;
  return `${praefix}-${laufendeNummer}`;
}

/**
 * Baut die Positionsliste.
 *
 * @param plan Ergebnis des Sitzplaners. Wird gebraucht, um zu wissen, wer
 *             in der Loge sitzt (teureres Menü) und wie viele Plätze
 *             blockiert bleiben.
 */
export function erzeugePositionen(
  vorgang: Vorgang,
  plan: Plan | null,
  optionen: AngebotsOptionen = STANDARD_ANGEBOTSOPTIONEN,
): Position[] {
  const preise = optionen.preise;
  const positionen: Position[] = [];

  /*
    Die Fassung bestimmt, was überhaupt im Angebot steht.

    Nur Show heißt: keine Verpflegung, kein Empfang. Exklusiv ohne Show
    heißt: das Haus und das Essen, aber keine Tickets (Florian,
    15.10.2026). Die älteren Felder art und verpflegung bleiben gültig,
    damit vorhandene Aufrufe weiterlaufen.
  */
  const variante = optionen.variante;
  const exklusivVariante = variante === "exklusiv_show" || variante === "exklusiv_ohne_show";
  const art = exklusivVariante ? (optionen.art === "parkett" ? "parkett" : "theater") : optionen.art;
  const verpflegung =
    variante === "fingerfood" ? "fingerfood" : variante ? "finedining" : optionen.verpflegung;
  const essen = variante ? mitEssen(variante) : true;
  const tickets = variante ? mitShow(variante) && !exklusivVariante : true;
  const gruppenIds = new Set(vorgang.gruppen.map((g) => g.id));

  const gesamt = vorgang.gruppen.reduce((s, g) => s + g.personen, 0);

  /*
    Wer isst wo? Nur Logengäste bekommen das teurere Logenmenü.

    Steht im Angebot eine Wahl, gilt die. Ohne Wahl kommt es wie bisher
    aus dem Sitzplan, und ohne Sitzplan isst niemand in der Loge. Beim
    Anbieten steht der Sitzplan meist noch gar nicht fest, deshalb muss
    man es hier sagen können (Florian, 28.10.2026).
  */
  const ausPlan = plan
    ? plan.logen
        .filter((z) => gruppenIds.has(z.gruppeId))
        .reduce((s, z) => s + z.personen, 0)
    : 0;
  const essplatz = optionen.essplatz ?? "automatisch";
  const inLoge = essplatz === "loge" ? gesamt : essplatz === "galerie" ? 0 : ausPlan;
  const inGalerie = gesamt - inLoge;

  // 1. Was auf den Tisch kommt
  if (!essen) {
    // Nur die Show: kein Menü, kein Fingerfood, kein Empfang.
  } else if (verpflegung === "fingerfood") {
    // Fingerfood steht auf Etageren zum Teilen, deshalb keine
    // Unterscheidung zwischen Loge und Galerie.
    if (gesamt > 0) positionen.push(zuPosition(preise, "FINGERFOOD", gesamt));
  } else {
    const aufGalerie = inGalerie > 0 ? zuPosition(preise, "4GANG", inGalerie) : null;
    if (aufGalerie) positionen.push(aufGalerie);
    if (inLoge > 0) {
      positionen.push(zuPosition(preise, "4GANGLOGE", inLoge));
    }
    /*
      Die Loge als Wahlmöglichkeit unter dem Menü auf der Eventgalerie:
      grau, Preis in Klammern, nicht in der Summe. Wer schon in der Loge
      isst, bekommt sie nicht noch einmal angeboten.
    */
    if (optionen.logeDazu && aufGalerie) {
      positionen.push({
        ...zuPosition(preise, "4GANGLOGE", inGalerie),
        istAlternativeZu: aufGalerie.id,
      });
    }
  }

  // 2. Showtickets
  //
  // Mehrere Kategorien stehen jede als eigene Zeile und zaehlen alle
  // zur Summe. Eine einzelne Kategorie bekommt wie bisher die anderen
  // als Wahlmoeglichkeit darunter: Wer nur eine Kategorie anbietet,
  // laesst den Kunden gerne selbst entscheiden.
  const gewaehlt = (optionen.kategorien ?? []).filter((k) => k.menge > 0);

  // Der Einheitspreis, wenn einer gesetzt ist: Er ersetzt den
  // Kategoriepreis, die Bezeichnung der Kategorie bleibt stehen.
  const ticketpreis = optionen.ticketPreisCent;
  const exklusiv = art === "theater" || art === "parkett";

  if (!tickets && !exklusiv) {
    // Exklusiv ohne Show: weder Tickets noch Saalpauschale für die Show.
  } else if (exklusiv) {
    /*
      Eine Zeile fuer das ganze Haus, aber mit offener Rechnung.

      "bei der Exklusivbuchung soll aufgeschluesselt sein, wie wir auf
      den Betrag kommen. IdR zahlen sie jeden sitzplatz (entweder 99
      eur pro platz egal wo) oder alternativ die einzelnen kategorien.
      sie zahlen also auch fuer leere plaetze. gastro wird immer pro
      kopf wer tatsaechlich da ist berechnet" (Florian, 28.10.2026).

      Deshalb steht unter der Zeile, aus wie vielen Plaetzen zu welchem
      Preis sich die Summe ergibt, und der Satz zu den leeren Plaetzen
      und zum Essen. Gerechnet wird aus dem Preis, der wirklich gilt,
      damit die Aufschluesselung auch bei einem ausgehandelten Betrag
      stimmt.
    */
    const exklusivZeile = zuPosition(
      preise,
      EXKLUSIVARTIKEL[art as "theater" | "parkett"],
      1,
      0,
      ticketpreis,
    );
    const plaetze =
      art === "theater" ? THEATER_SITZPLAETZE.gesamt : THEATER_SITZPLAETZE.parkett;
    const jePlatz = plaetze > 0 ? Math.round(exklusivZeile.einzelBruttoCent / plaetze) : 0;
    const hausText = art === "theater" ? "Das ganze Haus" : "Das komplette Parkett";
    exklusivZeile.beschreibung = [
      `${hausText} gehört an diesem Abend Ihnen: ${plaetze} Sitzplätze zu ` +
        `${eur(jePlatz)} je Platz.`,
      "Berechnet werden alle Plätze, auch die frei bleiben. Dafür gibt es weder " +
        "Kategorien noch Sitzplatzwahl, Sie verteilen Ihre Gäste selbst.",
      "Essen und Getränke kommen pro Kopf dazu und werden nach den Gästen " +
        "abgerechnet, die wirklich da sind.",
    ].join(String.fromCharCode(10));
    positionen.push(exklusivZeile);
  } else if (gewaehlt.length > 1) {
    for (const k of gewaehlt) {
      positionen.push(
        zuPosition(preise, k.nummer, k.menge, optionen.ticketRabatt, ticketpreis),
      );
    }
  } else {
    const nummer = gewaehlt[0]?.nummer ?? optionen.ticket;
    const menge = gewaehlt[0]?.menge ?? gesamt;
    const haupt = zuPosition(preise, nummer, menge, optionen.ticketRabatt, ticketpreis);
    positionen.push(haupt);
    for (const alternative of TICKET_ALTERNATIVEN.filter((n) => n !== nummer)) {
      positionen.push({
        ...zuPosition(preise, alternative, menge, optionen.ticketRabatt, ticketpreis),
        istAlternativeZu: haupt.id,
      });
    }
  }

  // 3. Empfang
  if (optionen.mitEmpfang && essen) {
    positionen.push(zuPosition(preise, "EMPFANG", gesamt));
  }

  /*
    4. Getraenkepauschalen.

    Die Menge kann je Pauschale abweichen: Bei zwoelf Teilnehmern zehn
    Bier- und Weinflats und zwei Softdrinkflats, wenn Kinder dabei sind.
    Ohne Angabe gilt sie fuer alle. Eine Null laesst die Zeile weg,
    sonst stuende im Angebot eine Pauschale fuer niemanden.
  */
  for (const pauschale of optionen.getraenkepauschalen) {
    const wunsch = optionen.getraenkeMengen?.[pauschale];
    const menge = wunsch === undefined ? gesamt : Math.max(0, Math.round(wunsch));
    if (menge === 0) continue;
    positionen.push(zuPosition(preise, pauschale, menge));
  }

  /*
    5. Das Logo auf der LED-Außenfassade.

    Immer optional: Das ist eine Werbepartnerschaft und keine
    Veranstaltungsleistung. Sie wird getrennt ausgewiesen und
    abgerechnet, und deshalb steht sie mit Preis in Klammern da, bis
    der Kunde sie dazunimmt (Florian, 28.10.2026).
  */
  if (optionen.mitFassade) {
    const stunden = Math.max(1, Math.round(optionen.fassadeStunden ?? 1));
    positionen.push(zuPosition(preise, "LEDFASSADE", stunden));
  }

  /*
    Die Highlights: Face to Face, Aftershow, DJ.

    Immer einmal, nie je Gast: Florian zaubert einmal in der Loge, der
    DJ spielt einmal. Wer etwas anderes braucht, aendert die Menge
    danach an der Position.
  */
  for (const nummer of optionen.highlights ?? []) {
    if (HIGHLIGHTNUMMERN.has(nummer)) positionen.push(zuPosition(preise, nummer, 1));
  }

  // 6. Blockierte Logenplätze. Nur, wenn keine Ausnahme hinterlegt ist.
  //    Bei einer Exklusivbuchung nie: Der Saal ist komplett bezahlt.
  if (optionen.mitUnterbelegung && !exklusiv && plan) {
    const blockiert = plan.logen
      .filter((z) => gruppenIds.has(z.gruppeId))
      .filter((z) => {
        const gruppe = vorgang.gruppen.find((g) => g.id === z.gruppeId);
        return gruppe?.ausnahme?.aktiv !== true;
      })
      .reduce((s, z) => s + z.freiePlaetze, 0);

    if (blockiert > 0) {
      const menue = preisVon(preise, "4GANGLOGE");
      const ticket = preisVon(preise, STANDARD_TICKET);
      positionen.push({
        id: neueId("pos"),
        artikelNummer: "EXKLLOGE",
        bezeichnung: "Exklusivnutzung Loge",
        beschreibung:
          "Für die exklusive Nutzung Ihrer Loge halten wir die nicht belegten Plätze für Sie " +
          "frei. Diese können an dem Abend nicht anderweitig vergeben werden.",
        menge: blockiert,
        einheit: "Stück",
        einzelBruttoCent: menue + ticket,
        // Entspricht dem, was ein zusätzlicher Gast gekostet hätte:
        // Menü und Showticket, beides mit 7 Prozent.
        ust: 0.07,
      });
    }
  }

  /*
    Zum Schluss: Was nur als Wahlmöglichkeit dastehen soll, wird grau.

    An einer Stelle für alle Leistungen, statt an jeder einzelnen. Eine
    Alternative ist ohnehin schon eine Wahlmöglichkeit und bleibt, wie
    sie ist; sonst stünde sie zweimal in Klammern.
  */
  const nurAngeboten = new Set(optionen.optionalePositionen ?? []);
  if (nurAngeboten.size === 0) return sortiert(positionen);
  return sortiert(
    positionen.map((p) =>
      nurAngeboten.has(p.artikelNummer) && !p.istAlternativeZu ? { ...p, optional: true } : p,
    ),
  );
}

/**
 * Die Reihenfolge im Angebot: erst das Gewaehlte, dann die Optionen.
 *
 * "wichtig ist, dass im angebot dann auch immer nach logischem schema
 * ist. also nicht random die sachen reinwürfeln, sondern die sitzplätze
 * stehen immer beieinander. oben immer das gewählte (das nicht
 * optionierte) und dann folgend die anderen optionen wie gehabt in
 * klammer" (Florian, 30.10.2026).
 *
 * Bisher stand alles in der Reihenfolge, in der es oben zusammengebaut
 * wurde. Das war nicht zufaellig, sah aber so aus: Zwischen dem Menue
 * und den Tickets konnte eine optionale Zeile stehen, und wer von oben
 * nach unten liest, verliert dabei den Faden.
 *
 * Sortiert wird nach zwei Schluesseln, in dieser Reihenfolge:
 *
 *  1. die Gruppe des Artikels, immer dieselbe Folge. Damit stehen alle
 *     Ticketkategorien beieinander, alle Getraenke, alle Technik.
 *  2. innerhalb der Gruppe fest vor optional. Oben steht, was der Kunde
 *     bekommt, darunter in Klammern, was er dazunehmen kann.
 *
 * Die Gruppe kommt zuerst, weil die Sitzplaetze zusammengehoeren: Kat.
 * 2 fest, darunter Golden Seats und Kat. 1 zur Wahl. Andersherum
 * stuende die gewaehlte Kategorie oben und die beiden anderen
 * seitenweit darunter bei den Getraenken.
 *
 * Innerhalb einer Gruppe bleibt die Reihenfolge, die oben entstanden
 * ist: Golden Seats vor Kat. 1 vor Kat. 2, weil der Artikelstamm sie so
 * fuehrt. Alternativen werden hier nicht einsortiert, sie haengen an
 * ihrer Bezugsposition und werden beim Speichern dahinter gesetzt.
 */
const GRUPPENFOLGE = [
  "exklusiv",
  "menue",
  "ticket",
  "getraenke",
  "empfang",
  "loge",
  "foyer",
  "highlight",
  "technik",
  "sonstiges",
];

function sortiert(positionen: Position[]): Position[] {
  const rang = (p: Position): number => {
    try {
      const stelle = GRUPPENFOLGE.indexOf(artikel(p.artikelNummer).gruppe);
      return stelle < 0 ? GRUPPENFOLGE.length : stelle;
    } catch {
      // Frei eingetippte Zeilen kennen wir nicht: Die kommen ans Ende.
      return GRUPPENFOLGE.length;
    }
  };

  const haupt = positionen.filter((p) => !p.istAlternativeZu);
  const alternativen = positionen.filter((p) => p.istAlternativeZu);

  const geordnet = haupt
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const gA = rang(a.p);
      const gB = rang(b.p);
      if (gA !== gB) return gA - gB;
      const optA = a.p.optional ? 1 : 0;
      const optB = b.p.optional ? 1 : 0;
      if (optA !== optB) return optA - optB;
      return a.i - b.i;
    })
    .map((x) => x.p);

  return [...geordnet, ...alternativen];
}

/**
 * Was kostet ein Artikel an diesem Abend?
 * Ditix hat Vorrang, der Artikelstamm ist der Rückfall.
 */
function preisVon(preise: Map<string, number> | undefined, nummer: string): number {
  return preise?.get(nummer) ?? artikel(nummer).bruttoCent;
}

function zuPosition(
  preise: Map<string, number> | undefined,
  artikelNummer: string,
  menge: number,
  rabattProzent = 0,
  /** Eigener Bruttopreis, der Ditix und Artikelstamm ueberstimmt. */
  preisCent?: number,
): Position {
  const a = artikel(artikelNummer);
  return {
    id: neueId("pos"),
    artikelNummer: a.nummer,
    bezeichnung: a.bezeichnung,
    beschreibung: a.beschreibung,
    menge,
    einheit: a.einheit,
    // Preis aus Ditix, Bezeichnung und Steuersatz aus dem Artikelstamm.
    // Ein von Hand gesetzter Preis geht beiden vor.
    einzelBruttoCent: preisCent && preisCent > 0 ? preisCent : preisVon(preise, artikelNummer),
    ust: a.ust,
    rabattProzent: rabattProzent || undefined,
  };
}

const TICKETNUMMERN = new Set(artikelDerGruppe("ticket", true).map((a) => a.nummer));
const MENUENUMMERN = ["4GANG", "4GANGLOGE", "FINGERFOOD"];
/** Was im Baukasten als Highlight angehakt werden darf. */
const HIGHLIGHTNUMMERN = new Set(artikelDerGruppe("highlight").map((a) => a.nummer));

/**
 * Wie viele Gaeste stehen in diesem Angebot?
 *
 * "wo wird die Anzahl der Teilnehmer hingeschrieben?" (Florian,
 * 15.10.2026). Eingetippt wird sie nirgends, sie steckt in den
 * Positionen: Jeder Gast hat ein Showticket, und seit es mehrere
 * Kategorien je Angebot gibt, ist es die Summe ueber alle Kategorien.
 * Gibt es keine Tickets, zaehlen die Menues.
 */
export function personenAusPositionen(positionen: Position[]): number {
  const echte = positionen.filter((p) => !p.istAlternativeZu && !p.optional);
  /*
    Bei einer Exklusivbuchung steht in der Ticketzeile die Eins fuer den
    ganzen Saal. Die Gaestezahl steckt dann in den Menues.
  */
  if (echte.some((p) => p.artikelNummer.startsWith("EXKLTHEATER") || p.artikelNummer.startsWith("EXKLPARKETT"))) {
    return echte
      .filter((p) => MENUENUMMERN.includes(p.artikelNummer))
      .reduce((s, p) => s + p.menge, 0);
  }
  const tickets = echte
    .filter((p) => TICKETNUMMERN.has(p.artikelNummer))
    .reduce((s, p) => s + p.menge, 0);
  if (tickets > 0) return tickets;
  return echte
    .filter((p) => MENUENUMMERN.includes(p.artikelNummer))
    .reduce((s, p) => s + p.menge, 0);
}

/** Bruttobetrag einer Position nach Rabatt. */
export function positionsSumme(p: Position): number {
  const roh = p.einzelBruttoCent * p.menge;
  return p.rabattProzent ? mitRabatt(roh, p.rabattProzent) : roh;
}

export interface Angebotssumme {
  bruttoCent: number;
  nettoCent: number;
  /** Steueranteile getrennt nach Satz, wie es auf der Rechnung stehen muss. */
  ustNachSatz: Array<{ satz: number; nettoCent: number; ustCent: number }>;
}

/**
 * Rechnet die Angebotssumme aus.
 *
 * Nicht mit zählen Alternativpositionen, die nur ein Wahlangebot sind,
 * und optionale Positionen: Die stehen mit Preis in Klammern im Angebot
 * und werden erst berechnet, wenn der Kunde sie dazunimmt
 * (Florian, 14.10.2026).
 */
export function angebotssumme(positionen: Position[]): Angebotssumme {
  const echte = positionen.filter((p) => !p.istAlternativeZu && !p.optional);
  const nachSatz = new Map<number, { nettoCent: number; ustCent: number }>();
  let bruttoCent = 0;

  for (const p of echte) {
    const brutto = positionsSumme(p);
    bruttoCent += brutto;
    const { netto, ust } = steueranteil(brutto, p.ust);
    const bisher = nachSatz.get(p.ust) ?? { nettoCent: 0, ustCent: 0 };
    nachSatz.set(p.ust, {
      nettoCent: bisher.nettoCent + netto,
      ustCent: bisher.ustCent + ust,
    });
  }

  const ustNachSatz = [...nachSatz.entries()]
    .map(([satz, werte]) => ({ satz, ...werte }))
    .sort((a, b) => a.satz - b.satz);

  return {
    bruttoCent,
    nettoCent: ustNachSatz.reduce((s, e) => s + e.nettoCent, 0),
    ustNachSatz,
  };
}

/** Angebotsnummer im Format AG-MMJJ-NNNN, wie in lexoffice. */
export function angebotsnummer(datum: Date, laufend: number): string {
  const mm = String(datum.getMonth() + 1).padStart(2, "0");
  const jj = String(datum.getFullYear()).slice(-2);
  return `AG-${mm}${jj}-${String(laufend).padStart(4, "0")}`;
}

/** Gültigkeitsdatum: sieben Tage nach Erstellung. */
export function gueltigBis(erstellt: Date): string {
  const d = new Date(erstellt);
  d.setDate(d.getDate() + ANGEBOT_GUELTIG_TAGE);
  return d.toISOString().slice(0, 10);
}


