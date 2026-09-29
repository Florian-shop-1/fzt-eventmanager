/**
 * Die Belege eines Monats als PDF, für genau eine Firma.
 *
 * Vorne die Aufstellung mit den Summen, dann je Beleg eine Seite mit den
 * Angaben und dem Foto. Das ist die Datei, die ans Steuerbüro geht: Ein
 * Link nützt dort nichts, weil niemand dort einen Zugang zu unserem
 * Programm hat (Florian, 29.09.2026).
 *
 * In einer Datei stehen nur die Belege einer Gesellschaft. Das ist der
 * ganze Zweck der Trennung und gilt hier genauso wie in der Ansicht.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { euro, nachZahlweg, summen, type Bewirtung } from "./db";
import { gesellschaftName, type Gesellschaft } from "./gesellschaft";

const SCHWARZ = rgb(0.07, 0.07, 0.07);
const GRAU = rgb(0.42, 0.42, 0.42);
const HELLGRAU = rgb(0.58, 0.58, 0.58);
const GOLD = rgb(0.788, 0.659, 0.298);
const LINIE = rgb(0.85, 0.84, 0.8);

const BREITE = 595.28;
const HOEHE = 841.89;
const LINKS = 52;
const RECHTS = 543;
const UNTEN = 62;

const datumDe = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const zeitpunktDe = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })
    : "";

function sicher(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E -ÿ\n€]/g, "");
}

export interface MonatsPdfDaten {
  gesellschaft: Gesellschaft;
  /** "September 2026". */
  monatName: string;
  belege: Bewirtung[];
  /** Foto je Beleg-Kennung. Fehlt eines, bleibt die Seite ohne Bild. */
  fotos: Map<string, { bytes: Buffer; typ: string }>;
}

