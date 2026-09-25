/**
 * Das Angebot als PDF, direkt aus dem Eventmanager.
 *
 * Vorbild sind die dreißig Angebote aus Lexware Office, die Florian am
 * 25.09.2026 herübergegeben hat (AG-0826-1152 bis AG-0826-1169). Deren
 * Aufbau bleibt erhalten, weil er sich bewährt hat:
 *
 *  - Oben der Ablauf des Abends mit Uhrzeiten. Das ist das Erste, was der
 *    Kunde liest, und das, was ihn überzeugt.
 *  - Dann die Positionen mit Artikelnummer, Beschreibung und Rabatt.
 *  - Optionale Positionen als O1, O2, O3 mit dem Betrag in Klammern: ein
 *    Angebot zum Dazuwählen, das nicht in der Summe steckt.
 *  - Zwischensumme unten, Übertrag oben auf der Folgeseite.
 *  - Der Steuerausweis als Satz, getrennt nach 7 und 19 Prozent.
 *  - Die Pflichtangaben in der Fußzeile jeder Seite.
 *
 * Neu ist, was Lexware nicht konnte: Bilder. Ein Angebot über zwanzig-
 * tausend Euro darf aussehen wie ein Abend, auf den man sich freut, und
 * nicht wie ein Kontoauszug (Florian, 25.09.2026).
 *
 * Gesetzt mit pdf-lib, also ohne Browser im Hintergrund. Die
 * Standardschriften decken deutsche Umlaute ab (WinAnsi); was darüber
 * hinausgeht, wird vorher ersetzt, sonst bricht pdf-lib beim Zeichnen.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import type { Position } from "@/lib/domain/vorgang";
import { angebotssumme, positionsSumme } from "./erstellen";

/** Absender mit allen Pflichtangaben, wie er auch auf der Rechnung steht. */
export interface Absender {
  firma: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  web: string;
  steuernummer?: string;
  ustId?: string;
  iban?: string;
  bic?: string;
  bank?: string;
  geschaeftsfuehrer?: string;
  registergericht?: string;
  sitz?: string;
}

/** Eine Station des Abends, wie sie oben im Angebot steht. */
export interface Ablaufpunkt {
  zeit: string;
  text: string;
}

export interface AngebotsPdfDaten {
  nummer: string;
  /** Die Zeile über der Angebotsnummer, etwa "Abendessen + Show". */
  titel: string;
  erstelltAm: string;
  gueltigBis: string;
  kundennummer?: string | null;
  einleitung: string;
  schlusstext: string;
  ablauf: Ablaufpunkt[];
  positionen: Position[];
  kunde: {
    name: string;
    ansprechpartner: string | null;
    strasse?: string | null;
    plz?: string | null;
    ort?: string | null;
  };
  vorstellung: { datum: string; show: string } | null;
  personen?: number | null;
  /**
   * Zeigt die letzte Seite die Gänge aus der Magicuisine?
   *
   * Bei Fingerfood nicht: Wer Fingerfood bestellt, bekommt keine
   * Tellergerichte, und ein Angebot darf nichts zeigen, was nicht
   * kommt (Florian, 25.09.2026).
   */
  mitMenuebildern?: boolean;
  /** Der Link, unter dem der Kunde zusagen kann. */
  link?: string | null;
  absender: Absender;
}

const SCHWARZ = rgb(0.07, 0.07, 0.07);
const GRAU = rgb(0.42, 0.42, 0.42);
const HELLGRAU = rgb(0.58, 0.58, 0.58);
const GOLD = rgb(0.788, 0.659, 0.298);
const WEISS = rgb(1, 1, 1);
const LINIE = rgb(0.85, 0.84, 0.8);
const FLAECHE = rgb(0.972, 0.963, 0.937);

const BREITE = 595.28;
const HOEHE = 841.89;
const LINKS = 52;
const RECHTS = 543;
/** Unterhalb dieser Höhe beginnt die Fußzeile. */
const UNTEN = 106;

/** Spalten der Positionstabelle, rechtsbündig ausgerichtet. */
const SP_MENGE = 352;
const SP_EINHEIT = 400;
const SP_EINZEL = 452;
const SP_RABATT = 492;

