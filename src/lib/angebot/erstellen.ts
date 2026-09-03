/**
 * Erzeugt aus einem Vorgang die Positionen eines Angebots.
 *
 * Der Aufbau folgt genau den Musterangeboten AG-0826-1167 und
 * AG-0826-1168: erst das Menü, dann das Showticket mit drei
 * Alternativpositionen, damit der Kunde die Kategorie selbst wählen kann.
 */

import { artikel } from "@/lib/domain/artikel";
import {
  ANGEBOT_GUELTIG_TAGE,
  STANDARD_TICKET,
  TICKET_ALTERNATIVEN,
  mitRabatt,
  steueranteil,
} from "@/lib/domain/pricing";
import type { Position, Vorgang } from "@/lib/domain/vorgang";
import type { Plan } from "@/lib/seating/types";
import { datumLang } from "@/lib/zeit";

export interface AngebotsOptionen {
  /** Ticketkategorie als Hauptposition. Standard ist Kat. 2. */
  ticket: string;
  /** Rabatt auf die Tickets in Prozent, wie die 15 Prozent in AG-0826-1168. */
  ticketRabatt: number;
  /**
   * Artikelnummern der Getränkepauschalen. Mehrere sind erlaubt und
   * üblich: Softdrink-Flat zusammen mit Bier- und Wein-Flat ist die
   * beliebteste Kombination. Jede wird zu einer eigenen Position.
   */
  getraenkepauschalen: string[];
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
}

export const STANDARD_ANGEBOTSOPTIONEN: AngebotsOptionen = {
  ticket: STANDARD_TICKET,
  ticketRabatt: 0,
  getraenkepauschalen: [],
  mitEmpfang: true,
  mitUnterbelegung: true,
};

/** Der Ablaufplan, der in beiden Musterangeboten als Einleitung steht. */
export function einleitungstext(vorgang: Vorgang): string {
  return [
    `Euer Event am ${datumLang(vorgang.vorstellung.datum)} im Florian Zimmer Theater, ein Erlebnis für alle Sinne`,
    "",
    "17:20 UHR",
    "Magicuvée-Empfang auf unserer Eventgalerie",
    "",
    "17:50 UHR",
    "4-Gang-Menü (Classic, Vegan oder Sea, gerne angepasst an besondere Wünsche) auf unserer " +
      "Eventgalerie, oder soweit verfügbar geselliges Beisammensein in eurer stilvollen Loge im Showroom.",
    "",
    "20:00 UHR",
    `Das Highlight des Abends, die Magieshow "${vorgang.vorstellung.show}", live, hautnah und mit ` +
      "bestem Blick zur Bühne auf den VIP-Plätzen der Empore.",
    "",
    "22:30 UHR",
    "Ausklang an der Foyerbar",
  ].join("\n");
}

/** Die Bedingungen, die in beiden Musterangeboten unten stehen. */
export const SCHLUSSTEXT = [
  "Wir freuen uns darauf, euren Abend bei uns zu einem unvergesslichen Erlebnis zu machen.",
  "",
  "Bitte beachtet: Die Reservierung bleibt bis zum Zahlungseingang unverbindlich. Erst mit " +
    "dem vollständigen Zahlungseingang gilt eure Buchung als fest bestätigt.",
  "",
  "Alle aufgeführten Preise verstehen sich als Bruttopreise inklusive der gesetzlichen Mehrwertsteuer.",
  "",
  "Für eure kulinarische Begleitung bitten wir euch, uns spätestens 7 Tage vor der Veranstaltung " +
    "eure Menüwahl (Fleisch, Fisch oder Vegan) sowie mögliche Allergien oder Unverträglichkeiten " +
    "mitzuteilen. Unser Küchenteam geht selbstverständlich individuell auf eure Wünsche ein.",
  "",
  "Gerne berücksichtigen wir auch kurzfristige Ergänzungen oder besondere Arrangements, stets im " +
    "Rahmen der Verfügbarkeit, damit euer Abend perfekt wird.",
].join("\n");

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
  const gruppenIds = new Set(vorgang.gruppen.map((g) => g.id));

  // Wie viele der Gäste sitzen in einer Loge? Nur die bekommen das
  // teurere Logenmenü.
  const inLoge = plan
    ? plan.logen
        .filter((z) => gruppenIds.has(z.gruppeId))
        .reduce((s, z) => s + z.personen, 0)
    : 0;
  const gesamt = vorgang.gruppen.reduce((s, g) => s + g.personen, 0);
  const inGalerie = gesamt - inLoge;

  // 1. Menü
  if (inGalerie > 0) {
    positionen.push(zuPosition(preise, "4GANG", inGalerie));
  }
  if (inLoge > 0) {
    positionen.push(zuPosition(preise, "4GANGLOGE", inLoge));
  }

  // 2. Showticket als Hauptposition, darunter die Alternativen
  const haupt = zuPosition(preise, optionen.ticket, gesamt, optionen.ticketRabatt);
  positionen.push(haupt);
  for (const nummer of TICKET_ALTERNATIVEN.filter((n) => n !== optionen.ticket)) {
    positionen.push({
      ...zuPosition(preise, nummer, gesamt, optionen.ticketRabatt),
      istAlternativeZu: haupt.id,
    });
  }

  // 3. Empfang
  if (optionen.mitEmpfang) {
    positionen.push(zuPosition(preise, "EMPFANG", gesamt));
  }

  // 4. Getränkepauschale
  for (const pauschale of optionen.getraenkepauschalen) {
    positionen.push(zuPosition(preise, pauschale, gesamt));
  }

  // 5. Blockierte Logenplätze. Nur, wenn keine Ausnahme hinterlegt ist.
  if (optionen.mitUnterbelegung && plan) {
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
          "Für die exklusive Nutzung eurer Loge halten wir die nicht belegten Plätze für euch " +
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

  return positionen;
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
    einzelBruttoCent: preisVon(preise, artikelNummer),
    ust: a.ust,
    rabattProzent: rabattProzent || undefined,
  };
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
 * Rechnet die Angebotssumme aus. Alternativpositionen zählen nicht mit,
 * sie sind nur ein Wahlangebot an den Kunden.
 */
export function angebotssumme(positionen: Position[]): Angebotssumme {
  const echte = positionen.filter((p) => !p.istAlternativeZu);
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