export async function belegeMonatsPdf(d: MonatsPdfDaten): Promise<Buffer> {
  const firma = gesellschaftName(d.gesellschaft);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Belege ${d.monatName} - ${firma}`);
  pdf.setProducer("FZT Eventmanager");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);

  const logo = await readFile(path.join(process.cwd(), "src/lib/angebot/bilder/logo-dunkel.png"))
    .then((datei) => pdf.embedPng(datei))
    .catch(() => null as PDFImage | null);

  let seitenzahl = 0;
  let s: PDFPage = pdf.addPage([BREITE, HOEHE]);
  let y = 0;

  const schreib = (text: string, x: number, yy: number, groesse = 9, f: PDFFont = normal, farbe = SCHWARZ) =>
    s.drawText(sicher(text), { x, y: yy, size: groesse, font: f, color: farbe });

  const rechtsB = (text: string, x: number, yy: number, groesse = 9, f: PDFFont = normal, farbe = SCHWARZ) => {
    const t = sicher(text);
    s.drawText(t, { x: x - f.widthOfTextAtSize(t, groesse), y: yy, size: groesse, font: f, color: farbe });
  };

  const umbrechen = (text: string, f: PDFFont, groesse: number, breite: number): string[] => {
    const zeilen: string[] = [];
    for (const absatz of sicher(text).split(/\n/)) {
      let laufend = "";
      for (const wort of absatz.split(/\s+/)) {
        const versuch = laufend ? `${laufend} ${wort}` : wort;
        if (f.widthOfTextAtSize(versuch, groesse) > breite && laufend) {
          zeilen.push(laufend);
          laufend = wort;
        } else {
          laufend = versuch;
        }
      }
      zeilen.push(laufend);
    }
    return zeilen;
  };

  const neueSeite = (): void => {
    if (seitenzahl > 0) s = pdf.addPage([BREITE, HOEHE]);
    seitenzahl += 1;
    y = HOEHE - 56;
    if (logo) {
      const h = seitenzahl === 1 ? 22 : 14;
      s.drawImage(logo, {
        x: RECHTS - (logo.width * h) / logo.height,
        y: y - 4,
        width: (logo.width * h) / logo.height,
        height: h,
      });
    }
    schreib(`${firma} - Belege ${d.monatName}`, LINKS, y, 8, normal, HELLGRAU);
    y -= seitenzahl === 1 ? 36 : 24;
  };

  /* ------------------------------------------------------------------
     Aufstellung
     ------------------------------------------------------------------ */
  neueSeite();

  schreib(`Belege ${d.monatName}`, LINKS, y, 20, fett);
  y -= 18;
  schreib(firma, LINKS, y, 11, normal, GRAU);
  y -= 22;
  s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 1.2, color: GOLD });
  y -= 20;

  const X_NR = LINKS;
  const X_DATUM = LINKS + 78;
  const X_TEXT = LINKS + 132;
  const X_BRUTTO = 448;
  const X_UST = 500;
  const X_TRINK = RECHTS;

  const kopfzeile = () => {
    schreib("Nr.", X_NR, y, 7.5, fett, GRAU);
    schreib("Datum", X_DATUM, y, 7.5, fett, GRAU);
    schreib("Geschaeft und Anlass", X_TEXT, y, 7.5, fett, GRAU);
    rechtsB("Brutto", X_BRUTTO, y, 7.5, fett, GRAU);
    rechtsB("USt", X_UST, y, 7.5, fett, GRAU);
    rechtsB("Trinkgeld", X_TRINK, y, 7.5, fett, GRAU);
    y -= 5;
    s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.5, color: LINIE });
    y -= 12;
  };
  kopfzeile();

  for (const b of d.belege) {
    if (y - 14 < UNTEN) {
      neueSeite();
      kopfzeile();
    }
    const storniert = b.status === "storniert";
    const farbe = storniert ? HELLGRAU : SCHWARZ;
    schreib(b.nummer ?? "", X_NR, y, 7.5, normal, GRAU);
    schreib(datumDe(b.datum), X_DATUM, y, 8, normal, farbe);
    const was = `${b.restaurant}${b.art === "einkauf" ? (b.zweck ? `, ${b.zweck}` : "") : b.anlass ? `, ${b.anlass}` : ""}`;
    schreib(umbrechen(was, normal, 8, X_BRUTTO - X_TEXT - 46)[0] ?? "", X_TEXT, y, 8, normal, farbe);
    rechtsB(euro(b.bruttoCent), X_BRUTTO, y, 8, normal, farbe);
    rechtsB(euro(b.mwst7Cent + b.mwst19Cent), X_UST, y, 8, normal, farbe);
    rechtsB(b.trinkgeldCent ? euro(b.trinkgeldCent) : "", X_TRINK, y, 8, normal, farbe);
    if (storniert) schreib("storniert", X_TEXT, y - 8, 6.5, normal, HELLGRAU);
    y -= storniert ? 22 : 14;
  }

  y -= 4;
  s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.5, color: LINIE });
  y -= 20;

  const bew = summen(d.belege, "bewirtung", d.gesellschaft);
  const eink = summen(d.belege, "einkauf", d.gesellschaft);
  const zw = nachZahlweg(d.belege, d.gesellschaft);

  const block = (titel: string, zeilen: Array<[string, string, boolean?]>) => {
    if (y - (zeilen.length * 13 + 26) < UNTEN) neueSeite();
    schreib(titel, LINKS, y, 8, fett, GRAU);
    y -= 14;
    for (const [k, v, betont] of zeilen) {
      schreib(k, LINKS, y, 8.5, betont ? fett : normal, betont ? SCHWARZ : GRAU);
      rechtsB(v, LINKS + 260, y, 8.5, betont ? fett : normal);
      y -= 13;
    }
    y -= 10;
  };

  block("EINKAEUFE", [
    ["Belege (ohne Stornos)", String(eink.anzahl)],
    ["Betraege brutto", euro(eink.bruttoCent)],
    ["darin Vorsteuer", euro(eink.vorsteuerCent)],
    ["netto, voll abziehbar", euro(eink.abziehbarCent), true],
  ]);

  block("BEWIRTUNGEN", [
    ["Belege (ohne Stornos)", String(bew.anzahl)],
    ["Rechnungsbetraege brutto", euro(bew.bruttoCent)],
    ["darin Vorsteuer", euro(bew.vorsteuerCent)],
    ["Trinkgeld", euro(bew.trinkgeldCent)],
    ["Netto inkl. Trinkgeld", euro(bew.nettoCent)],
    ["davon abziehbar (70 %)", euro(bew.abziehbarCent), true],
    ["nicht abziehbar (30 %)", euro(bew.nichtAbziehbarCent)],
  ]);

  block("BEZAHLT", [
    ["mit Karte", euro(zw.karte)],
    ["bar", euro(zw.bar)],
    ["privat ausgelegt, zu erstatten", euro(zw.privat), true],
  ]);

  /* ------------------------------------------------------------------
     Je Beleg eine Seite: Angaben und Foto
     ------------------------------------------------------------------ */
  for (const b of d.belege) {
    neueSeite();

    schreib(b.art === "einkauf" ? "Beleg Einkauf" : "Bewirtungsbeleg", LINKS, y, 14, fett);
    y -= 14;
    schreib(
      `${firma}${b.art === "bewirtung" ? " - Angaben nach § 4 Abs. 5 Satz 1 Nr. 2 EStG" : ""}`,
      LINKS, y, 7.5, normal, HELLGRAU,
    );
    y -= 18;

    const netto = (b.bruttoCent ?? 0) - b.mwst7Cent - b.mwst19Cent;
    const bezahlt =
      `${b.zahlweg === "bar" ? "bar" : b.zahlweg === "karte" ? "Karte" : "unbekannt"}` +
      `${b.zahlart ? ` (${b.zahlart})` : ""}` +
      `${b.privatAusgelegt ? ", privat ausgelegt, von der Firma zu erstatten" : ""}`;

    const zeilen: Array<[string, string]> =
      b.art === "einkauf"
        ? [
            ["Beleg-Nr.", b.nummer ?? "Entwurf"],
            ["Datum", datumDe(b.datum)],
            ["Geschaeft", [b.restaurant, b.anschrift].filter(Boolean).join(", ")],
            ["Was und wofuer", b.zweck],
            ["Kategorie", b.kategorie],
            ["Betrag (brutto)", euro(b.bruttoCent)],
            ["davon Umsatzsteuer 7 %", euro(b.mwst7Cent)],
            ["davon Umsatzsteuer 19 %", euro(b.mwst19Cent)],
            ["Nettobetrag", euro(netto)],
            ["Bezahlt", bezahlt],
            ["Eingekauft von", b.bewirtender],
          ]
        : [
            ["Beleg-Nr.", b.nummer ?? "Entwurf"],
            ["Tag der Bewirtung", datumDe(b.datum)],
            ["Ort der Bewirtung", [b.restaurant, b.ortDerBewirtung || b.anschrift].filter(Boolean).join(", ")],
            ["Bewirtete Personen", b.teilnehmer],
            ["Anlass der Bewirtung", b.anlass],
            ["Rechnungsbetrag (brutto)", euro(b.bruttoCent)],
            ["davon Umsatzsteuer 7 %", euro(b.mwst7Cent)],
            ["davon Umsatzsteuer 19 %", euro(b.mwst19Cent)],
            ["Nettobetrag", euro(netto)],
            ["Trinkgeld", euro(b.trinkgeldCent)],
            ["Gesamtaufwand", euro((b.bruttoCent ?? 0) + b.trinkgeldCent)],
            ["Bezahlt", bezahlt],
            ["Bewirtende Person", b.bewirtender],
          ];

    const SPALTE = 150;
    for (const [k, v] of zeilen) {
      const teile = umbrechen(v || "-", normal, 9, RECHTS - LINKS - SPALTE);
      schreib(k, LINKS, y, 8.5, normal, GRAU);
      for (const [i, t] of teile.entries()) schreib(t, LINKS + SPALTE, y - i * 11, 9);
      y -= Math.max(14, teile.length * 11 + 3);
      s.drawLine({ start: { x: LINKS, y: y + 6 }, end: { x: RECHTS, y: y + 6 }, thickness: 0.4, color: LINIE });
    }

    if (b.notiz) {
      y -= 6;
      for (const t of umbrechen(`Notiz: ${b.notiz}`, normal, 8, RECHTS - LINKS)) {
        schreib(t, LINKS, y, 8, normal, GRAU);
        y -= 10;
      }
    }

    y -= 8;
    const herkunft =
      `Digital erfasst von ${b.erstelltVon} am ${zeitpunktDe(b.erstelltAm)}` +
      (b.festgeschriebenAm
        ? `, festgeschrieben von ${b.festgeschriebenVon} am ${zeitpunktDe(b.festgeschriebenAm)}`
        : "") +
      `. Fingerabdruck des Belegfotos (SHA-256): ${b.fotoHash}` +
      (b.status === "storniert"
        ? ` STORNIERT am ${zeitpunktDe(b.storniertAm)} von ${b.storniertVon}: ${b.stornoGrund ?? ""}`
        : "");
    for (const t of umbrechen(herkunft, normal, 7, RECHTS - LINKS)) {
      schreib(t, LINKS, y, 7, normal, HELLGRAU);
      y -= 9;
    }

    /*
      Das Foto darunter, so groß wie der Rest der Seite hergibt.

      Ohne Foto ist der Beleg für das Finanzamt wertlos, deshalb steht
      hier ein Hinweis, wenn keines eingebettet werden konnte, statt
      stillschweigend eine leere Seite zu liefern.
    */
    const foto = d.fotos.get(b.id);
    y -= 8;
    const platzHoehe = y - UNTEN;
    if (foto && platzHoehe > 80) {
      try {
        const bild = foto.typ.includes("png")
          ? await pdf.embedPng(foto.bytes)
          : await pdf.embedJpg(foto.bytes);
        const maxBreite = RECHTS - LINKS;
        const faktor = Math.min(maxBreite / bild.width, platzHoehe / bild.height);
        const w = bild.width * faktor;
        const h = bild.height * faktor;
        s.drawImage(bild, { x: LINKS + (maxBreite - w) / 2, y: y - h, width: w, height: h });
      } catch {
        schreib("Das Belegfoto liess sich nicht einbetten.", LINKS, y - 12, 8, normal, GRAU);
      }
    } else if (!foto) {
      schreib("Zu diesem Beleg liegt kein Foto vor.", LINKS, y - 12, 8, normal, GRAU);
    }
  }

  const seiten = pdf.getPages();
  seiten.forEach((seite, i) => {
    const t = `Seite ${i + 1} von ${seiten.length}`;
    seite.drawText(sicher(firma), { x: LINKS, y: 36, size: 7, font: normal, color: HELLGRAU });
    seite.drawText(t, {
      x: RECHTS - normal.widthOfTextAtSize(t, 7),
      y: 36, size: 7, font: normal, color: HELLGRAU,
    });
  });

  return Buffer.from(await pdf.save());
}
