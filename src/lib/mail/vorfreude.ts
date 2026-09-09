/**
 * Die Vorfreude-Mail, wenige Tage vor der Show.
 *
 * Der Gast hat seine Karten. Diese Mail erinnert ihn an den Abend und führt
 * ihn auf seine persönliche Seite, auf der er sehen kann, was er gebucht hat
 * und was noch dazukommen könnte.
 *
 * Sie geht in zwei Fassungen raus, beide aus demselben Baustein:
 *
 *  - HTML, tabellenbasiert und mit Inline-Stilen. Das ist in Mailprogrammen
 *    kein Geschmack, sondern Notwendigkeit: Outlook rendert mit der
 *    Word-Engine, kennt kein Flexbox, kein Grid und keine eingebetteten
 *    Stylesheets zuverlässig. Der Knopf ist deshalb zusätzlich als VML
 *    hinterlegt, sonst wäre er dort nur ein Stück Text.
 *  - Reiner Text als zweite Fassung. Nicht jedes Programm zeigt HTML, und
 *    wer sich die Rohfassung ansieht, soll den Link vollständig lesen können.
 *
 * Was NICHT im Text steht, ist Absicht: kein Preis, kein Rabatt, keine Frist.
 * Wer schon gekauft hat, muss nicht überredet werden. Was etwas kostet, steht
 * auf der Seite.
 *
 * Rechtlich: Die Mail geht an Menschen, die bei uns gekauft haben, und bietet
 * eigene ähnliche Ware zum selben Abend an. Das erlaubt § 7 Abs. 3 UWG, wenn
 * in JEDER Mail auf den Widerspruch hingewiesen wird. Deshalb steht der
 * Abmeldeweg unten nicht zur Auswahl, sondern immer.
 */

import type { ShopBuchung } from "@/lib/db/shop-buchungen";
import type { Leistungsgruppe } from "@/lib/shop/zusatzleistungen";
import { VORLAUF_TAGE } from "@/lib/mail/vorlauf";

const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

const NL = String.fromCharCode(10);
const z = (...zeilen: string[]) => zeilen.join(NL);

export interface Vorfreudemail {
  betreff: string;
  /** Reiner Text, Pflichtfassung. */
  text: string;
  /** Fassung mit Formatierung. */
  html: string;
  /** Was die Mail anspricht. Für die Übersicht im Programm. */
  angeboten: string[];
  /** Der Vorname, mit dem angeredet wird. Leer, wenn keiner bekannt ist. */
  vorname: string;
}

// ─── Bausteine, die Text und HTML gemeinsam nutzen ───

/**
 * Der Vorname aus dem, was wir haben.
 *
 * Ditix und Formulare liefern den Namen in unterschiedlicher Form. Abgedeckt
 * sind die Fälle, die im Alltag vorkommen:
 *
 *   "Florian Zimmer"        -> Florian
 *   "Zimmer, Florian"       -> Florian   (Nachname zuerst, mit Komma)
 *   "Dr. Florian Zimmer"    -> Florian   (Titel wird übersprungen)
 *   "florian zimmer"        -> Florian   (Großschreibung wird hergestellt)
 *   "Florian"               -> Florian
 *   ""                      -> ""        (dann grüßt die Mail ohne Namen)
 *
 * Bewusst zurückhaltend: Im Zweifel lieber kein Name als ein falscher. Eine
 * Anrede mit dem Nachnamen oder mit einem Titel wäre schlimmer als "Hallo,".
 */
const TITEL = /^(dr|prof|dipl|mag|ing|med|rer|nat|phil|h\.?c)\.?$/i;

export function vorname(name: string | null | undefined): string {
  const roh = (name ?? "").replace(/\s+/g, " ").trim();
  if (!roh) return "";

  // "Zimmer, Florian": Was hinter dem Komma steht, ist der Vorname.
  const teile = roh.includes(",")
    ? roh.split(",")[1]?.trim().split(" ") ?? []
    : roh.split(" ");

  const erstes = teile.map((t) => t.trim()).find((t) => t && !TITEL.test(t));
  if (!erstes) return "";

  // Firmen und Sammeladressen sind keine Vornamen. Geprueft wird der ganze
  // Eintrag, nicht nur das erste Wort: Bei "Musterfirma GmbH" steht der
  // verraeterische Teil hinten.
  if (/\b(gmbh|mbh|ag|e\.?\s?v\.?|ug|kg|ohg|gbr|team|buero|büro|info|office|verwaltung)\b/i.test(roh)) {
    return "";
  }
  // Etwas, das nur aus Zeichen oder Ziffern besteht, ebenfalls nicht.
  if (!/[a-zäöüß]/i.test(erstes)) return "";

  // "florian" -> "Florian", "FLORIAN" -> "Florian". Bindestrichnamen behalten
  // beide Großbuchstaben: "hans-peter" -> "Hans-Peter".
  return erstes
    .toLowerCase()
    .split("-")
    .map((t) => (t ? t[0].toUpperCase() + t.slice(1) : t))
    .join("-");
}

