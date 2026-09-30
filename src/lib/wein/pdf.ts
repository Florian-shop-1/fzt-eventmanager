/**
 * Die Monatsrechnung als PDF, direkt aus dem Eventmanager.
 *
 * Bewusst schlicht und ohne Abhängigkeit von Lexware Office: Nummer, Datum,
 * Leistungszeitraum, Positionen, Umsatzsteuer und die Pflichtangaben nach
 * § 14 UStG. Gesetzt mit pdf-lib, also ohne Browser im Hintergrund.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface RechnungsPosition {
  name: string;
  menge: number;
  einzelCent: number;
  summeCent: number;
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

const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " EUR";
const datumDe = (iso: string) => iso.split("-").reverse().join(".");

export async function rechnungsPdfBauen(d: RechnungsDaten): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rechnung ${d.nummer}`);
  pdf.setProducer("FZT Eventmanager");
  const seite = pdf.addPage([595.28, 841.89]); // A4
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const schwarz = rgb(0.11, 0.11, 0.1);
  const grau = rgb(0.45, 0.44, 0.42);
  const gold = rgb(0.788, 0.659, 0.298);

  /*
    Das Logo oben rechts, wie bei Angebot und Eventrechnung.

    Bisher stand auf dieser Rechnung nur der Firmenname in Fettdruck. Wer
    Angebot und Rechnung nebeneinanderlegt, soll sehen, dass beides vom
    selben Haus kommt (Florian, 30.09.2026).
  */
  const logo = await readFile(path.join(process.cwd(), "src/lib/angebot/bilder/logo-dunkel.png"))
    .then((datei) => pdf.embedPng(datei))
    .catch(() => null);

  const links = 56;
  const rechts = 539;
  let y = 790;

  const schreib = (text: string, x: number, groesse = 10, f = normal, farbe = schwarz) => {
    seite.drawText(text, { x, y, size: groesse, font: f, color: farbe });
  };
  const rechtsBuendig = (text: string, x: number, groesse = 10, f = normal) => {
    seite.drawText(text, { x: x - f.widthOfTextAtSize(text, groesse), y, size: groesse, font: f, color: schwarz });
  };

  // Kopf
  if (logo) {
    const hoehe = 26;
    seite.drawImage(logo, {
      x: rechts - (logo.width * hoehe) / logo.height,
      y: y - 8,
      width: (logo.width * hoehe) / logo.height,
      height: hoehe,
    });
  }
  schreib(d.absender.firma, links, 16, fett);
  y -= 16;
  schreib(`${d.absender.strasse}, ${d.absender.plz} ${d.absender.ort}`, links, 9, normal, grau);
  y -= 12;
  schreib(`${d.absender.telefon} · ${d.absender.email} · ${d.absender.web}`, links, 9, normal, grau);
  y -= 14;
  seite.drawLine({ start: { x: links, y }, end: { x: rechts, y }, thickness: 1.2, color: gold });

  // Empfänger
  y = 700;
  schreib(d.empfaenger.name, links, 11, fett);
  y -= 14;
  schreib(d.empfaenger.strasse, links, 11);
  y -= 14;
  schreib(`${d.empfaenger.plz} ${d.empfaenger.ort}`, links, 11);

  // Rechnungsdaten rechts
  y = 700;
  const spalte = 380;
  const zeilePaar = (k: string, v: string) => {
    schreib(k, spalte, 10, normal, grau);
    rechtsBuendig(v, rechts, 10, fett);
    y -= 14;
  };
  zeilePaar("Rechnungsnummer", d.nummer);
  zeilePaar("Rechnungsdatum", datumDe(d.datum));
  zeilePaar("Leistungszeitraum", d.leistungszeitraum);

  // Titel
  y = 620;
  schreib(`Rechnung ${d.nummer}`, links, 18, fett);
  y -= 26;
  schreib("Vielen Dank für die gute Zusammenarbeit. Wir berechnen die gelieferte Ware:", links, 10, normal, grau);

  // Tabellenkopf
  y -= 28;
  schreib("Pos.", links, 9, fett);
  schreib("Bezeichnung", links + 34, 9, fett);
  rechtsBuendig("Menge", 360, 9, fett);
  rechtsBuendig("Einzelpreis", 450, 9, fett);
  rechtsBuendig("Betrag", rechts, 9, fett);
  y -= 6;
  seite.drawLine({ start: { x: links, y }, end: { x: rechts, y }, thickness: 0.7, color: grau });
  y -= 16;

  d.positionen.forEach((p, i) => {
    schreib(String(i + 1), links, 10);
    schreib(p.name.slice(0, 48), links + 34, 10);
    rechtsBuendig(String(p.menge), 360, 10);
    rechtsBuendig(eur(p.einzelCent), 450, 10);
    rechtsBuendig(eur(p.summeCent), rechts, 10);
    y -= 16;
  });

  // Summen
  y -= 6;
  seite.drawLine({ start: { x: 330, y }, end: { x: rechts, y }, thickness: 0.7, color: grau });
  y -= 18;
  schreib("Nettobetrag", 380, 10, normal, grau);
  rechtsBuendig(eur(d.nettoCent), rechts, 10);
  y -= 15;
  schreib("Umsatzsteuer 19 %", 380, 10, normal, grau);
  rechtsBuendig(eur(d.ustCent), rechts, 10);
  y -= 6;
  seite.drawLine({ start: { x: 330, y }, end: { x: rechts, y }, thickness: 1, color: gold });
  y -= 15;
  schreib("Rechnungsbetrag", 380, 11, fett);
  rechtsBuendig(eur(d.bruttoCent), rechts, 11, fett);

  // Zahlungsbedingungen
  y -= 34;
  schreib(
    d.zahlungszielTage > 0
      ? `Zahlbar ohne Abzug innerhalb von ${d.zahlungszielTage} Tagen auf das unten genannte Konto.`
      : "Zahlbar sofort ohne Abzug auf das unten genannte Konto.",
    links,
    10,
  );
  y -= 14;
  schreib(`Bitte die Rechnungsnummer ${d.nummer} als Verwendungszweck angeben.`, links, 10, normal, grau);

  // Fuß mit den Pflichtangaben
  y = 96;
  seite.drawLine({ start: { x: links, y: y + 14 }, end: { x: rechts, y: y + 14 }, thickness: 0.7, color: grau });
  /*
    Vier Spalten, aber nicht gleich breit.

    Die Bankspalte braucht Platz fuer "IBAN DE66 6509 1040 0351 9820 19".
    Bei festen 125 Punkten lief sie in die naechste Spalte hinein, im
    Ausdruck klebte der Geschaeftsfuehrer an der IBAN (Florian, 30.09.2026).
  */
  const fussSpalten: Array<{ x: number; zeilen: string[] }> = [
    {
      x: links,
      zeilen: [d.absender.firma, d.absender.strasse, `${d.absender.plz} ${d.absender.ort}`],
    },
    {
      x: links + 128,
      zeilen: [
        `Steuernummer ${d.absender.steuernummer}`,
        d.absender.ustId ? `USt-IdNr. ${d.absender.ustId}` : "",
        d.absender.registergericht,
      ],
    },
    {
      x: links + 268,
      zeilen: [d.absender.bank, `IBAN ${d.absender.iban}`, `BIC ${d.absender.bic}`],
    },
    {
      x: links + 420,
      zeilen: ["Geschäftsführung", d.absender.geschaeftsfuehrer, d.absender.web],
    },
  ];
  fussSpalten.forEach(({ x, zeilen }) => {
    zeilen.forEach((zeile, j) => {
      if (!zeile) return;
      seite.drawText(zeile, { x, y: y - j * 11, size: 7, font: normal, color: grau });
    });
  });

  return Buffer.from(await pdf.save());
}
