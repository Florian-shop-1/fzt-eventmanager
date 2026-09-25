/**
 * Die Bewertungsmail, am Morgen nach der Show.
 *
 * Aufbau und Gestaltung wie die Vorfreude-Mail (vorfreude.ts): tabellenbasiert,
 * Stile an den Elementen, Hintergrund an jeder Zelle, damit sie auch
 * weitergeleitet lesbar bleibt. Die Begründungen stehen dort und gelten hier
 * genauso.
 *
 * Der Kern sind fünf Sterne. Jeder ist ein eigener Link auf die Seite im Shop,
 * mit dem persönlichen Schlüssel der Buchung. Was danach passiert, entscheidet
 * die Seite: ab 4 Sternen Google und Tripadvisor, bis 3 Sterne ein Textfeld.
 *
 * Zeitpunkt: Am Tag nach der Show um 10 Uhr. Der Abend ist noch frisch, der
 * Gast ist wach, und morgens werden Mails am häufigsten geöffnet. Am selben
 * Abend wäre zu früh, die meisten sind dann noch unterwegs oder schon im Bett.
 *
 * Rechtlich wie die Vorfreude-Mail: Werbung an Bestandskunden nach § 7 Abs. 3
 * UWG, deshalb in jeder Mail der Abmeldeweg. Wer der Vorfreude-Mail schon
 * widersprochen hat, bekommt auch diese nicht.
 */

import type { ShopBuchung } from "@/lib/db/shop-buchungen";
import { vorname } from "@/lib/mail/vorfreude";

const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

const NL = String.fromCharCode(10);

const SCHWARZ = "#080808";
const FLAECHE = "#111111";
const GOLD = "#C9A84C";
const GOLD_HELL = "#E3C46F";
const WEISS = "#FFFFFF";
const LEISE = "#9A9A9A";

/** Was verlost wird. Steht in Mail und auf der Danke-Seite gleich. */
export const VERLOSUNG =
  "Unter allen, die uns bewerten, verlosen wir jeden Monat 2 × 2 Freikarten für die große Zaubershow ULMFASSBAR by Florian Zimmer, inklusive Magic Menü vor der Show.";

export interface Bewertungsmail {
  betreff: string;
  text: string;
  html: string;
}

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * "Abend" oder "Nachmittag", je nach Beginn der Show. Mittagsshows (Schnupper
 * Magic, Silvester-Matinee) beginnen vor 17 Uhr, da wäre "Abend" falsch.
 * Ohne Uhrzeit bleibt es beim Abend, das ist der Normalfall.
 */
export function tageszeit(uhrzeit: string | null | undefined): "Abend" | "Nachmittag" {
  const stunde = Number(/^(\d{1,2}):/.exec(uhrzeit ?? "")?.[1]);
  return Number.isFinite(stunde) && stunde < 17 ? "Nachmittag" : "Abend";
}

/** "gestern", wenn die Mail wie geplant am Folgetag rausgeht, sonst das Datum. */
function wannWarDerAbend(datum: string, zeit: string, heute = new Date()): string {
  const gestern = new Date(heute);
  gestern.setDate(gestern.getDate() - 1);
  const isoGestern = gestern.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  if (datum === isoGestern) return `gestern ${zeit}`;
  return (
    "am " +
    new Date(`${datum}T12:00:00`).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Berlin",
    })
  );
}

export function sterneLink(token: string, sterne: number): string {
  return `${SHOP}/bewertung/${token}?sterne=${sterne}`;
}

export function baueBewertungsmail(buchung: ShopBuchung, heute = new Date()): Bewertungsmail {
  const vn = vorname(buchung.name);
  const anrede = vn ? `Hallo ${vn},` : "Hallo,";
  const zeit = tageszeit(buchung.uhrzeit);
  const wann = wannWarDerAbend(buchung.datum, zeit, heute);
  const abmelden = `${SHOP}/abmelden/${buchung.zugangToken}`;

  // Wortlaut von Florian, 23.09.2026. Bewusst übernommen wie diktiert: die
  // Frage im Betreff, die Bitte als eigener Satz, kein "sag es zuerst uns"
  // mehr. Wer wenige Sterne gibt, landet ohnehin im Textfeld statt bei Google.
  const betreff = `Wie hat dir dein ${zeit} bei uns gefallen?`;

  const text = [
    anrede,
    "",
    `${wann[0].toUpperCase() + wann.slice(1)} warst du bei uns im Theater und ich hoffe, du bist mit`,
    "vielen schönen und magischen Momenten nach Hause gegangen. ✨",
    "",
    "Darf ich dich um einen kleinen Gefallen bitten?",
    "",
    `Sag uns, wie dir dein ${zeit} gefallen hat. Jede Show entsteht mit viel`,
    "Leidenschaft und Liebe zum Detail und deine Rückmeldung bedeutet meinem",
    "Team und mir sehr viel.",
    "",
    `Wie viele Sterne gibst du deinem ${zeit} bei uns? Ein Klick genügt:`,
    "",
    ...[5, 4, 3, 2, 1].map((s) => `${"★".repeat(s)}${"☆".repeat(5 - s)}  ${sterneLink(buchung.zugangToken, s)}`),
    "",
    VERLOSUNG,
    "",
    "Danke, dass du da warst!",
    "",
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
  ].join(NL);

  return { betreff, text, html: baueHtml({ anrede, wann, zeit, token: buchung.zugangToken, abmelden }) };
}