/** "Donnerstag, 3. Dezember" */
function tagLang(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  });
}

/** "20 Uhr" statt "20:00 Uhr". In einem Satz liest sich das besser. */
function stunde(uhrzeit: string | null): string {
  if (!uhrzeit) return "";
  const [h, m] = uhrzeit.split(":");
  if (!h) return "";
  return m && m !== "00" ? `${h}:${m} Uhr` : `${Number(h)} Uhr`;
}

/**
 * Die Vorlaufzeit ausgeschrieben: "fünf Tagen".
 *
 * Als Wort im Fliesstext, als Ziffer in der Betreffzeile. Im Satz liest sich
 * "in fünf Tagen" wie von einem Menschen geschrieben, im Posteingang fällt
 * "In 5 Tagen" schneller ins Auge.
 */
function vorlaufWort(): string {
  const worte: Record<number, string> = {
    1: "einem Tag", 2: "zwei Tagen", 3: "drei Tagen", 4: "vier Tagen",
    5: "fünf Tagen", 6: "sechs Tagen", 7: "einer Woche",
  };
  return worte[VORLAUF_TAGE] ?? `${VORLAUF_TAGE} Tagen`;
}

function hatGruppe(buchung: ShopBuchung, gruppe: string): boolean {
  return buchung.posten.some((p) => p.gruppe === gruppe && p.anzahl > 0);
}

