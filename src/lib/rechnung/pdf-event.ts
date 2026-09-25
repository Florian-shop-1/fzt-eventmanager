/**
 * Die Rechnung zu einer Veranstaltung als PDF.
 *
 * Bisher kam sie aus Lexware Office. Jetzt entsteht sie hier, aus den
 * Positionen des angenommenen Angebots, und sieht aus wie das Angebot:
 * dasselbe Logo, dieselbe Fußzeile, dieselbe Schrift. Wer beides
 * nebeneinanderlegt, sieht auf den ersten Blick, dass es zusammengehört
 * (Florian, 25.09.2026).
 *
 * Die Pflichtangaben nach § 14 UStG stehen alle drin: beide Anschriften,
 * Steuernummer oder USt-IdNr., Rechnungsnummer, Rechnungsdatum,
 * Leistungszeitpunkt, Positionen, Entgelt nach Steuersätzen getrennt und
 * der Steuerbetrag.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Position } from "@/lib/domain/vorgang";
import { angebotssumme, positionsSumme } from "@/lib/angebot/erstellen";
import type { Absender } from "@/lib/angebot/pdf";

export interface RechnungsPdfDaten {
  nummer: string;
  rechnungsdatum: string;
  faelligAm: string;
  zahlungszielTage: number;
  leistung: string;
  /** Datum der Veranstaltung, falls bekannt. */
  leistungszeitpunkt?: string | null;
  kunde: {
    name: string;
    ansprechpartner?: string | null;
    strasse?: string | null;
    plz?: string | null;
    ort?: string | null;
  };
  positionen: Position[];
  /** Schon geleistete Anzahlungen, die abgezogen werden. */
  anzahlungCent?: number;
  hinweis: string;
  absender: Absender;
}

const SCHWARZ = rgb(0.07, 0.07, 0.07);
const GRAU = rgb(0.42, 0.42, 0.42);
const HELLGRAU = rgb(0.58, 0.58, 0.58);
const GOLD = rgb(0.788, 0.659, 0.298);
const LINIE = rgb(0.85, 0.84, 0.8);
const FLAECHE = rgb(0.972, 0.963, 0.937);

const BREITE = 595.28;
const HOEHE = 841.89;
const LINKS = 52;
const RECHTS = 543;
const UNTEN = 106;

const eur = (c: number) =>
  (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** Was die Standardschrift nicht kann, wird ersetzt. Zeilenumbrüche bleiben. */
function sicher(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E -ÿ\n€]/g, "");
}

function umbrechen(text: string, font: PDFFont, groesse: number, breite: number): string[] {
  const zeilen: string[] = [];
  for (const absatz of sicher(text).split(/\n/)) {
    let laufend = "";
    for (const wort of absatz.split(/\s+/)) {
      const versuch = laufend ? `${laufend} ${wort}` : wort;
      if (font.widthOfTextAtSize(versuch, groesse) > breite && laufend) {
        zeilen.push(laufend);
        laufend = wort;
      } else {
        laufend = versuch;
      }
    }
    zeilen.push(laufend);
  }
  return zeilen;
}

/** Die IBAN in Viererblöcken, wie auf der Bankkarte. */
const ibanLesbar = (iban: string) =>
  iban.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1 ").trim();

