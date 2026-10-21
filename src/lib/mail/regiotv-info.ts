/**
 * Die Info-Mail an alle Gaeste mit RegioTV-Tickets (Florian, 22.10.2026).
 *
 * Zwei Dinge: Die Aufzeichnung beginnt schon um 19:30 Uhr (in der Bestaetigung steht 20:00), und die Menues, die beim
 * Kauf noch nicht buchbar waren, lassen sich jetzt zum Ticket dazubuchen. Wer schon ein Menue hat, bekommt nur den
 * Hinweis auf 19:30 Uhr, ohne Menue-Absatz und ohne Knopf.
 *
 * Aufbau und Farben wie die Vorfreude-Mail (vorfreude.ts). Der Knopf fuehrt auf die persoenliche Seite im Shop.
 */

import type { ShopBuchung } from "@/lib/db/shop-buchungen";
import { vorname } from "@/lib/mail/vorfreude";

const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

const SCHWARZ = "#080808";
const FLAECHE = "#111111";
const GOLD = "#C9A84C";
const GOLD_HELL = "#E3C46F";
const WEISS = "#FFFFFF";
const LEISE = "#9A9A9A";
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Der Showtag, um den es geht. */
export const REGIOTV_TAG = "2026-12-01";

const NL = String.fromCharCode(10);

const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function hatMenue(b: ShopBuchung): boolean {
  return b.posten.some((p) => p.gruppe === "menue" && p.anzahl > 0);
}