/** Für den HTML-Teil: alles, was aus Daten kommt, wird maskiert. */
function h(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Farben, aus dem Erscheinungsbild des Shops ───
const SCHWARZ = "#080808";
const FLAECHE = "#111111";
const GOLD = "#C9A84C";
const GOLD_HELL = "#E3C46F";
const WEISS = "#FFFFFF";
const LEISE = "#9A9A9A";

/**
 * Baut die Mail zu einer Buchung.
 *
 * Gibt auch dann eine Mail zurück, wenn es nichts anzubieten gibt. Der Gast
 * bekommt dann eine reine Erinnerung ohne Knopf, und das ist richtig so: Wer
 * alles gebucht hat, ist unser bester Gast und soll nicht ausgerechnet der
 * sein, von dem wir uns vorher nicht melden.
 */
export function baueVorfreudemail(
  buchung: ShopBuchung,
  /**
   * Was es an diesem Abend überhaupt gibt. Ohne diese Angabe wird nichts
   * angeboten, siehe zusatzleistungen.ts. Nicht an jedem Abend kocht die
   * Magicuisine; bei Schnupper-Magic oder dem RegioTV-Jahresrückblick auf
   * Extras hinzuweisen, die es nicht gibt, wäre schlimmer als gar keine Mail.
   */
  verfuegbar: Set<Leistungsgruppe> = new Set(),
): Vorfreudemail {
  const link = `${SHOP}/upgrade/${buchung.zugangToken}`;
  const abmelden = `${SHOP}/abmelden/${buchung.zugangToken}`;

  const wann = stunde(buchung.uhrzeit);
  // Mit Komma vor der Uhrzeit: "Donnerstag, 3. Dezember, um 20 Uhr".
  const termin = wann ? `${tagLang(buchung.datum)}, um ${wann}` : tagLang(buchung.datum);
  const wochentag = new Date(`${buchung.datum}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    timeZone: "Europe/Berlin",
  });

  const vn = vorname(buchung.name);
  const anrede = vn ? `Hallo ${vn},` : "Hallo,";

  // Was fehlt und an diesem Abend auch wirklich zu haben ist. Steuert, ob der
  // Hinweis auf die Extras und der Knopf ueberhaupt erscheinen.
  const angeboten: string[] = [];
  if (verfuegbar.has("menue") && !hatGruppe(buchung, "menue")) angeboten.push("Menü");
  if (verfuegbar.has("vip") && !hatGruppe(buchung, "vip")) angeboten.push("Abend drumherum");
  if (verfuegbar.has("bundle") && !hatGruppe(buchung, "bundle")) angeboten.push("Mitbringsel");
  const etwasOffen = angeboten.length > 0;

  const betreff = vn
    ? `In ${VORLAUF_TAGE} Tagen ist es so weit, ${vn} ✨`
    : `In ${VORLAUF_TAGE} Tagen ist es so weit ✨`;

  // ─── Reiner Text ───

  const textZeilen: string[] = [
    anrede,
    "",
    `in ${vorlaufWort()} ist es so weit: Am ${termin} beginnt dein`,
    "magischer Abend bei uns im Theater.",
  ];

  if (etwasOffen) {
    textZeilen.push(
      "",
      "Vielleicht möchtest du die Vorfreude noch ein bisschen steigern?",
      "Auf deiner persönlichen Seite siehst du, was du bereits gebucht hast",
      "und welche besonderen Extras du deinem Besuch noch hinzufügen kannst.",
      "",
      link,
      "",
      "Deine bestehenden Tickets bleiben natürlich unverändert. Es kommt nur",
      "das hinzu, was du selbst auswählst.",
    );
  } else {
    textZeilen.push(
      "",
      "Was du gebucht hast, siehst du jederzeit auf deiner persönlichen Seite:",
      "",
      link,
    );
  }

  textZeilen.push(
    "",
    "Ich freue mich auf dich!",
    "",
    `Bis ${wochentag}`,
    "Florian",
    "",
    "",
    "--",
    "Du erhältst diese E-Mail, weil du Tickets bei uns gekauft hast. Wenn du",
    "keine Hinweise dieser Art mehr erhalten möchtest, kannst du dich hier",
    "abmelden:",
    abmelden,
    "",
    "Florian Zimmer Theater GmbH",
    "Grethe-Weiser-Str. 2/1 · 89231 Neu-Ulm",
    "Telefon 0731 7906 110 · tickets@florianzimmer.com",
  );

  return {
    betreff,
    text: z(...textZeilen),
    html: baueHtml({ anrede, vorlauf: vorlaufWort(), termin, wochentag, link, abmelden, etwasOffen }),
    angeboten,
    vorname: vn,
  };
}

/**
 * Die HTML-Fassung.
 *
 * Aufbau von aussen nach innen: eine Tabelle als Hintergrund über die volle
 * Breite, darin eine zweite mit fester Maximalbreite und mittig gesetzt. Das
 * ist der einzige Weg, der in Outlook, Gmail und Apple Mail gleich aussieht;
 * margin: 0 auto auf einem div tut es dort nicht.
 *
 * Alle Stile stehen an den Elementen selbst. Gmail entfernt <style>-Blöcke im
 * <head>, und was dort steht, ist im Webmailer verloren. Die wenigen Regeln,
 * die sich nur über eine Medienabfrage ausdrücken lassen (die Schriftgrößen
 * auf dem Handy), stehen zusätzlich im Kopf: Wo sie greifen, verbessern sie
 * das Bild, wo sie fehlen, bleibt es brauchbar.
 */
function baueHtml(d: {
  anrede: string;
  vorlauf: string;
  termin: string;
  wochentag: string;
  link: string;
  abmelden: string;
  etwasOffen: boolean;
}): string {
  const serif = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

  const absatz = (inhalt: string, extra = "") =>
    `<p style="margin:0 0 18px;font-family:${sans};font-size:16px;line-height:1.65;color:#D8D8D8;${extra}">${inhalt}</p>`;

  /*
    Der Knopf.

    Dreifach abgesichert, weil kein Mailprogramm dem anderen gleicht:
      1. VML-Rechteck fuer Outlook auf Windows. Ohne das waere der Knopf dort
         nur blauer, unterstrichener Text.
      2. Eine Tabellenzelle mit Hintergrundfarbe fuer alle uebrigen.
      3. Der Link fuellt die Zelle ueber Innenabstaende aus, damit die ganze
         Flaeche klickbar ist und nicht nur die Schrift.
  */
  const knopf = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 26px;">
    <tr><td align="center" bgcolor="${GOLD}" style="border-radius:6px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="${h(d.link)}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="12%" strokecolor="${GOLD}" fillcolor="${GOLD}">
        <w:anchorlock/>
        <center style="color:${SCHWARZ};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Vorfreude steigern</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${h(d.link)}" style="display:inline-block;padding:16px 34px;font-family:${sans};font-size:16px;font-weight:700;color:${SCHWARZ};text-decoration:none;border-radius:6px;background-color:${GOLD};letter-spacing:0.01em;">Vorfreude steigern&nbsp;✨</a>
      <!--<![endif]-->
    </td></tr>
  </table>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>In ${VORLAUF_TAGE} Tagen sehen wir uns</title>
<style type="text/css">
  /* Outlook auf Windows ersetzt sonst jede Schrift durch Times New Roman. */
  body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
  a { color:${GOLD_HELL}; }
  @media only screen and (max-width:480px) {
    .rahmen { width:100% !important; }
    .polster { padding-left:22px !important; padding-right:22px !important; }
    .ueberschrift { font-size:26px !important; line-height:1.25 !important; }
    .logo { width:150px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${SCHWARZ};">
<!-- Die Vorschauzeile im Posteingang. Danach Leerzeichen, damit das Programm
     nicht den Beginn des Textes anhaengt. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Dein magischer Abend am ${h(d.termin)}.&#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SCHWARZ}" style="background-color:${SCHWARZ};">
<tr><td align="center" style="padding:28px 12px 40px;">

  <table role="presentation" class="rahmen" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${FLAECHE};border:1px solid rgba(201,168,76,0.22);border-radius:10px;">

    <!-- Kopf: Logo mit der Unterzeile -->
    <tr><td align="center" style="padding:38px 24px 24px;">
      <img class="logo" src="${SHOP}/images/logo.png" width="180" alt="Florian Zimmer Theater"
           style="width:180px;max-width:70%;height:auto;margin:0 auto;" />
      <div style="margin-top:12px;font-family:${sans};font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:${GOLD};">Home of Magic</div>
    </td></tr>

    <!-- Goldene Trennlinie -->
    <tr><td align="center" style="padding:0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td height="1" width="56" bgcolor="${GOLD}" style="background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <!-- Ueberschrift -->
    <tr><td align="center" class="polster" style="padding:26px 40px 4px;">
      <h1 class="ueberschrift" style="margin:0;font-family:${serif};font-size:31px;line-height:1.22;font-weight:400;color:${WEISS};">
        In ${h(d.vorlauf)}<br />ist es so weit
      </h1>
    </td></tr>

    <!-- Text -->
    <tr><td class="polster" style="padding:26px 40px 0;">
      ${absatz(h(d.anrede), "color:" + WEISS + ";font-size:17px;")}
      ${absatz(`in <strong style="color:${WEISS};font-weight:600;">${h(d.vorlauf)}</strong> ist es so weit: Am <strong style="color:${WEISS};font-weight:600;">${h(d.termin)}</strong> beginnt dein magischer Abend bei uns im Theater.`)}
      ${
        d.etwasOffen
          ? absatz("Vielleicht möchtest du die Vorfreude noch ein bisschen steigern?") +
            absatz("Auf deiner persönlichen Seite siehst du, was du bereits gebucht hast und welche besonderen Extras du deinem Besuch noch hinzufügen kannst.")
          : absatz("Was du gebucht hast, siehst du jederzeit auf deiner persönlichen Seite.")
      }
    </td></tr>

    <!-- Knopf -->
    <tr><td align="center" class="polster" style="padding:8px 40px 0;">${knopf}</td></tr>

    <!-- Nachsatz und Gruss -->
    <tr><td class="polster" style="padding:0 40px 8px;">
      ${d.etwasOffen ? absatz("Deine bestehenden Tickets bleiben natürlich unverändert. Es kommt nur das hinzu, was du selbst auswählst.", "font-size:15px;color:#B4B4B4;") : ""}
      ${absatz("Ich freue mich auf dich!")}
      <p style="margin:0 0 4px;font-family:${sans};font-size:16px;line-height:1.6;color:#D8D8D8;">Bis ${h(d.wochentag)}</p>
      <p style="margin:0 0 30px;font-family:${serif};font-size:23px;line-height:1.3;color:${GOLD_HELL};">Florian</p>
    </td></tr>

    <!-- Fuss -->
    <tr><td style="padding:0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" bgcolor="rgba(255,255,255,0.10)" style="background-color:#262626;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>
    <tr><td class="polster" style="padding:20px 40px 34px;">
      <p style="margin:0 0 14px;font-family:${sans};font-size:12px;line-height:1.6;color:${LEISE};">
        Du erhältst diese E-Mail, weil du Tickets bei uns gekauft hast. Wenn du keine Hinweise
        dieser Art mehr erhalten möchtest, kannst du dich hier
        <a href="${h(d.abmelden)}" style="color:${LEISE};text-decoration:underline;">abmelden</a>.
      </p>
      <p style="margin:0;font-family:${sans};font-size:12px;line-height:1.7;color:${LEISE};">
        Florian Zimmer Theater GmbH<br />
        Grethe-Weiser-Str. 2/1 &middot; 89231 Neu-Ulm<br />
        Telefon 0731 7906 110 &middot; <a href="mailto:tickets@florianzimmer.com" style="color:${LEISE};text-decoration:underline;">tickets@florianzimmer.com</a>
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}