export async function rechnungsPdfEvent(d: RechnungsPdfDaten): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rechnung ${d.nummer}`);
  pdf.setProducer("FZT Eventmanager");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const kursiv = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const logo = await readFile(path.join(process.cwd(), "src/lib/angebot/bilder/logo-dunkel.png"))
    .then((datei) => pdf.embedPng(datei))
    .catch(() => null as PDFImage | null);

  const seiten: PDFPage[] = [];
  let s: PDFPage = pdf.addPage([BREITE, HOEHE]);
  let y = 0;

  const schreib = (
    text: string, x: number, yy: number,
    groesse = 10, f: PDFFont = normal, farbe = SCHWARZ, seite: PDFPage = s,
  ) => seite.drawText(sicher(text), { x, y: yy, size: groesse, font: f, color: farbe });

  const rechtsB = (
    text: string, x: number, yy: number,
    groesse = 10, f: PDFFont = normal, farbe = SCHWARZ, seite: PDFPage = s,
  ) =>
    seite.drawText(sicher(text), {
      x: x - f.widthOfTextAtSize(sicher(text), groesse),
      y: yy, size: groesse, font: f, color: farbe,
    });

  const neueSeite = (): void => {
    if (seiten.length > 0) s = pdf.addPage([BREITE, HOEHE]);
    seiten.push(s);
    y = HOEHE - 64;
    if (logo) {
      const h = seiten.length === 1 ? 22 : 16;
      s.drawImage(logo, {
        x: RECHTS - (logo.width * h) / logo.height,
        y: y - 4,
        width: (logo.width * h) / logo.height,
        height: h,
      });
    }
    if (seiten.length > 1) {
      schreib(`Rechnung ${d.nummer}`, LINKS, y, 11, fett);
      y -= 24;
    }
  };

  const platz = (hoehe: number): void => {
    if (y - hoehe < UNTEN) neueSeite();
  };

  /* ------------------------------------------------------------------
     Kopf
     ------------------------------------------------------------------ */
  neueSeite();
  y = HOEHE - 120;

  schreib(
    `${d.absender.firma}, ${d.absender.strasse}, ${d.absender.plz} ${d.absender.ort}`,
    LINKS, y, 6.5, normal, HELLGRAU,
  );
  y -= 16;

  const anschriftOben = y;
  schreib(d.kunde.name, LINKS, y, 11, fett);
  y -= 14;
  if (d.kunde.ansprechpartner) { schreib(d.kunde.ansprechpartner, LINKS, y, 10.5); y -= 13; }
  if (d.kunde.strasse) { schreib(d.kunde.strasse, LINKS, y, 10.5); y -= 13; }
  if (d.kunde.plz || d.kunde.ort) {
    schreib(`${d.kunde.plz ?? ""} ${d.kunde.ort ?? ""}`.trim(), LINKS, y, 10.5);
    y -= 13;
  }

  let yr = anschriftOben;
  const eck = (k: string, v: string) => {
    schreib(k, 372, yr, 8.5, normal, GRAU);
    rechtsB(v, RECHTS, yr, 9.5, fett);
    yr -= 14;
  };
  eck("Rechnungsnr.", d.nummer);
  eck("Rechnungsdatum", datumDe(d.rechnungsdatum));
  if (d.leistungszeitpunkt) eck("Leistungsdatum", datumDe(d.leistungszeitpunkt));
  eck("Zahlbar bis", datumDe(d.faelligAm));

  y = Math.min(y, yr) - 30;

  schreib(`Rechnung ${d.nummer}`, LINKS, y, 18, fett);
  y -= 8;
  s.drawRectangle({ x: LINKS, y: y - 4, width: 44, height: 2.5, color: GOLD });
  y -= 24;

  if (d.leistung) {
    schreib(d.leistung, LINKS, y, 10.5, normal, GRAU);
    y -= 22;
  }

  /* ------------------------------------------------------------------
     Positionen
     ------------------------------------------------------------------ */
  const tabellenkopf = () => {
    schreib("Pos.", LINKS, y, 8, fett, GRAU);
    schreib("Bezeichnung", LINKS + 26, y, 8, fett, GRAU);
    rechtsB("Menge", 352, y, 8, fett, GRAU);
    schreib("Einheit", 372, y, 8, fett, GRAU);
    rechtsB("Einzel €", 452, y, 8, fett, GRAU);
    rechtsB("USt", 492, y, 8, fett, GRAU);
    rechtsB("Gesamt €", RECHTS, y, 8, fett, GRAU);
    y -= 6;
    s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.8, color: SCHWARZ });
    y -= 15;
  };

  tabellenkopf();

  const positionen = d.positionen.filter((p) => !p.istAlternativeZu);
  let nummer = 1;

  for (const p of positionen) {
    const titelzeilen = umbrechen(p.bezeichnung, fett, 10, 250);
    const beschreibung = p.beschreibung ? umbrechen(p.beschreibung, normal, 8.5, 250) : [];
    const hoehe = (titelzeilen.length + beschreibung.length) * 12 + 10;

    if (y - hoehe < UNTEN) {
      neueSeite();
      tabellenkopf();
    }

    const oben = y;
    schreib(String(nummer++), LINKS, oben, 9.5, fett);
    let yy = oben;
    for (const zeile of titelzeilen) {
      schreib(zeile, LINKS + 26, yy, 10, fett);
      yy -= 12;
    }
    for (const zeile of beschreibung) {
      schreib(zeile, LINKS + 26, yy, 8.5, normal, HELLGRAU);
      yy -= 11;
    }

    rechtsB(String(p.menge), 352, oben, 9.5);
    schreib(p.einheit, 372, oben, 9.5);
    rechtsB(eur(p.einzelBruttoCent), 452, oben, 9.5);
    rechtsB(`${Math.round(p.ust * 100)} %`, 492, oben, 9.5, normal, GRAU);
    rechtsB(eur(positionsSumme(p)), RECHTS, oben, 10, fett);

    if (p.rabattProzent) {
      schreib(`abzüglich ${p.rabattProzent} % Nachlass`, LINKS + 26, yy, 8.5, normal, GOLD);
      yy -= 11;
    }

    y = yy - 6;
    s.drawLine({ start: { x: LINKS, y: y + 3 }, end: { x: RECHTS, y: y + 3 }, thickness: 0.35, color: LINIE });
    y -= 5;
  }

  /* ------------------------------------------------------------------
     Summe und Steuerausweis
     ------------------------------------------------------------------ */
  const summe = angebotssumme(positionen);
  const anzahlung = d.anzahlungCent ?? 0;
  const offen = summe.bruttoCent - anzahlung;

  platz(120);
  y -= 8;

  const kastenHoehe = 30 + (anzahlung > 0 ? 28 : 0);
  s.drawRectangle({ x: 300, y: y - kastenHoehe + 14, width: RECHTS - 300 + 8, height: kastenHoehe, color: FLAECHE });
  schreib(anzahlung > 0 ? "Rechnungsbetrag" : "Rechnungsbetrag", 312, y, 11, fett);
  rechtsB(`${eur(summe.bruttoCent)} €`, RECHTS, y, anzahlung > 0 ? 11 : 13, fett);
  y -= 16;

  if (anzahlung > 0) {
    schreib("bereits gezahlt", 312, y, 9, normal, GRAU);
    rechtsB(`- ${eur(anzahlung)} €`, RECHTS, y, 9.5, normal, GRAU);
    y -= 14;
    schreib("noch zu zahlen", 312, y, 11, fett);
    rechtsB(`${eur(offen)} €`, RECHTS, y, 13, fett);
    y -= 18;
  }

  y -= 12;
  const steuersatz = summe.ustNachSatz
    .map((e) => `USt ${Math.round(e.satz * 100)} % (${eur(e.ustCent)} € auf Netto ${eur(e.nettoCent)} €)`)
    .join(", ");
  for (const zeile of umbrechen(
    `Im Rechnungsbetrag von ${eur(summe.bruttoCent)} € (Netto: ${eur(summe.nettoCent)} €) sind ${steuersatz} enthalten. ` +
      "Alle Preise sind Bruttopreise inklusive der gesetzlichen Mehrwertsteuer.",
    normal, 8, RECHTS - LINKS,
  )) {
    schreib(zeile, LINKS, y, 8, normal, GRAU);
    y -= 11;
  }

  /* ------------------------------------------------------------------
     Zahlungshinweis
     ------------------------------------------------------------------ */
  y -= 18;
  platz(96);

  s.drawRectangle({ x: LINKS, y: y - 74, width: RECHTS - LINKS, height: 92, color: FLAECHE });
  schreib(`Bitte bis zum ${datumDe(d.faelligAm)} überweisen`, LINKS + 14, y, 11, fett);
  y -= 16;

  for (const zeile of umbrechen(d.hinweis, normal, 9, RECHTS - LINKS - 28)) {
    schreib(zeile, LINKS + 14, y, 9, normal, GRAU);
    y -= 12;
  }

  y -= 4;
  const bank: Array<[string, string]> = [
    ["Empfänger", d.absender.firma],
    ["IBAN", d.absender.iban ? ibanLesbar(d.absender.iban) : ""],
    ["BIC", d.absender.bic ?? ""],
    ["Verwendungszweck", d.nummer],
  ].filter((z) => z[1]) as Array<[string, string]>;

  for (const [k, v] of bank) {
    schreib(k, LINKS + 14, y, 8, normal, GRAU);
    schreib(v, LINKS + 110, y, 9, fett);
    y -= 12;
  }

  /* ------------------------------------------------------------------
     Schluss und Fußzeile
     ------------------------------------------------------------------ */
  y -= 20;
  platz(30);
  schreib("Vielen Dank für euer Vertrauen. Wir freuen uns auf euch.", LINKS, y, 10, kursiv, GOLD);

  const a = d.absender;
  const spalte1 = [a.firma, a.strasse, `${a.plz} ${a.ort}`, `Tel.: ${a.telefon}`, a.email, a.web];
  const spalte2 = [
    a.ustId ? `USt-IdNr.: ${a.ustId}` : "",
    a.steuernummer ? `Steuernummer: ${a.steuernummer}` : "",
    a.registergericht ? `Handelsregister: ${a.registergericht}` : "",
    a.sitz ? `Sitz der Gesellschaft: ${a.sitz}` : "",
    a.geschaeftsfuehrer ? `Geschäftsführer: ${a.geschaeftsfuehrer}` : "",
  ].filter(Boolean);
  const spalte3 = [
    a.bank ?? "",
    a.iban ? `IBAN: ${ibanLesbar(a.iban)}` : "",
    a.bic ? `BIC: ${a.bic}` : "",
  ].filter(Boolean);

  seiten.forEach((seite, i) => {
    seite.drawLine({ start: { x: LINKS, y: 96 }, end: { x: RECHTS, y: 96 }, thickness: 0.5, color: LINIE });
    const spalte = (werte: string[], x: number) => {
      let yyy = 86;
      for (const zeile of werte) {
        schreib(zeile, x, yyy, 6, normal, HELLGRAU, seite);
        yyy -= 7.6;
      }
    };
    spalte(spalte1, LINKS);
    spalte(spalte2, 230);
    spalte(spalte3, 420);
    rechtsB(`Seite ${i + 1}/${seiten.length}`, RECHTS, 30, 7, normal, GRAU, seite);
  });

  return Buffer.from(await pdf.save());
}
