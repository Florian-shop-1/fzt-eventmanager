/**
 * Das Geschäftspapier des Hauses: Rechnungen und alles, was so aussehen soll.
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
  /**
   * Was oben drübersteht: "Rechnung" (Standard) oder etwa "Angebot".
   *
   * Damit dasselbe Blatt später auch andere Schriftstücke tragen kann,
   * ohne dass jemand ein zweites Aussehen pflegen muss (Florian,
   * 30.09.2026: "diese kannst du auch für die Angebote nehmen").
   */
  art?: string;
  /**
   * Sind die Einzelpreise brutto oder netto?
   *
   * Im Veranstaltungsgeschäft sind Preise Bruttopreise, der Kunde sieht,
   * was er zahlt. Die Monatsrechnung an die Gastro rechnet dagegen netto
   * und schlägt die Umsatzsteuer auf. Beides muss dieses Blatt können,
   * sonst gäbe es wieder zwei.
   */
  preise?: "brutto" | "netto";
  /** Der Satz ganz unten. Leer lassen für den Standardsatz. */
  schluss?: string;
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

/**
 * Dieselbe Rechnung, nur von unten gerechnet.
 *
 * `angebotssumme` nimmt Bruttopreise und holt die Steuer heraus. Hier sind
 * die Preise netto und die Steuer kommt obendrauf. Getrennt nach Satz,
 * weil beides auf der Rechnung getrennt ausgewiesen werden muss.
 */
function nettoSumme(positionen: Position[]): {
  bruttoCent: number;
  nettoCent: number;
  ustNachSatz: Array<{ satz: number; nettoCent: number; ustCent: number }>;
} {
  const nachSatz = new Map<number, { nettoCent: number; ustCent: number }>();
  for (const p of positionen) {
    const netto = positionsSumme(p);
    const bisher = nachSatz.get(p.ust) ?? { nettoCent: 0, ustCent: 0 };
    nachSatz.set(p.ust, {
      nettoCent: bisher.nettoCent + netto,
      ustCent: bisher.ustCent + Math.round(netto * p.ust),
    });
  }
  const ustNachSatz = [...nachSatz.entries()]
    .map(([satz, werte]) => ({ satz, ...werte }))
    .sort((a, b) => a.satz - b.satz);
  const nettoCent = ustNachSatz.reduce((n, e) => n + e.nettoCent, 0);
  const ustCent = ustNachSatz.reduce((n, e) => n + e.ustCent, 0);
  return { nettoCent, bruttoCent: nettoCent + ustCent, ustNachSatz };
}

