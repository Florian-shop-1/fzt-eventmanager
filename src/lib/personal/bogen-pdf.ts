/**
 * Der Personalbogen als PDF.
 *
 * Das Lohnbüro bekommt ihn zusammen mit dem Arbeitsvertrag in einer Mail:
 * "sie kriegt also eine Mail mit zwei Anhängen" (Florian, 15.10.2026).
 * Als Anhang lässt er sich dort ablegen, ein Mailtext nicht.
 *
 * Aufgemacht wie die übrigen Papiere aus dem Haus: dasselbe Logo,
 * dieselbe Schrift, derselbe Goldstrich.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { zeilen, type Personalbogen } from "./personalbogen";

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

function sicher(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E -ÿ\n€]/g, "");
}

export async function bogenPdf(o: {
  name: string;
  daten: Personalbogen;
  /** Woher die Angaben stammen, etwa "selbst ausgefüllt". */
  quelle: string;
  erfasstAm: string;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Personalbogen ${o.name}`);
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
    schreib(`Personalbogen ${o.name}`, LINKS, y, seitenzahl === 1 ? 9 : 8, normal, HELLGRAU);
    y -= seitenzahl === 1 ? 36 : 26;
  };

  const platz = (hoehe: number): void => {
    if (y - hoehe < UNTEN) neueSeite();
  };

  neueSeite();

  schreib("Personalbogen", LINKS, y, 20, fett);
  y -= 10;
  s.drawRectangle({ x: LINKS, y: y - 4, width: 44, height: 2.5, color: GOLD });
  y -= 20;
  schreib(o.name, LINKS, y, 12, fett);
  y -= 14;
  schreib(
    `${o.quelle || "Angaben aus dem Eventmanager"} · Stand ${o.erfasstAm.slice(0, 10).split("-").reverse().join(".")}`,
    LINKS, y, 8.5, normal, HELLGRAU,
  );
  y -= 26;

  for (const gruppe of zeilen(o.daten)) {
    const felder = gruppe.felder.filter(([, wert]) => String(wert).trim() !== "");
    if (felder.length === 0) continue;

    platz(40 + felder.length * 14);
    schreib(gruppe.gruppe.toUpperCase(), LINKS, y, 8.5, fett, GRAU);
    y -= 8;
    s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.5, color: LINIE });
    y -= 15;

    for (const [was, wert] of felder) {
      platz(16);
      schreib(was, LINKS, y, 9, normal, GRAU);
      schreib(String(wert), LINKS + 170, y, 9.5, fett);
      y -= 15;
    }
    y -= 12;
  }

  platz(26);
  schreib(
    "Erfasst im FZT Eventmanager. Rückfragen bitte an das Büro, nicht an den Mitarbeiter.",
    LINKS, y, 8, normal, HELLGRAU,
  );

  return Buffer.from(await pdf.save());
}

/** Der Dateiname, unter dem der Bogen verschickt wird. */
export function bogenDateiname(name: string): string {
  const sauber = sicher(name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Personalbogen-${sauber}.pdf`;
}