export function baueRegioTvInfo(buchung: ShopBuchung): { betreff: string; text: string; html: string; mitMenue: boolean } {
  const link = `${SHOP}/upgrade/${buchung.zugangToken}`;
  const abmelden = `${SHOP}/abmelden/${buchung.zugangToken}`;
  const vn = vorname(buchung.name);
  const anrede = vn ? `Hallo ${vn},` : "Hallo,";
  const menueOffen = !hatMenue(buchung);

  const betreff = menueOffen
    ? "RegioTV Jahresrückblick: Die Aufzeichnung beginnt schon um 19:30 Uhr, dazu dein Menü"
    : "RegioTV Jahresrückblick: Die Aufzeichnung beginnt schon um 19:30 Uhr";

  const T = {
    ein: "du hast Tickets für den RegioTV Jahresrückblick am Dienstag, 1. Dezember. Zwei Dinge möchten wir dir direkt sagen.",
    zeit: "Die Aufzeichnung beginnt bereits um 19:30 Uhr. In deiner Bestätigung steht noch 20:00 Uhr. Bitte plane deine Anreise mit 19:30 Uhr.",
    menue1:
      "Als du gebucht hast, waren die Menüs für diesen Abend noch nicht buchbar. Das holen wir jetzt nach: Du kannst das Magic Menü jetzt zu deinem Ticket dazubuchen. Es gehört zu diesem Abend dazu: erst Fine Dine bei uns im Haus, dann die Aufzeichnung.",
    menue2:
      "Bei uns kocht Osman Kavak (Magicuisine) vier Gänge, ab 17:30 Uhr, in Ruhe und ohne Zeitdruck. Der Welcome Drink ist im Menü enthalten. Danach musst du nur aufstehen und dich in den Saal setzen, ohne Restaurantwechsel und ohne zweite Parkplatzsuche.",
    menue3: "Menüs gibt es nur für Gäste des Abends, und am Abend selbst können wir leider keines mehr dazunehmen.",
    gebucht: "Was du gebucht hast, siehst du jederzeit auf deiner persönlichen Seite.",
    gruss: "Wir freuen uns auf euch.",
  };

  const text = [
    anrede,
    "",
    T.ein,
    "",
    T.zeit,
    ...(menueOffen
      ? ["", T.menue1, "", T.menue2, "", T.menue3, "", "Menü zu deinem Ticket buchen:", link]
      : ["", T.gebucht, link]),
    "",
    T.gruss,
    "Florian Zimmer Theater",
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
  ].join(NL);

  const absatz = (inhalt: string, extra = "") =>
    `<p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:1.65;color:#D8D8D8;${extra}">${inhalt}</p>`;
  const fett = (s: string) => `<strong style="color:${WEISS};font-weight:600;">${s}</strong>`;

  const knopf = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 26px;">
    <tr><td align="center" bgcolor="${GOLD}" style="border-radius:6px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="${h(link)}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="12%" strokecolor="${GOLD}" fillcolor="${GOLD}">
        <w:anchorlock/>
        <center style="color:${SCHWARZ};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Menü zu meinem Ticket buchen</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${h(link)}" style="display:inline-block;padding:16px 34px;font-family:${SANS};font-size:16px;font-weight:700;color:${SCHWARZ};text-decoration:none;border-radius:6px;background-color:${GOLD};letter-spacing:0.01em;">Menü zu meinem Ticket buchen</a>
      <!--<![endif]-->
    </td></tr>
  </table>`;

  const inhalt = menueOffen
    ? absatz(
        `Als du gebucht hast, waren die ${fett("Menüs")} für diesen Abend noch nicht buchbar. Das holen wir jetzt nach: Du kannst das Magic Menü jetzt ${fett("zu deinem Ticket dazubuchen")}. Es gehört zu diesem Abend dazu: erst Fine Dine bei uns im Haus, dann die Aufzeichnung.`,
      ) +
      absatz(
        `Bei uns kocht ${fett("Osman Kavak")} (Magicuisine) vier Gänge, ${fett("ab 17:30 Uhr")}, in Ruhe und ohne Zeitdruck. Der Welcome Drink ist im Menü enthalten. Danach musst du nur aufstehen und dich in den Saal setzen, ohne Restaurantwechsel und ohne zweite Parkplatzsuche.`,
      ) +
      absatz(h(T.menue3), "font-size:15px;color:#B4B4B4;")
    : absatz(h(T.gebucht));

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>RegioTV Jahresrückblick</title>
<style type="text/css">
  body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
  a { color:${GOLD_HELL}; }
  :root { color-scheme: dark; supported-color-schemes: dark; }
  @media only screen and (max-width:480px) {
    .rahmen { width:100% !important; }
    .polster { padding-left:22px !important; padding-right:22px !important; }
    .ueberschrift { font-size:26px !important; line-height:1.25 !important; }
    .logo { width:150px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${SCHWARZ};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Die Aufzeichnung beginnt schon um 19:30 Uhr.&#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SCHWARZ}" style="background-color:${SCHWARZ};">
<tr><td align="center" bgcolor="${SCHWARZ}" style="background-color:${SCHWARZ};padding:28px 12px 40px;">

  <table role="presentation" class="rahmen" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${FLAECHE}" style="width:600px;max-width:600px;background-color:${FLAECHE};border:1px solid rgba(201,168,76,0.22);border-radius:10px;">

    <tr><td align="center" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:38px 24px 24px;">
      <img class="logo" src="${SHOP}/images/logo.png" width="180" alt="Florian Zimmer Theater"
           style="width:180px;max-width:70%;height:auto;margin:0 auto;" />
      <div style="margin-top:12px;font-family:${SANS};font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:${GOLD};">Home of Magic</div>
    </td></tr>

    <tr><td align="center" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td height="1" width="56" bgcolor="${GOLD}" style="background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td align="center" class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:26px 40px 4px;">
      <h1 class="ueberschrift" style="margin:0;font-family:${SERIF};font-size:31px;line-height:1.22;font-weight:400;color:${WEISS};">
        RegioTV Jahresrückblick<br />Aufzeichnung ab 19:30 Uhr
      </h1>
    </td></tr>

    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:26px 40px 0;">
      ${absatz(h(anrede), "color:" + WEISS + ";font-size:17px;")}
      ${absatz(h(T.ein))}
      ${absatz(`${fett("Die Aufzeichnung beginnt bereits um 19:30 Uhr.")} In deiner Bestätigung steht noch 20:00 Uhr. Bitte plane deine Anreise mit 19:30 Uhr.`)}
      ${inhalt}
    </td></tr>

    ${menueOffen ? `<tr><td align="center" class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:8px 40px 0;">${knopf}</td></tr>` : ""}

    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 40px 8px;">
      ${absatz(h(T.gruss))}
      <p style="margin:0 0 30px;font-family:${SERIF};font-size:23px;line-height:1.3;color:${GOLD_HELL};">Florian Zimmer Theater</p>
    </td></tr>

    <tr><td bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" bgcolor="#262626" style="background-color:#262626;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>
    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:20px 40px 34px;">
      <p style="margin:0 0 14px;font-family:${SANS};font-size:12px;line-height:1.6;color:${LEISE};">
        Du erhältst diese E-Mail, weil du Tickets bei uns gekauft hast. Wenn du keine Hinweise
        dieser Art mehr erhalten möchtest, kannst du dich hier
        <a href="${h(abmelden)}" style="color:${LEISE};text-decoration:underline;">abmelden</a>.
      </p>
      <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.7;color:${LEISE};">
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

  return { betreff, text, html, mitMenue: menueOffen };
}
