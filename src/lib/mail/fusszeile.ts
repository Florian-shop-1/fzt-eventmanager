/**
 * Die Fusszeile unter Mails an Firmenkunden.
 *
 * Inhalt und Reihenfolge hat Florian am 28.10.2026 so vorgegeben:
 * Kevin, Ticketing-Team, Mailadresse, Telefon, danach die beiden
 * Bewertungslinks, zuletzt die Anschrift der GmbH.
 *
 * Sie haengt der Eventmanager selbst an, einmal als schlichter Text
 * und einmal mit Formatierung. Kevin muss sie nicht abtippen und kann
 * sie auch nicht versehentlich halb loeschen: Im Textfeld steht nur der
 * Brief, die Fusszeile kommt beim Verschicken dazu.
 *
 * Die beiden Bewertungsadressen sind dieselben, die der Shop nach der
 * Show verschickt, siehe flotix-shop/src/app/bewertung/[token].
 */

const TRIPADVISOR =
  "https://www.tripadvisor.de/UserReviewEdit-g198468-d24151397-Florian_Zimmer_Theater-Neu_Ulm_Swabia_Bavaria.html";
const GOOGLE = "https://search.google.com/local/writereview?placeid=ChIJM7SUXk3fm0cRLDoip8t0DRQ";

const NAME = "Kevin Steele";
const ROLLE = "Ticketing-Team";
const MAIL = "tickets@florianzimmer.com";
const TELEFON = "+49 731 7906110";
const FIRMA = "Florian Zimmer Theater GmbH";
const STRASSE = "Grethe-Weiser-Str. 2/1";
const ORT = "89231 Neu-Ulm";
// Die Theateradresse, nicht florianzimmer.com: "auf
// florianzimmertheater.de" (Florian, 28.10.2026). Dort liegt der Shop,
// und dorthin soll ein Kunde gehen, der auf die Fusszeile klickt.
const SEITE = "www.florianzimmertheater.de";

/** Fuer Mailprogramme ohne Formatierung. */
export const FUSSZEILE_TEXT = [
  "",
  "--",
  NAME,
  ROLLE,
  MAIL,
  TELEFON,
  "",
  `Bewerten Sie uns bei Tripadvisor: ${TRIPADVISOR}`,
  `Bewerten Sie uns bei Google: ${GOOGLE}`,
  "",
  FIRMA,
  STRASSE,
  ORT,
  `https://${SEITE}`,
].join(String.fromCharCode(10));

/**
 * Dieselbe Fusszeile mit Formatierung.
 *
 * Alles liegt in Tabellen und mit Stilen direkt am Element: Outlook
 * wirft alles weg, was im Kopf der Mail steht, und kennt kein flex.
 */
export function fusszeileHtml(): string {
  const leise = "color:#6b6457;text-decoration:none";
  return (
    `<div style="margin-top:32px;border-top:2px solid #c8a24a;padding-top:16px;` +
    `font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#1a1a1a">` +
    `<p style="margin:0 0 10px">` +
    `<strong style="font-size:14px">${NAME}</strong><br>` +
    `<span style="color:#6b6457">${ROLLE}</span><br>` +
    `<a href="mailto:${MAIL}" style="color:#8a6a1f;text-decoration:none">${MAIL}</a><br>` +
    `<a href="tel:${TELEFON.replace(/\s/g, "")}" style="${leise}">${TELEFON}</a>` +
    `</p>` +
    `<p style="margin:0 0 14px;font-size:13px">` +
    `Bewerten Sie uns bei <a href="${TRIPADVISOR}" style="color:#8a6a1f">Tripadvisor</a>` +
    ` oder bei <a href="${GOOGLE}" style="color:#8a6a1f">Google</a>.` +
    `</p>` +
    `<p style="margin:0;font-size:12px;color:#6b6457">` +
    `${FIRMA}<br>${STRASSE}<br>${ORT}<br>` +
    `<a href="https://${SEITE}" style="${leise}">${SEITE}</a>` +
    `</p>` +
    `</div>`
  );
}