export async function rechnungsPdfEvent(d: RechnungsPdfDaten): Promise<Buffer> {
  const art = d.art ?? "Rechnung";
  const netto = d.preise === "netto";
  const istRechnung = art === "Rechnung";

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${art} ${d.nummer}`);
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

  /*
    Der Briefkopf: Logo in der Mitte, darunter HOME OF MAGIC.

    Mittig und nicht in der Ecke, weil es ein Briefbogen ist und kein
    Formular: So sieht die Rechnung aus wie das Anschreiben und der
    Gutschein, die auch aus der Mitte heraus gesetzt sind (Florian,
    30.09.2026).

    Der Untertitel steht gesperrt, weil pdf-lib keinen Zeichenabstand
    kennt: Die Buchstaben werden einzeln mit Leerzeichen gesetzt. Das
    ist keine Spielerei, ungesperrt sähen sieben Buchstaben in 7 Punkt
    wie ein Fleck aus.
  */
  const UNTERTITEL = "HOME OF MAGIC".split("").join(" ").replace(/   /g, "    ");

  const neueSeite = (): void => {
    if (seiten.length > 0) s = pdf.addPage([BREITE, HOEHE]);
    seiten.push(s);
    const erste = seiten.length === 1;

    if (erste) {
      const h = 27;
      const breite = logo ? (logo.width * h) / logo.height : 0;
      if (logo) {
        s.drawImage(logo, { x: (BREITE - breite) / 2, y: HOEHE - 52 - h, width: breite, height: h });
      }
      const u = normal.widthOfTextAtSize(UNTERTITEL, 6.5);
      schreib(UNTERTITEL, (BREITE - u) / 2, HOEHE - 92, 6.5, normal, GOLD);
      s.drawLine({
        start: { x: LINKS, y: HOEHE - 106 },
        end: { x: RECHTS, y: HOEHE - 106 },
        thickness: 0.6,
        color: LINIE,
      });
      y = HOEHE - 64;
      return;
    }

    y = HOEHE - 64;
    if (logo) {
      const h = 16;
      s.drawImage(logo, {
        x: RECHTS - (logo.width * h) / logo.height,
        y: y - 4,
        width: (logo.width * h) / logo.height,
        height: h,
      });
    }
    schreib(`${art} ${d.nummer}`, LINKS, y, 11, fett);
    y -= 24;
  };

  const platz = (hoehe: number): void => {
    if (y - hoehe < UNTEN) neueSeite();
  };

  /* ------------------------------------------------------------------
     Kopf
     ------------------------------------------------------------------ */
  neueSeite();
  y = HOEHE - 132;

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
  eck(`${art}snr.`, d.nummer);
  eck(`${art}sdatum`, datumDe(d.rechnungsdatum));
  if (d.leistungszeitpunkt) eck("Leistungsdatum", datumDe(d.leistungszeitpunkt));
  /*
    Auf einem Angebot ist noch nichts zu zahlen, da ist das Datum eine
    Frist: bis dahin gilt der Preis.
  */
  eck(istRechnung ? "Zahlbar bis" : "Gültig bis", datumDe(d.faelligAm));

  y = Math.min(y, yr) - 34;

  /*
    Erst das Wort, dann die Nummer.

    Die Zeile "RECHNUNG" gesperrt und klein darüber, die Nummer gross
    darunter: So erkennt man auf einen Meter Abstand, was das Blatt ist,
    und aus der Hand, welches.
  */
  schreib(art.toUpperCase().split("").join(" "), LINKS, y, 7.5, normal, GOLD);
  y -= 20;
  schreib(d.nummer, LINKS, y, 19, fett);
  y -= 9;
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
    rechtsB(netto ? "Einzel netto" : "Einzel €", 452, y, 8, fett, GRAU);
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
  /*
    Netto oder brutto gerechnet.

    Bei Bruttopreisen steckt die Steuer im Preis und wird herausgerechnet.
    Bei Nettopreisen kommt sie obendrauf. Beides muss sauber je Steuersatz
    getrennt bleiben, das verlangt § 14 UStG.
  */
  const summe = netto ? nettoSumme(positionen) : angebotssumme(positionen);
  const anzahlung = d.anzahlungCent ?? 0;
  const offen = summe.bruttoCent - anzahlung;

  platz(120);
  y -= 8;

  /*
    Bei Nettopreisen gehoert der Aufbau in den Kasten.

    Wer netto rechnet, will Nettobetrag, Steuer und Endbetrag
    untereinander sehen; das ist die Ansicht, die das Steuerbuero prueft.
  */
  const nettoZeilen = netto ? 14 + summe.ustNachSatz.length * 14 : 0;
  const kastenHoehe = 30 + nettoZeilen + (anzahlung > 0 ? 28 : 0);
  s.drawRectangle({ x: 300, y: y - kastenHoehe + 14, width: RECHTS - 300 + 8, height: kastenHoehe, color: FLAECHE });

  if (netto) {
    schreib("Nettobetrag", 312, y, 9.5, normal, GRAU);
    rechtsB(`${eur(summe.nettoCent)} €`, RECHTS, y, 9.5);
    y -= 14;
    for (const e of summe.ustNachSatz) {
      schreib(`zzgl. USt ${Math.round(e.satz * 100)} %`, 312, y, 9.5, normal, GRAU);
      rechtsB(`${eur(e.ustCent)} €`, RECHTS, y, 9.5);
      y -= 14;
    }
  }

  schreib(`${art}sbetrag`, 312, y, 11, fett);
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
    netto
      ? `Alle Einzelpreise sind Nettopreise. Auf den Nettobetrag von ${eur(summe.nettoCent)} € entfallen ${steuersatz}.`
      : `Im ${art}sbetrag von ${eur(summe.bruttoCent)} € (Netto: ${eur(summe.nettoCent)} €) sind ${steuersatz} enthalten. ` +
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
  schreib(
    istRechnung ? `Bitte bis zum ${datumDe(d.faelligAm)} überweisen` : "Unsere Bankverbindung",
    LINKS + 14, y, 11, fett,
  );
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
  /*
    Der Schlusssatz ist schmueckend, und nur fuer ihn eine zweite Seite
    anzufangen waere albern: Ein Blatt mit einer einzigen goldenen Zeile
    kam am 30.09.2026 tatsaechlich aus dem Drucker. Passt er nicht mehr,
    entfaellt er.
  */
  y -= 20;
  if (y - 14 >= UNTEN) {
    schreib(d.schluss ?? "Vielen Dank für euer Vertrauen. Wir freuen uns auf euch.", LINKS, y, 10, kursiv, GOLD);
  }

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