const eur = (c: number) =>
  (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/**
 * Was die Standardschrift nicht kann, wird ersetzt.
 *
 * pdf-lib wirft bei einem Zeichen außerhalb von WinAnsi einen Fehler und
 * reißt damit das ganze PDF mit. Lieber ein schlichteres Zeichen als gar
 * kein Angebot.
 */
function sicher(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // Zeilenumbrueche bleiben stehen: sie tragen die Absaetze. Alles
    // andere, was die Standardschrift nicht kennt, faellt weg.
    .replace(/[^\x20-\x7E -ÿ\n€]/g, "");
}

function datumLang(iso: string): string {
  const tage = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const monate = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return datumDe(iso);
  return `${tage[d.getUTCDay()]}, ${d.getUTCDate()}. ${monate[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Text auf eine Breite umbrechen. */
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

export async function angebotsPdf(d: AngebotsPdfDaten): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Angebot ${d.nummer}`);
  pdf.setProducer("FZT Eventmanager");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const kursiv = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const bildSpeicher = new Map<string, PDFImage>();
  /**
   * Ein Bild aus bilder/ holen, einmal je Datei.
   *
   * PNG fuer das Logo und die Unterschrift, weil beide durchsichtig sind.
   * JPG fuer die Fotos, weil das kleinere Dateien gibt.
   */
  const bild = async (name: string): Promise<PDFImage> => {
    const schon = bildSpeicher.get(name);
    if (schon) return schon;
    const datei = await readFile(path.join(process.cwd(), "src/lib/angebot/bilder", name));
    const img = name.endsWith(".png") ? await pdf.embedPng(datei) : await pdf.embedJpg(datei);
    bildSpeicher.set(name, img);
    return img;
  };

  /* ------------------------------------------------------------------
     Werkzeug: schreiben, Seiten anlegen, umbrechen
     ------------------------------------------------------------------ */

  /*
    Das Logo wird einmal geladen, bevor die erste Seite steht: neueSeite()
    setzt es auf jede Folgeseite, und dort laesst sich nicht warten.
    Fehlt die Datei, geht es ohne Logo weiter statt gar nicht.
  */
  const logoHell = await bild("logo-hell.png").catch(() => null);
  const logoDunkel = await bild("logo-dunkel.png").catch(() => null);

  const seiten: PDFPage[] = [];
  /*
    Die erste Seite entsteht sofort, damit TypeScript weiss, dass `s`
    immer eine Seite ist. Sie wird gleich danach von neueSeite() richtig
    aufgesetzt; ein zweites Mal angelegt wird sie nicht.
  */
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

  const mittig = (text: string, yy: number, groesse = 10, f: PDFFont = normal, farbe = SCHWARZ) =>
    s.drawText(sicher(text), {
      x: (BREITE - f.widthOfTextAtSize(sicher(text), groesse)) / 2,
      y: yy, size: groesse, font: f, color: farbe,
    });

  /**
   * Ein Bild in seinen Rahmen setzen.
   *
   * Die Bilder unter bilder/ sind schon genau auf das Format
   * zugeschnitten, in dem sie hier stehen. Früher hat diese Funktion den
   * Überstand mit weißen Rechtecken abgedeckt, weil pdf-lib nicht
   * beschneiden kann. Das ging schief, sobald zwei Bilder nebeneinander
   * standen: Die Abdeckung des zweiten löschte das erste.
   *
   * Passt ein Bild doch einmal nicht, wird es eingepasst statt verzerrt.
   * Dann bleibt seitlich Luft, aber nichts wird krumm.
   */
  const fuellen = (seite: PDFPage, img: PDFImage, r: { x: number; y: number; w: number; h: number }) => {
    const faktor = Math.min(r.w / img.width, r.h / img.height);
    const b = img.width * faktor;
    const hh = img.height * faktor;
    seite.drawImage(img, { x: r.x + (r.w - b) / 2, y: r.y + (r.h - hh) / 2, width: b, height: hh });
  };

  /** Neue Seite anlegen. Der Kopf der Folgeseiten ist schmal. */
  const neueSeite = (): PDFPage => {
    // Die erste Seite steht schon, jede weitere kommt hinzu.
    if (seiten.length > 0) s = pdf.addPage([BREITE, HOEHE]);
    seiten.push(s);
    y = HOEHE - 64;
    if (seiten.length > 1) {
      schreib(`Angebot ${d.nummer}`, LINKS, y, 11, fett);
      // Das Logo statt eines Schriftzugs: Es ist unsere Marke, und auf
      // jeder Seite erkennbar (Florian, 25.09.2026).
      if (logoDunkel) {
        const h = 16;
        s.drawImage(logoDunkel, {
          x: RECHTS - (logoDunkel.width * h) / logoDunkel.height,
          y: y - 3,
          width: (logoDunkel.width * h) / logoDunkel.height,
          height: h,
        });
      } else {
        rechtsB(d.titel, RECHTS, y, 9.5, normal, GRAU);
      }
      y -= 22;
    }
    return s;
  };

  /** Platz schaffen. Reicht er nicht, kommt eine neue Seite. */
  const platz = (hoehe: number): boolean => {
    if (y - hoehe >= UNTEN) return false;
    neueSeite();
    return true;
  };

  /* ------------------------------------------------------------------
     Seite 1: Kopf, Anschrift, Ablauf
     ------------------------------------------------------------------ */
  neueSeite();

  fuellen(s, await bild("kopf.jpg"), { x: 0, y: HOEHE - 190, w: BREITE, h: 190 });
  s.drawRectangle({ x: 0, y: HOEHE - 190, width: BREITE, height: 62, color: rgb(0, 0, 0), opacity: 0.6 });
  if (logoHell) {
    const h = 30;
    s.drawImage(logoHell, {
      x: LINKS,
      y: HOEHE - 181,
      width: (logoHell.width * h) / logoHell.height,
      height: h,
    });
  } else {
    schreib("FLORIAN ZIMMER THEATER", LINKS, HOEHE - 170, 12.5, fett, WEISS);
  }
  rechtsB(d.titel, RECHTS, HOEHE - 168, 13, kursiv, GOLD);

  y = HOEHE - 214;

  // Absenderzeile über der Anschrift, wie im Briefumschlagfenster.
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

  // Eckdaten rechts, auf Höhe der Anschrift.
  let yr = anschriftOben;
  const eck = (k: string, v: string) => {
    schreib(k, 372, yr, 8.5, normal, GRAU);
    rechtsB(v, RECHTS, yr, 9.5, fett);
    yr -= 14;
  };
  eck("Angebotsnr.", d.nummer);
  if (d.kundennummer) eck("Kundennr.", d.kundennummer);
  eck("Datum", datumDe(d.erstelltAm));
  eck("Gültig bis", datumDe(d.gueltigBis));
  if (d.personen) eck("Personen", String(d.personen));

  y = Math.min(y, yr) - 24;

  // Überschrift und Einleitung
  schreib(
    d.vorstellung ? `Euer Event am ${datumLang(d.vorstellung.datum)}` : "Euer Event im Florian Zimmer Theater",
    LINKS, y, 16, fett,
  );
  y -= 8;
  s.drawRectangle({ x: LINKS, y: y - 4, width: 44, height: 2.5, color: GOLD });
  y -= 22;

  for (const zeile of umbrechen(d.einleitung, normal, 10, RECHTS - LINKS)) {
    platz(14);
    schreib(zeile, LINKS, y, 10);
    y -= 14;
  }

  /* Der Ablauf des Abends. */
  if (d.ablauf.length > 0) {
    y -= 14;
    platz(40);
    schreib("So läuft euer Abend", LINKS, y, 12, fett);
    y -= 18;

    for (const punkt of d.ablauf) {
      const zeilen = umbrechen(punkt.text, normal, 9.5, RECHTS - LINKS - 62);
      platz(zeilen.length * 12 + 12);
      schreib(punkt.zeit, LINKS, y, 10, fett, GOLD);
      let yy = y;
      for (const zeile of zeilen) {
        schreib(zeile, LINKS + 62, yy, 9.5);
        yy -= 12;
      }
      y = yy - 8;
    }
  }

  /* ------------------------------------------------------------------
     Die Positionen
     ------------------------------------------------------------------ */
  y -= 18;
  platz(70);

  let uebertragCent = 0;
  let zwischensummeGezeigt = false;

  const tabellenkopf = () => {
    schreib("Pos.", LINKS, y, 8, fett, GRAU);
    schreib("Bezeichnung", LINKS + 26, y, 8, fett, GRAU);
    rechtsB("Menge", SP_MENGE, y, 8, fett, GRAU);
    schreib("Einheit", SP_EINHEIT - 28, y, 8, fett, GRAU);
    rechtsB("Einzel €", SP_EINZEL, y, 8, fett, GRAU);
    rechtsB("Rabatt", SP_RABATT, y, 8, fett, GRAU);
    rechtsB("Gesamt €", RECHTS, y, 8, fett, GRAU);
    y -= 6;
    s.drawLine({ start: { x: LINKS, y }, end: { x: RECHTS, y }, thickness: 0.8, color: SCHWARZ });
    y -= 15;
  };

  tabellenkopf();

  const haupt = d.positionen.filter((p) => !p.istAlternativeZu);
  const optionale = (id: string) => d.positionen.filter((a) => a.istAlternativeZu === id);

  /** Eine Zeile samt Beschreibung setzen. Optionale stehen in Klammern. */
  const positionSetzen = (p: Position, marke: string, optional: boolean) => {
    const beschreibungszeilen = [
      ...(p.artikelNummer ? [`Art.-Nr.: ${p.artikelNummer}`] : []),
      ...(p.beschreibung ? umbrechen(p.beschreibung, normal, 8.5, 250) : []),
    ];
    const titelzeilen = umbrechen(p.bezeichnung, optional ? normal : fett, 10, 250);
    const hoehe = (titelzeilen.length + beschreibungszeilen.length) * 12 + 10;

    // Bricht die Position um, wandert sie ganz auf die nächste Seite.
    // Eine Position auseinanderzureißen macht sie unlesbar.
    if (y - hoehe < UNTEN) {
      zwischensumme();
      neueSeite();
      uebertrag();
      tabellenkopf();
    }

    const betrag = positionsSumme(p);
    const oben = y;

    schreib(marke, LINKS, oben, optional ? 8.5 : 9.5, optional ? normal : fett, optional ? GRAU : SCHWARZ);
    let yy = oben;
    for (const zeile of titelzeilen) {
      schreib(zeile, LINKS + 26, yy, 10, optional ? normal : fett, optional ? GRAU : SCHWARZ);
      yy -= 12;
    }
    for (const zeile of beschreibungszeilen) {
      schreib(zeile, LINKS + 26, yy, 8.5, normal, HELLGRAU);
      yy -= 11;
    }

    rechtsB(String(p.menge), SP_MENGE, oben, 9.5, normal, optional ? GRAU : SCHWARZ);
    schreib(p.einheit, SP_EINHEIT - 28, oben, 9.5, normal, optional ? GRAU : SCHWARZ);
    rechtsB(eur(p.einzelBruttoCent), SP_EINZEL, oben, 9.5, normal, optional ? GRAU : SCHWARZ);
    if (p.rabattProzent) rechtsB(`${p.rabattProzent} %`, SP_RABATT, oben, 9.5, normal, GOLD);
    rechtsB(
      optional ? `(${eur(betrag)})` : eur(betrag),
      RECHTS, oben, optional ? 9.5 : 10, optional ? normal : fett, optional ? GRAU : SCHWARZ,
    );

    if (!optional) uebertragCent += betrag;
    y = yy - 6;
    s.drawLine({ start: { x: LINKS, y: y + 3 }, end: { x: RECHTS, y: y + 3 }, thickness: 0.35, color: LINIE });
    y -= 5;
  };

  const zwischensumme = () => {
    rechtsB("Zwischensumme", SP_EINZEL, y, 9, fett, GRAU);
    rechtsB(eur(uebertragCent), RECHTS, y, 10, fett);
    zwischensummeGezeigt = true;
  };

  const uebertrag = () => {
    rechtsB("Übertrag", SP_EINZEL, y, 9, normal, GRAU);
    rechtsB(eur(uebertragCent), RECHTS, y, 10, fett);
    y -= 18;
  };

  let nummer = 1;
  let optionNummer = 1;
  for (const p of haupt) {
    positionSetzen(p, String(nummer++), false);
    for (const a of optionale(p.id)) {
      positionSetzen(a, `O${optionNummer++}`, true);
    }
  }

  void zwischensummeGezeigt;

  /* ------------------------------------------------------------------
     Summe und Steuerausweis
     ------------------------------------------------------------------ */
  const summe = angebotssumme(d.positionen);
  const steuersatz = summe.ustNachSatz
    .map((e) => `USt ${Math.round(e.satz * 100)} % (${eur(e.ustCent)} € auf Netto ${eur(e.nettoCent)} €)`)
    .join(", ");
  const steuersatzZeilen = umbrechen(
    `* Im Gesamtbetrag von ${eur(summe.bruttoCent)} € (Netto: ${eur(summe.nettoCent)} €) sind ${steuersatz} enthalten.`,
    normal, 8, RECHTS - LINKS,
  );

  platz(40 + steuersatzZeilen.length * 11);
  y -= 6;
  s.drawRectangle({ x: 300, y: y - 12, width: RECHTS - 300 + 8, height: 30, color: FLAECHE });
  schreib("Gesamtbetrag*", 312, y, 11, fett);
  rechtsB(`${eur(summe.bruttoCent)} €`, RECHTS, y, 13, fett);
  y -= 28;

  for (const zeile of steuersatzZeilen) {
    schreib(zeile, LINKS, y, 8, normal, GRAU);
    y -= 11;
  }

  if (d.positionen.some((p) => p.istAlternativeZu)) {
    y -= 6;
    schreib(
      "Positionen mit O sind optional und im Gesamtbetrag nicht enthalten. Sagt uns einfach Bescheid, was ihr dazunehmen möchtet.",
      LINKS, y, 8, kursiv, GRAU,
    );
    y -= 14;
  }

  /* Schlusstext */
  y -= 12;
  for (const zeile of umbrechen(d.schlusstext, normal, 9.5, RECHTS - LINKS)) {
    platz(13);
    schreib(zeile, LINKS, y, 9.5);
    y -= 13;
  }

  /* Der Zusageknopf. */
  if (d.link) {
    platz(64);
    y -= 12;
    s.drawRectangle({ x: LINKS, y: y - 26, width: RECHTS - LINKS, height: 48, color: SCHWARZ });
    schreib("Zusagen, Rückfragen stellen oder etwas ändern", LINKS + 16, y + 6, 10.5, fett, WEISS);
    schreib(d.link, LINKS + 16, y - 8, 8, normal, GOLD);
    y -= 40;
  }

  /* ------------------------------------------------------------------
     Letzte Seite: der Abend in Bildern
     ------------------------------------------------------------------ */
  neueSeite();
  y = HOEHE - 90;
  schreib("Darauf könnt ihr euch freuen", LINKS, y, 16, fett);
  y -= 8;
  s.drawRectangle({ x: LINKS, y: y - 4, width: 44, height: 2.5, color: GOLD });
  y -= 26;

  const mitMenuebildern = d.mitMenuebildern !== false;

  for (const zeile of umbrechen(
    mitMenuebildern
      ? "Erst wird gegessen, dann gestaunt. Unsere Küche kocht frisch im Haus, serviert wird an eurem " +
          "Tisch, und wenn das Licht ausgeht, sitzt ihr so nah an der Zauberei, dass ihr die Karten atmen hört."
      : "Erst wird geredet und geknabbert, dann gestaunt. Das Fingerfood kommt frisch aus unserer Küche " +
          "auf die Eventgalerie, und wenn das Licht ausgeht, sitzt ihr so nah an der Zauberei, dass ihr " +
          "die Karten atmen hört.",
    normal, 10, RECHTS - LINKS,
  )) {
    schreib(zeile, LINKS, y, 10, normal, GRAU);
    y -= 14;
  }
  y -= 14;

  const essen: Array<[string, string]> = [
    ["suppe.jpg", "Der Auftakt"],
    ["salat.jpg", "Frisch aus der Küche"],
    ["hauptgang.jpg", "Magic Menü Classic"],
    ["fisch.jpg", "Magic Menü Sea"],
    ["veggy.jpg", "Magic Menü Veggy"],
    ["nachtisch.jpg", "Zum Schluss"],
  ];
  const kachelB = (RECHTS - LINKS - 2 * 12) / 3;
  const kachelH = 94;
  if (mitMenuebildern) {
    for (let i = 0; i < essen.length; i++) {
      const x = LINKS + (i % 3) * (kachelB + 12);
      const oben = y - Math.floor(i / 3) * (kachelH + 28);
      fuellen(s, await bild(essen[i][0]), { x, y: oben - kachelH, w: kachelB, h: kachelH });
      schreib(essen[i][1], x, oben - kachelH - 13, 8.5, fett, GRAU);
    }
    y -= 2 * (kachelH + 28) + 8;
  }

  const grossB = (RECHTS - LINKS - 12) / 2;
  // Beide Bilder haben dasselbe Format, deshalb dieselbe Hoehe. Mehr
  // Platz brachte nur Luft, weil sie eingepasst werden.
  const grossH = 128;
  const paare: Array<[string, string, string]> = [
    ["show.jpg", "ULMfassbar by Florian Zimmer", "Große Zauberkunst, live und hautnah."],
    ["loge.jpg", "Beste Plätze", "Eigener Tisch, freier Blick zur Bühne."],
  ];
  for (let i = 0; i < paare.length; i++) {
    const x = LINKS + i * (grossB + 12);
    fuellen(s, await bild(paare[i][0]), { x, y: y - grossH, w: grossB, h: grossH });
    schreib(paare[i][1], x, y - grossH - 15, 10, fett);
    schreib(paare[i][2], x, y - grossH - 27, 8.5, normal, GRAU);
  }
  y -= grossH + 52;

  mittig("Wir freuen uns auf euch.", y, 13, kursiv, GOLD);
  y -= 8;

  // Die eigene Unterschrift darunter. Ein Angebot ueber zwanzigtausend
  // Euro ist eine persoenliche Sache.
  const unterschrift = await bild("unterschrift.png").catch(() => null);
  if (unterschrift) {
    const h = 34;
    const b = (unterschrift.width * h) / unterschrift.height;
    s.drawImage(unterschrift, { x: (BREITE - b) / 2, y: y - h, width: b, height: h });
    y -= h + 6;
  }
  // Der Name nur, wenn die Unterschrift fehlt. Beides zusammen ist
  // doppelt gemoppelt.
  if (!unterschrift) mittig(d.absender.geschaeftsfuehrer ?? "Florian Zimmer", y, 9.5, normal, GRAU);

  /* ------------------------------------------------------------------
     Fußzeile auf jeder Seite, erst am Ende: vorher steht die Seitenzahl
     nicht fest.
     ------------------------------------------------------------------ */
  const a = d.absender;
  const spalte1 = [a.firma, a.strasse, `${a.plz} ${a.ort}`, `Tel.: ${a.telefon}`, a.email, a.web];
  const spalte2 = [
    a.ustId ? `USt-IdNr.: ${a.ustId}` : "",
    a.steuernummer ? `Steuernummer: ${a.steuernummer}` : "",
    a.registergericht ? `Handelsregister: ${a.registergericht}` : "",
    a.sitz ? `Sitz der Gesellschaft: ${a.sitz}` : "",
    a.geschaeftsfuehrer ? `Geschäftsführer: ${a.geschaeftsfuehrer}` : "",
  ].filter(Boolean);
  // Die IBAN in Viererbloecken, wie auf der Bankkarte. Am Stueck ist sie
  // zum Abtippen kaum zu gebrauchen.
  const ibanLesbar = (iban: string) =>
    iban.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1 ").trim();
  const spalte3 = [
    a.bank ?? "",
    a.iban ? `IBAN: ${ibanLesbar(a.iban)}` : "",
    a.bic ? `BIC: ${a.bic}` : "",
  ].filter(Boolean);

  seiten.forEach((seite, i) => {
    seite.drawLine({ start: { x: LINKS, y: 96 }, end: { x: RECHTS, y: 96 }, thickness: 0.5, color: LINIE });
    let yy = 86;
    const spalte = (werte: string[], x: number) => {
      let yyy = yy;
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
