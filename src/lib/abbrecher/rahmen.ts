/**
 * Der Rahmen für die Abbrecher-Mails, im Stil der Bewertungsmail.
 *
 * Schwarz, Gold, Serifenschrift, Logo oben, ein großer Knopf: Dieselbe
 * Handschrift wie die Mail nach der Show (mail/bewertung.ts). Tabellen und
 * Stile an den Elementen, damit es auch in Outlook und beim Weiterleiten
 * hält, siehe die Begründungen dort.
 *
 * Zum Countdown, weil die Frage berechtigt war (Florian, 23.09.2026):
 *
 * In einer E-Mail läuft kein Javascript. Eine wirklich tickende Uhr gibt
 * es dort nicht, und jeder, der etwas anderes verspricht, schickt in
 * Wahrheit ein Bild. Drei Wege, alle mit Haken:
 *
 *  1. Bild, das der Server beim Öffnen malt. Sieht live aus, friert aber
 *     ein, sobald ein Mailprogramm es zwischenspeichert. Apples
 *     Mail-Datenschutz lädt Bilder sogar schon beim Zustellen, dort stünde
 *     für immer "24 Stunden".
 *  2. Animiertes GIF. Tickt echt, aber nur die ersten Sekunden, danach
 *     steht es. Und es friert genauso ein.
 *  3. Die Uhrzeit ausschreiben. Nie falsch, sieht aber nach nichts aus.
 *
 * Deshalb hier alle drei Ebenen zusammen, jede fängt die Schwäche der
 * anderen auf:
 *  - im Deckblatt der Mail das gemalte Bild mit der Restzeit (sieht gut
 *    aus, stimmt beim ersten Öffnen),
 *  - darunter die ausgeschriebene Uhrzeit als Text (stimmt immer, auch
 *    wenn Bilder blockiert sind),
 *  - und der Knopf führt auf eine Seite, auf der die Uhr wirklich läuft,
 *    Sekunde für Sekunde. Dort entscheidet sich der Kauf, nicht im
 *    Posteingang.
 */

const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

export const SCHWARZ = "#080808";
export const FLAECHE = "#111111";
export const GOLD = "#C9A84C";
export const GOLD_HELL = "#E3C46F";
export const WEISS = "#FFFFFF";
export const LEISE = "#9A9A9A";

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function absatz(inhalt: string, extra = ""): string {
  return `<p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:1.65;color:#D8D8D8;${extra}">${inhalt}</p>`;
}

/** Der große goldene Knopf. */
export function knopf(text: string, link: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 4px">
  <tr><td align="center" bgcolor="${GOLD}" style="background-color:${GOLD};border-radius:8px;">
    <a href="${h(link)}" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:16px;font-weight:700;color:#141414;text-decoration:none;">${h(text)}</a>
  </td></tr></table>`;
}

/** Ein Kasten mit goldenem Rand, für das Geschenk oder den Countdown. */
export function kasten(inhalt: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#191919;border:1px solid rgba(201,168,76,0.35);border-radius:10px;margin:0 0 22px;">
  <tr><td align="center" style="background-color:#191919;padding:20px 18px;">${inhalt}</td></tr></table>`;
}

export function ueberschrift(zeilen: string): string {
  return `<h1 class="ueberschrift" style="margin:0;font-family:${SERIF};font-size:31px;line-height:1.22;font-weight:400;color:${WEISS};">${zeilen}</h1>`;
}

export function klein(text: string): string {
  return `<div style="font-family:${SANS};font-size:10px;letter-spacing:0.26em;text-transform:uppercase;color:${GOLD};">${h(text)}</div>`;
}

/**
 * Das Gerüst einer Mail.
 *
 * "vorschau" ist die Zeile, die viele Mailprogramme neben dem Betreff
 * anzeigen, bevor jemand öffnet. Ohne sie steht dort der Anfang des
 * Textes, und das ist selten die beste Werbung für die Mail.
 */
export function mailRahmen(d: {
  titel: string;
  vorschau: string;
  ueberschrift: string;
  inhalt: string;
  fuss: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${h(d.titel)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${h(d.vorschau)}&#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SCHWARZ}" style="background-color:${SCHWARZ};">
<tr><td align="center" bgcolor="${SCHWARZ}" style="background-color:${SCHWARZ};padding:28px 12px 40px;">

  <table role="presentation" class="rahmen" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${FLAECHE}" style="width:600px;max-width:600px;background-color:${FLAECHE};border:1px solid rgba(201,168,76,0.22);border-radius:10px;">

    <tr><td align="center" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:38px 24px 24px;">
      <img class="logo" src="${SHOP}/images/logo.png" width="180" alt="Florian Zimmer Theater" style="width:180px;max-width:70%;height:auto;margin:0 auto;" />
      <div style="margin-top:12px;font-family:${SANS};font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:${GOLD};">Home of Magic</div>
    </td></tr>

    <tr><td align="center" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td height="1" width="56" bgcolor="${GOLD}" style="background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td align="center" class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:26px 40px 4px;">
      ${d.ueberschrift}
    </td></tr>

    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:26px 40px 0;">
      ${d.inhalt}
    </td></tr>

    <tr><td bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" style="background-color:#262626;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:20px 40px 34px;">
      <p style="margin:0 0 14px;font-family:${SANS};font-size:12px;line-height:1.6;color:${LEISE};">${d.fuss}</p>
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
}
