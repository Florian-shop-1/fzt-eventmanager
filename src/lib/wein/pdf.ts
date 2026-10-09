/**
 * Die Monatsrechnung an die Gastro, auf dem Geschäftspapier des Hauses.
 *
 * Sie hatte lange ein eigenes Aussehen: schlicht, funktionierend, aber
 * eben ein zweites. Am 30.09.2026 hat Florian entschieden, dass es nur
 * noch eines gibt, "eine schöne rechnung in unserem stil mit dem logo mit
 * untertitel home of magic", und dass dasselbe Blatt später auch Angebote
 * tragen soll.
 *
 * Deshalb steht hier keine Zeichenarbeit mehr, sondern nur die
 * Übersetzung: Aus den Positionen der Monatsabrechnung wird das, was
 * lib/rechnung/pdf-event.ts setzt. Der einzige Unterschied zur
 * Veranstaltungsrechnung ist die Rechenrichtung, und dafür gibt es dort
 * `preise: "netto"`: Hier sind die Einzelpreise netto und die Steuer kommt
 * obendrauf, im Veranstaltungsgeschäft sind die Preise brutto.
 */

import type { Position } from "@/lib/domain/vorgang";
import { rechnungsPdfEvent } from "@/lib/rechnung/pdf-event";

export interface RechnungsPosition {
  name: string;
  menge: number;
  einzelCent: number;
  summeCent: number;
  /**
   * An welchen Tagen und von wem diese Ware bestellt wurde, als fertiger
   * Text, etwa "09.10. (Giusi Pirillo)".
   *
   * "wichtig ist, dass z.b. der osman genau sieht auf der Rg, wann er
   * bestellt hat" (Florian, 30.09.2026). Eine Monatsrechnung fasst
   * zusammen; ohne die Tage kann der Empfaenger sie nicht mit seinen
   * eigenen Aufzeichnungen vergleichen.
   */
  bestellt?: string;
}

export interface Absender {
  firma: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  web: string;
  steuernummer: string;
  ustId: string;
  iban: string;
  bic: string;
  bank: string;
  geschaeftsfuehrer: string;
  registergericht: string;
}

export interface RechnungsDaten {
  nummer: string;
  datum: string;
  leistungszeitraum: string;
  empfaenger: { name: string; strasse: string; plz: string; ort: string };
  positionen: RechnungsPosition[];
  nettoCent: number;
  ustCent: number;
  bruttoCent: number;
  zahlungszielTage: number;
  /** Absender, Bank und Steuernummer. */
  absender: Absender;
}

/** Auf die Ware der Gastro liegen 19 Prozent. */
const UST = 0.19;

/** Der Tag, an dem das Geld da sein soll. */
function faelligAm(datum: string, tage: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, tage));
  return d.toISOString().slice(0, 10);
}

export async function rechnungsPdfBauen(d: RechnungsDaten): Promise<Buffer> {
  /*
    Aus einer Zeile der Monatsabrechnung wird eine Rechnungsposition.

    Einheit bleibt leer: Bei "24 x Magicuvée" ist die Flasche gemeint und
    nicht die Kiste, und "Stück" daneben liest sich wie ein Formular.
  */
  const positionen: Position[] = d.positionen.map((p, i) => ({
    id: String(i + 1),
    artikelNummer: String(i + 1),
    bezeichnung: p.name,
    beschreibung: p.bestellt ? `bestellt am ${p.bestellt}` : undefined,
    menge: p.menge,
    einheit: "",
    einzelBruttoCent: p.einzelCent,
    ust: UST,
  }));

  return rechnungsPdfEvent({
    nummer: d.nummer,
    rechnungsdatum: d.datum,
    faelligAm: faelligAm(d.datum, d.zahlungszielTage),
    zahlungszielTage: d.zahlungszielTage,
    leistung: `Gelieferte Ware, ${d.leistungszeitraum}`,
    kunde: {
      name: d.empfaenger.name,
      strasse: d.empfaenger.strasse,
      plz: d.empfaenger.plz,
      ort: d.empfaenger.ort,
    },
    positionen,
    preise: "netto",
    hinweis:
      d.zahlungszielTage > 0
        ? `Zahlbar ohne Abzug innerhalb von ${d.zahlungszielTage} Tagen.`
        : "Zahlbar sofort ohne Abzug.",
    schluss: "Vielen Dank für die gute Zusammenarbeit.",
    absender: d.absender,
  });
}
