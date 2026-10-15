/**
 * Der unterschriebene Arbeitsvertrag als PDF.
 *
 * Gebraucht für das Lohnbüro: "schicke Arbeitsverträge, sobald sie
 * unterschrieben sind, an Werner und Buschow" (Florian, 15.10.2026).
 * Bisher lag der Vertrag nur im Eventmanager und ließ sich dort ansehen
 * und ausdrucken, verschicken ließ er sich nicht.
 *
 * Gedruckt wird genau der Text, der beim Unterschreiben festgehalten
 * wurde (vertragstext), nicht der heutige Mustertext. Ändert sich die
 * Vorlage später, bleibt das PDF das, was unterschrieben wurde.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Arbeitsvertrag } from "@/lib/db/arbeitsvertrag";

const SCHWARZ = rgb(0.07, 0.07, 0.07);
const GRAU = rgb(0.42, 0.42, 0.42);
const HELLGRAU = rgb(0.58, 0.58, 0.58);
const GOLD = rgb(0.788, 0.659, 0.298);
const LINIE = rgb(0.85, 0.84, 0.8);

const BREITE = 595.28;
const HOEHE = 841.89;
const LINKS = 52;
const RECHTS = 543;
const UNTEN = 70;

const datumDe = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");

/** Was die Standardschrift nicht kann, wird ersetzt. */
function sicher(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E -ÿ\n€]/g, "");
}

/** Eine Unterschrift aus der Datenbank, falls sie als PNG vorliegt. */
async function unterschriftBild(pdf: PDFDocument, wert: string | null): Promise<PDFImage | null> {
  if (!wert?.startsWith("data:image/png;base64,")) return null;
  try {
    return await pdf.embedPng(Buffer.from(wert.split(",")[1], "base64"));
  } catch {
    return null;
  }
}

export async function vertragPdf(v: Arbeitsvertrag): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Arbeitsvertrag ${v.name}`);
  pdf.setProducer("FZT Eventmanager");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);

  const logo = await readFile(path.join(process.cwd(), "src/lib/angebot/bilder/logo-dunkel.png"))
    .then((datei) => pdf.embedPng(datei))
    .catch(() => null as PDFImage | null);

  let seitenzahl = 0;
  let s: PDFPage = pdf.addPage([BREITE, HOEHE]);
  let y = 0;

  const schreib = (
    text: string, x: number, yy: number,
    groesse = 9.5, f: PDFFont = normal, farbe = SCHWARZ,
  ) => s.drawText(sicher(text), { x, y: yy, size: groesse, font: f, color: farbe });

  const neueSeite = (): void => {
    if (seitenzahl > 0) s = pdf.addPage([BREITE, HOEHE]);
    seitenzahl += 1;
    y = HOEHE - 58;
    if (logo) {
      const h = seitenzahl === 1 ? 22 : 15;
      s.drawImage(logo, {
        x: RECHTS - (logo.width * h) / logo.height,
        y: y - 4,
        width: (logo.width * h) / logo.height,
        height: h,
      });
    }
    schreib(`Arbeitsvertrag ${v.name}`, LINKS, y, seitenzahl === 1 ? 9 : 8, normal, HELLGRAU);
    y -= seitenzahl === 1 ? 36 : 26;
  };

  const platz = (hoehe: number): void => {
    if (y - hoehe < UNTEN) neueSeite();
  };

  /** Umbricht einen Absatz auf die Spaltenbreite. */
  const umbrechen = (text: string, f: PDFFont, groesse: number, breite: number): string[] => {
    const zeilen: string[] = [];
    let zeile = "";
    for (const wort of sicher(text).split(/\s+/)) {
      const versuch = zeile ? `${zeile} ${wort}` : wort;
      if (f.widthOfTextAtSize(versuch, groesse) > breite && zeile) {
        zeilen.push(zeile);
        zeile = wort;
      } else {
        zeile = versuch;
      }
    }
    if (zeile) zeilen.push(zeile);
    return zeilen;
  };

  neueSeite();

  /*
    Der Text, wie er unterschrieben wurde.

    Die erste Zeile ist die Überschrift, Zeilen mit einem Paragrafen
    davor sind Zwischenüberschriften. Alles andere ist Fließtext.
  */
  const zeilen = (v.vertragstext ?? "").split(/\r?\n/);

  zeilen.forEach((roh, i) => {
    const zeile = roh.trim();
    if (!zeile) {
      y -= 6;
      return;
    }

    if (i === 0) {
      platz(40);
      schreib(zeile, LINKS, y, 19, fett);
      y -= 10;
      s.drawRectangle({ x: LINKS, y: y - 4, width: 44, height: 2.5, color: GOLD });
      y -= 22;
      return;
    }

    const ueberschrift = /^§\s?\d/.test(zeile);
    const groesse = ueberschrift ? 11 : 9.5;
    const schrift = ueberschrift ? fett : normal;

    if (ueberschrift) y -= 8;
    for (const z of umbrechen(zeile, schrift, groesse, RECHTS - LINKS)) {
      platz(14);
      schreib(z, LINKS, y, groesse, schrift);
      y -= groesse + 4;
    }
  });

  /* ------------------------------------------------------------------
     Die Unterschriften. Beide auf eine Seite, nebeneinander.
     ------------------------------------------------------------------ */
  platz(140);
  y -= 14;
  s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.5, color: LINIE });
  y -= 24;

  const [ag, an] = await Promise.all([
    unterschriftBild(pdf, v.arbeitgeberUnterschrift),
    unterschriftBild(pdf, v.unterschrift),
  ]);

  const spalte = (x: number, bild: PDFImage | null, wer: string, wann: string) => {
    if (bild) {
      const h = Math.min(42, (bild.height * 200) / bild.width);
      s.drawImage(bild, { x, y: y - h + 10, width: (bild.width * h) / bild.height, height: h });
    }
    s.drawLine({
      start: { x, y: y - 44 },
      end: { x: x + 200, y: y - 44 },
      thickness: 0.5,
      color: LINIE,
    });
    schreib(wer, x, y - 58, 8.5, normal, GRAU);
    if (wann) schreib(wann, x, y - 70, 8.5, normal, HELLGRAU);
  };

  spalte(LINKS, ag, "Florian Zimmer Theater GmbH", datumDe(v.unterschriebenAm));
  spalte(LINKS + 250, an, v.name, datumDe(v.unterschriebenAm));

  y -= 86;
  platz(20);
  schreib(
    "Beide Unterschriften wurden im FZT Eventmanager am Bildschirm geleistet.",
    LINKS, y, 8, normal, HELLGRAU,
  );

  return Buffer.from(await pdf.save());
}

/** Der Dateiname, unter dem der Vertrag verschickt wird. */
export function vertragDateiname(v: Arbeitsvertrag): string {
  const name = sicher(v.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Arbeitsvertrag-${name}-${v.beginn}.pdf`;
}