function baueHtml(d: { anrede: string; wann: string; zeit: string; token: string; abmelden: string }): string {
  const serif = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  const absatz = (inhalt: string, extra = "") =>
    `<p style="margin:0 0 18px;font-family:${sans};font-size:16px;line-height:1.65;color:#D8D8D8;${extra}">${inhalt}</p>`;

  /*
    Die Sterne.

    Fünf einzelne Zellen, jede ein Link. Von links nach rechts eins bis fünf,
    wie man es von überall kennt. Die Sterne stehen als Schriftzeichen da und
    nicht als Bild: Bilder sind in vielen Mailprogrammen erst nach einem Klick
    sichtbar, und fünf leere Kästchen wären genau das Gegenteil von einladend.
    Unter jedem Stern die Zahl, damit auch ohne Sternschrift klar ist, was
    man wählt.
  */
  const stern = (s: number) => `
      <td align="center" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 3px;">
        <a href="${h(sterneLink(d.token, s))}" style="display:block;text-decoration:none;width:56px;padding:10px 0 8px;border:1px solid rgba(201,168,76,0.35);border-radius:8px;background-color:#191919;">
          <span style="display:block;font-family:Arial,sans-serif;font-size:30px;line-height:1;color:${GOLD};">&#9733;</span>
          <span style="display:block;margin-top:6px;font-family:${sans};font-size:12px;color:${LEISE};">${s}</span>
        </a>
      </td>`;

  const sterne = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:4px auto 10px;">
    <tr>${[1, 2, 3, 4, 5].map(stern).join("")}</tr>
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="310" style="width:310px;margin:0 auto 26px;">
    <tr>
      <td align="left" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};font-family:${sans};font-size:11px;color:${LEISE};">nicht gut</td>
      <td align="right" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};font-family:${sans};font-size:11px;color:${LEISE};">magisch</td>
    </tr>
  </table>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>Wie war dein ${d.zeit} bei uns?</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Ein Klick genügt, und du hilfst uns enorm.&#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279; &#8199;&#65279;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SCHWARZ}" style="background-color:${SCHWARZ};">
<tr><td align="center" bgcolor="${SCHWARZ}" style="background-color:${SCHWARZ};padding:28px 12px 40px;">

  <table role="presentation" class="rahmen" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${FLAECHE}" style="width:600px;max-width:600px;background-color:${FLAECHE};border:1px solid rgba(201,168,76,0.22);border-radius:10px;">

    <tr><td align="center" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:38px 24px 24px;">
      <img class="logo" src="${SHOP}/images/logo.png" width="180" alt="Florian Zimmer Theater" style="width:180px;max-width:70%;height:auto;margin:0 auto;" />
      <div style="margin-top:12px;font-family:${sans};font-size:10px;letter-spacing:0.34em;text-transform:uppercase;color:${GOLD};">Home of Magic</div>
    </td></tr>

    <tr><td align="center" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td height="1" width="56" bgcolor="${GOLD}" style="background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td align="center" class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:26px 40px 4px;">
      <h1 class="ueberschrift" style="margin:0;font-family:${serif};font-size:31px;line-height:1.22;font-weight:400;color:${WEISS};">
        Wie war dein<br />magischer ${d.zeit}?
      </h1>
    </td></tr>

    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:26px 40px 0;">
      ${absatz(h(d.anrede), "color:" + WEISS + ";font-size:17px;")}
      ${absatz(`${h(d.wann[0].toUpperCase() + d.wann.slice(1))} warst du bei uns im Theater und ich hoffe, du bist mit vielen schönen und magischen Momenten nach Hause gegangen. &#10024;`)}
      ${absatz("Darf ich dich um einen kleinen Gefallen bitten?")}
      ${absatz(`Sag uns, wie dir dein ${h(d.zeit)} gefallen hat. Jede Show entsteht mit viel Leidenschaft und Liebe zum Detail und deine Rückmeldung bedeutet <strong style="color:${WEISS};font-weight:600;">meinem Team und mir</strong> sehr viel.`)}
    </td></tr>

    <tr><td align="center" class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:4px 40px 0;">
      <div style="margin:0 0 14px;font-family:${serif};font-size:20px;line-height:1.3;color:${WEISS};">Wie viele Sterne gibst du deinem ${d.zeit}?</div>
      ${sterne}
    </td></tr>

    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 40px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#191919;border-left:3px solid ${GOLD};border-radius:0 8px 8px 0;margin:0 0 26px;">
        <tr><td bgcolor="#191919" style="background-color:#191919;padding:16px 20px;">
          <div style="font-family:${sans};font-size:10px;letter-spacing:0.26em;text-transform:uppercase;color:${GOLD};">Jeden Monat</div>
          <p style="margin:8px 0 0;font-family:${sans};font-size:14.5px;line-height:1.6;color:#C4C4C4;">${h(VERLOSUNG)}</p>
        </td></tr>
      </table>
      ${absatz("Danke, dass du da warst!")}
      <p style="margin:0 0 30px;font-family:${serif};font-size:23px;line-height:1.3;color:${GOLD_HELL};">Florian</p>
    </td></tr>

    <tr><td bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" style="background-color:#262626;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>
    <tr><td class="polster" bgcolor="${FLAECHE}" style="background-color:${FLAECHE};padding:20px 40px 34px;">
      <p style="margin:0 0 14px;font-family:${sans};font-size:12px;line-height:1.6;color:${LEISE};">
        Du erhältst diese E-Mail, weil du Tickets bei uns gekauft hast. Wenn du keine Hinweise
        dieser Art mehr erhalten möchtest, kannst du dich hier
        <a href="${h(d.abmelden)}" style="color:${LEISE};text-decoration:underline;">abmelden</a>.
        Teilnahmebedingungen zur Verlosung: <a href="${SHOP}/bewertung/teilnahmebedingungen" style="color:${LEISE};text-decoration:underline;">hier</a>.
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
