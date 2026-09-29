/**
 * Die Stundenmeldung als PDF.
 *
 * Vorne die Sammelliste, dahinter je Mitarbeiter das Protokoll. Frau
 * Buschow arbeitet mit der Sammelliste; das Protokoll liegt dabei, damit
 * jede Zahl belegt ist, wenn jemand nachfragt (Florian, 29.09.2026).
 *
 * Aufgemacht wie Angebot und Rechnung: dasselbe Logo, dieselbe Schrift.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Absender } from "@/lib/angebot/pdf";
import { alsDezimal, alsStunden, type Mitarbeiterzeiten } from "./auswertung";
import type { Zeitraum } from "./zeitraum";

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
const UNTEN = 70;

const datumDe = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const wochentag = (iso: string) => WOCHENTAGE[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** Was die Standardschrift nicht kann, wird ersetzt. */
function sicher(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E -ÿ\n€]/g, "");
}

export interface LohnPdfDaten {
  zeitraum: Zeitraum;
  leute: Mitarbeiterzeiten[];
  absender: Absender;
  /** Wer die Meldung freigegeben hat. Steht unter der Sammelliste. */
  bestaetigtVon?: string | null;
}

export async function lohnPdf(d: LohnPdfDaten): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Stundenmeldung ${d.zeitraum.name}`);
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
    groesse = 9, f: PDFFont = normal, farbe = SCHWARZ,
  ) => s.drawText(sicher(text), { x, y: yy, size: groesse, font: f, color: farbe });

  const rechtsB = (
    text: string, x: number, yy: number,
    groesse = 9, f: PDFFont = normal, farbe = SCHWARZ,
  ) => {
    const t = sicher(text);
    s.drawText(t, { x: x - f.widthOfTextAtSize(t, groesse), y: yy, size: groesse, font: f, color: farbe });
  };

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
    schreib(`Stundenmeldung ${d.zeitraum.name}`, LINKS, y, seitenzahl === 1 ? 9 : 8, normal, HELLGRAU);
    y -= seitenzahl === 1 ? 40 : 26;
  };

  const platz = (hoehe: number): void => {
    if (y - hoehe < UNTEN) neueSeite();
  };

  /* ------------------------------------------------------------------
     Kopf und Sammelliste
     ------------------------------------------------------------------ */
  neueSeite();

  schreib("Arbeitszeiten", LINKS, y, 20, fett);
  y -= 20;
  schreib(
    `${datumDe(d.zeitraum.von)} bis ${datumDe(d.zeitraum.bis)}`,
    LINKS, y, 11, normal, GRAU,
  );
  y -= 14;
  schreib(d.absender.firma, LINKS, y, 9, normal, HELLGRAU);
  y -= 26;

  s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 1.2, color: GOLD });
  y -= 22;

  // Spalten der Sammelliste.
  const X_NAME = LINKS;
  const X_STD = 320;
  const X_PAUSE = 385;
  const X_TAGE = 430;
  const X_URLAUB = 480;
  const X_KRANK = RECHTS;

  const kopfzeile = () => {
    schreib("Mitarbeiter", X_NAME, y, 8, fett, GRAU);
    rechtsB("Stunden", X_STD, y, 8, fett, GRAU);
    rechtsB("Pause", X_PAUSE, y, 8, fett, GRAU);
    rechtsB("Tage", X_TAGE, y, 8, fett, GRAU);
    rechtsB("Urlaub", X_URLAUB, y, 8, fett, GRAU);
    rechtsB("Krank", X_KRANK, y, 8, fett, GRAU);
    y -= 6;
    s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.5, color: LINIE });
    y -= 13;
  };
  kopfzeile();

  let summe = 0;
  for (const p of d.leute) {
    if (y - 16 < UNTEN) {
      neueSeite();
      kopfzeile();
    }
    schreib(p.name, X_NAME, y, 9.5);
    rechtsB(alsDezimal(p.arbeitMinuten), X_STD, y, 9.5, fett);
    rechtsB(alsDezimal(p.pauseMinuten), X_PAUSE, y, 9);
    rechtsB(String(p.arbeitstage), X_TAGE, y, 9);
    rechtsB(p.urlaubstage ? String(p.urlaubstage) : "-", X_URLAUB, y, 9);
    rechtsB(p.kranktage ? String(p.kranktage) : "-", X_KRANK, y, 9);
    summe += p.arbeitMinuten;
    y -= 16;
  }

  y -= 2;
  s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.5, color: LINIE });
  y -= 14;
  schreib(`Summe (${d.leute.length} Mitarbeiter)`, X_NAME, y, 9, fett);
  rechtsB(alsDezimal(summe), X_STD, y, 9.5, fett);
  y -= 24;

  schreib("Stunden als Dezimalzahl, zum Beispiel 7,75 fuer 7 Stunden 45 Minuten.", LINKS, y, 8, normal, HELLGRAU);
  y -= 12;

  const offene = d.leute.filter((p) => p.offeneTage.length > 0);
  if (offene.length > 0) {
    y -= 6;
    schreib("Noch zu klaeren", LINKS, y, 9, fett);
    y -= 13;
    for (const p of offene) {
      platz(13);
      schreib(
        `${p.name}: an ${p.offeneTage.length} Tag(en) fehlt das Ausstempeln (${p.offeneTage
          .map(datumDe)
          .join(", ")}). Diese Tage sind mit null Stunden gerechnet.`,
        LINKS, y, 8, normal, GRAU,
      );
      y -= 12;
    }
  }

  if (d.bestaetigtVon) {
    y -= 10;
    platz(20);
    schreib(`Geprueft und freigegeben von ${d.bestaetigtVon}.`, LINKS, y, 8.5, normal, GRAU);
    y -= 12;
  }

  /* ------------------------------------------------------------------
     Protokoll je Mitarbeiter
     ------------------------------------------------------------------ */
  for (const p of d.leute) {
    neueSeite();
    schreib(p.name, LINKS, y, 14, fett);
    rechtsB(`${alsStunden(p.arbeitMinuten)} Std`, RECHTS, y, 12, fett);
    y -= 14;
    schreib(
      `${datumDe(d.zeitraum.von)} bis ${datumDe(d.zeitraum.bis)} - ${p.arbeitstage} Arbeitstage, ` +
        `${p.urlaubstage} Urlaubstage, ${p.kranktage} Kranktage`,
      LINKS, y, 8.5, normal, GRAU,
    );
    y -= 18;
    s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.5, color: LINIE });
    y -= 15;

    // Arbeitstage und Abwesenheiten in einer Liste, nach Datum.
    const zeilen: Array<{ datum: string; text: string; wert: string; hinweis: string }> = [];
    for (const t of p.protokoll) {
      zeilen.push({
        datum: t.datum,
        text: t.stempel.map((x) => `${kuerzel(x.art)} ${x.uhrzeit}`).join("   "),
        wert: `${alsStunden(t.arbeitMinuten)}${t.pauseMinuten ? ` (Pause ${alsStunden(t.pauseMinuten)})` : ""}`,
        hinweis: t.offen ? "Ausstempeln fehlt" : "",
      });
    }
    const gestempelt = new Set(p.protokoll.map((t) => t.datum));
    for (const a of p.abwesend) {
      if (gestempelt.has(a.datum)) continue;
      zeilen.push({
        datum: a.datum,
        text: a.art === "urlaub" ? "Urlaub" : a.art === "krank" ? "Krank" : "Frei",
        wert: "",
        hinweis: a.grund,
      });
    }
    zeilen.sort((a, b) => a.datum.localeCompare(b.datum));

    if (zeilen.length === 0) {
      schreib("Keine Zeiten in diesem Zeitraum.", LINKS, y, 9, normal, GRAU);
      y -= 14;
    }

    let hell = false;
    for (const z of zeilen) {
      if (y - 15 < UNTEN) {
        neueSeite();
        schreib(`${p.name} (Fortsetzung)`, LINKS, y, 9, normal, GRAU);
        y -= 16;
      }
      if (hell) {
        s.drawRectangle({ x: LINKS - 4, y: y - 4, width: RECHTS - LINKS + 8, height: 15, color: FLAECHE });
      }
      hell = !hell;
      schreib(`${wochentag(z.datum)} ${datumDe(z.datum)}`, LINKS, y, 8.5, fett);
      schreib(z.text, LINKS + 80, y, 8.5, normal, GRAU);
      rechtsB(z.wert, RECHTS, y, 8.5);
      y -= 15;
      if (z.hinweis) {
        schreib(z.hinweis, LINKS + 80, y + 3, 7.5, normal, HELLGRAU);
        y -= 9;
      }
    }
  }

  /* Fusszeile auf jede Seite. */
  const seiten = pdf.getPages();
  seiten.forEach((seite, i) => {
    seite.drawText(
      sicher(`${d.absender.firma} - ${d.absender.strasse}, ${d.absender.plz} ${d.absender.ort}`),
      { x: LINKS, y: 40, size: 7, font: normal, color: HELLGRAU },
    );
    const t = `Seite ${i + 1} von ${seiten.length}`;
    seite.drawText(t, {
      x: RECHTS - normal.widthOfTextAtSize(t, 7),
      y: 40, size: 7, font: normal, color: HELLGRAU,
    });
  });

  return Buffer.from(await pdf.save());
}

function kuerzel(art: string): string {
  if (art === "kommen") return "ein";
  if (art === "gehen") return "aus";
  if (art === "pause_start") return "Pause ab";
  if (art === "pause_ende") return "Pause bis";
  return art;
}
