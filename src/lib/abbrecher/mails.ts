/**
 * Die zwei Mails an Gäste, die im Warenkorb stehen geblieben sind.
 *
 *  1. Die Frage: "Was hat dich abgehalten?" Vier Knöpfe, ein Klick, fertig.
 *     Sie verkauft nichts, sie fragt. Genau deshalb wird sie beantwortet.
 *  2. Das Angebot, drei Tage später: ein Geschenk, 24 Stunden gültig.
 *
 * Gestaltet wie die Bewertungsmail (mail/bewertung.ts): schwarz, gold,
 * Serifenschrift, Logo oben, ein großer Knopf. Der Rahmen liegt in
 * rahmen.ts, dort steht auch, warum der Countdown auf drei Ebenen läuft.
 *
 * Kein Rabatt auf die Karte: Wer den Preis einmal gesenkt bekommt, wartet
 * beim nächsten Mal darauf. Ein Geschenk kostet uns wenige Euro und ist
 * für den Gast zweistellig wert (Florian, 23.09.2026).
 */

import type { Abbrecher } from "./db";
import { GESCHENK_DAZU, GESCHENK_ERKLAERUNG, GESCHENK_TEXT, type GeschenkArt } from "./geschenk";
import { GOLD, LEISE, WEISS, absatz, h, kasten, klein, knopf, mailRahmen, ueberschrift } from "./rahmen";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";

export function vorname(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Zurück zur Buchung.
 *
 * NICHT der alte Warenkorb: Die Kasse hält die Plätze nur kurz, ein Link
 * auf /checkout/<warenkorb> führt nach Stunden auf eine abgelaufene Seite
 * (geprüft am 23.09.2026). Stattdessen der Tiefenlink in den Shop, der
 * die Buchung mit genau diesem Termin öffnet. Der Gast wählt seine Plätze
 * neu, was zwei Klicks sind, landet aber sicher am richtigen Abend.
 */
export function zurueckLink(a: Abbrecher): string {
  const ziel = a.ditixEventId
    ? `${SHOP}/?event=${encodeURIComponent(a.ditixEventId)}`
    : `${SHOP}/spielplan`;
  const trenner = ziel.includes("?") ? "&" : "?";
  /*
    Der Schlüssel wandert mit in den Shop ("g"). Damit fragt der Shop bei
    /api/shop/geschenk nach und schreibt "Für euch kostenlos" an die
    passende Kachel unter "Magie für Zuhause". Ohne ihn wüsste der Shop
    nichts vom Versprechen aus der Mail (Florian, 23.09.2026).
  */
  return (
    `${ziel}${trenner}utm_source=abbrecher&utm_medium=email&utm_campaign=warenkorb` +
    `&g=${encodeURIComponent(a.zugangToken)}`
  );
}

/** Die Seite mit der laufenden Uhr, dem Geschenk und dem Weg zur Kasse. */
export function angebotsLink(a: Abbrecher): string {
  return `${APP}/angebot/${a.zugangToken}`;
}

/** Der Abmeldeweg, der in jede Mail gehört. */
export function abmeldenLink(a: Abbrecher): string {
  return `${SHOP}/abmelden/${a.zugangToken}`;
}

export function datumLang(datum: string, uhrzeit: string): string {
  const d = new Date(`${datum}T12:00:00`);
  const tag = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  return uhrzeit ? `${tag} um ${uhrzeit} Uhr` : tag;
}

/** Was im Korb lag, in einer Zeile. */
export function korbText(a: Abbrecher): string {
  const teile = a.posten.filter((p) => p.anzahl > 0).map((p) => `${p.anzahl} × ${p.name}`);
  if (teile.length > 0) return teile.join(", ");
  return a.plaetze ? `${a.plaetze} ${a.plaetze === 1 ? "Platz" : "Plätze"}` : "deine Auswahl";
}

function fussZeile(a: Abbrecher): string {
  return (
    "Du bekommst diese Mail, weil du bei uns eine Buchung begonnen hast. " +
    `Wenn du nichts mehr von uns hören möchtest, <a href="${h(abmeldenLink(a))}" style="color:${LEISE};text-decoration:underline;">hier abmelden</a>.`
  );
}

/* ------------------------------------------------------------------ *
 * 1. Die Frage
 * ------------------------------------------------------------------ */

const GRUND_KNOEPFE: Array<[string, string]> = [
  ["preis", "Zu teuer"],
  ["termin", "Termin passte nicht"],
  ["technik", "Es hat technisch geklemmt"],
  ["ruecksprache", "Wollte erst Rücksprache halten"],
];

export function frageMail(a: Abbrecher) {
  const vn = vorname(a.name);
  const anrede = vn ? `Hallo ${vn},` : "Hallo,";
  const wann = datumLang(a.datum, a.uhrzeit);
  const link = (grund: string) => `${APP}/warum/${a.zugangToken}?grund=${grund}`;

  const betreff = `${vn ? `${vn}, ` : ""}was hat dich abgehalten?`;

  const text = [
    anrede,
    "",
    `du wolltest bei uns Plätze für ${a.show || "eine Show"} am ${wann} buchen`,
    `(${korbText(a)}), bist aber kurz vor Schluss stehen geblieben.`,
    "",
    "Wir wollen dir mit dieser Mail nichts verkaufen. Wir würden nur gern wissen,",
    "woran es lag. Ein Klick genügt:",
    "",
    ...GRUND_KNOEPFE.map(([g, t]) => `${t}: ${link(g)}`),
    "",
    "Lag es an der Technik? Schreib einfach zurück oder ruf an unter",
    "0731 7906 110. Wir buchen dich auch von Hand ein, das dauert zwei Minuten.",
    "",
    "Herzliche Grüße",
    "Florian",
  ].join("\n");

  /* Die vier Antworten als Knöpfe untereinander: auf dem Handy die einzige
     Anordnung, bei der man nicht danebentippt. */
  const antworten = GRUND_KNOEPFE.map(
    ([g, t]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px">
      <tr><td align="center" style="background-color:#191919;border:1px solid rgba(201,168,76,0.35);border-radius:8px;">
        <a href="${h(link(g))}" style="display:block;padding:14px 18px;font-family:${SANS};font-size:15px;color:${WEISS};text-decoration:none;">${h(t)}</a>
      </td></tr></table>`,
  ).join("");

  const html = mailRahmen({
    titel: "Was hat dich abgehalten?",
    vorschau: "Ein Klick genügt, und du hilfst uns enorm.",
    ueberschrift: ueberschrift("Was hat dich<br />abgehalten?"),
    inhalt: [
      absatz(h(anrede), `color:${WEISS};font-size:17px;`),
      absatz(
        `du wolltest Plätze für <strong style="color:${WEISS}">${h(a.show || "eine Show")}</strong> am ${h(wann)} buchen und bist kurz vor Schluss stehen geblieben.`,
      ),
      kasten(
        `${klein("Dein Warenkorb")}<p style="margin:8px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:#D8D8D8;">${h(korbText(a))}</p>`,
      ),
      absatz("Wir wollen dir nichts verkaufen. Wir würden nur gern wissen, woran es lag:"),
      antworten,
      absatz(
        `Lag es an der Technik? Schreib einfach zurück oder ruf an unter <strong style="color:${WEISS}">0731 7906 110</strong>. Wir buchen dich auch von Hand ein, das dauert zwei Minuten.`,
      ),
      `<p style="margin:22px 0 26px;font-family:${SERIF};font-size:23px;line-height:1.3;color:#E3C46F;">Florian</p>`,
    ].join(""),
    fuss: fussZeile(a),
  });

  return { betreff, text, html };
}

/* ------------------------------------------------------------------ *
 * 2. Das Angebot
 * ------------------------------------------------------------------ */

export function angebotMail(a: Abbrecher, art: GeschenkArt, bis: Date) {
  const vn = vorname(a.name);
  const anrede = vn ? `Hallo ${vn},` : "Hallo,";
  const wann = datumLang(a.datum, a.uhrzeit);
  const zurAngebotsseite = angebotsLink(a);
  const wieViele = a.plaetze && a.plaetze > 0 ? a.plaetze : null;

  const ablauf = bis.toLocaleString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  // Das gemalte Bild mit der Restzeit. Der Zeitstempel im Link verhindert,
  // dass ein Mailprogramm ein älteres Bild aus einer früheren Mail nimmt.
  const uhr = `${APP}/api/countdown?bis=${encodeURIComponent(bis.toISOString())}&t=${Date.now()}`;

  const gezogen = art === "baendchen";
  const betreff = gezogen
    ? "Du bist gezogen worden: Getränke gehen auf uns"
    : `Wir legen dir ${GESCHENK_DAZU[art]} dazu`;
  const auftakt = gezogen
    ? "jede Woche verlosen wir ein paar Getränkepakete unter denen, die bei uns kurz vor dem Abschluss stehen geblieben sind. Diese Woche ist deine Nummer gezogen worden."
    : "du warst schon fast durch, und dann kam etwas dazwischen. Damit der Abend trotzdem etwas Besonderes wird, legen wir dir etwas dazu.";

  const text = [
    anrede,
    "",
    auftakt,
    "",
    `Deine Plätze für ${a.show || "die Show"} am ${wann} sind noch frei, und wir`,
    `legen dir ${GESCHENK_DAZU[art]} dazu, ${wieViele ? `für alle ${wieViele} Gäste` : "für jeden deiner Gäste"}.`,
    GESCHENK_ERKLAERUNG[art],
    "",
    `Gültig bis ${ablauf} Uhr.`,
    "",
    "Du musst nichts eingeben und nichts ausdrucken: Es ist auf deinen Namen",
    "hinterlegt. Meldet euch am Abend einfach an der Magic-Bar im Foyer.",
    "",
    `Hier geht es weiter: ${zurAngebotsseite}`,
    "",
    "Lieber persönlich? Ruf an unter 0731 7906 110, wir machen das in zwei Minuten.",
    "",
    "Herzliche Grüße",
    "Florian",
  ].join("\n");

  const html = mailRahmen({
    titel: betreff,
    vorschau: `Gültig bis ${ablauf} Uhr. Danach geht es an den Nächsten.`,
    ueberschrift: ueberschrift(gezogen ? "Deine Nummer<br /><em>ist gezogen.</em>" : "Wir legen dir<br /><em>etwas dazu.</em>"),
    inhalt: [
      absatz(h(anrede), `color:${WEISS};font-size:17px;`),
      absatz(h(auftakt)),

      /* Der Countdown: gemaltes Bild, darunter die Uhrzeit im Klartext.
         Sind Bilder blockiert, steht die Frist trotzdem da. */
      kasten(
        `${klein("Dein Angebot endet in")}
         <img src="${h(uhr)}" width="300" alt="" style="display:block;width:300px;max-width:100%;height:auto;margin:10px auto 6px;border-radius:8px;" />
         <p style="margin:6px 0 0;font-family:${SANS};font-size:14px;line-height:1.5;color:#C4C4C4;">Gültig bis <strong style="color:${WEISS}">${h(ablauf)} Uhr</strong></p>`,
      ),

      kasten(
        `${klein("Für dich hinterlegt")}
         <p style="margin:10px 0 4px;font-family:${SERIF};font-size:24px;line-height:1.25;color:${GOLD};">${h(GESCHENK_TEXT[art])}</p>
         <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.6;color:#D8D8D8;">${wieViele ? `für alle ${wieViele} Gäste` : "für jeden deiner Gäste"} · ${h(GESCHENK_ERKLAERUNG[art])}</p>`,
      ),

      absatz(
        `Deine Plätze für <strong style="color:${WEISS}">${h(a.show || "die Show")}</strong> am ${h(wann)} sind noch frei.`,
      ),
      knopf("Plätze jetzt sichern", zurAngebotsseite),
      absatz(
        "Du musst nichts eingeben und nichts ausdrucken: Es ist auf deinen Namen hinterlegt. Meldet euch am Abend einfach an der Magic-Bar im Foyer.",
        "font-size:14px;",
      ),
      absatz(
        `Lieber persönlich? Ruf an unter <strong style="color:${WEISS}">0731 7906 110</strong>, wir machen das in zwei Minuten.`,
        "font-size:14px;",
      ),
      `<p style="margin:22px 0 26px;font-family:${SERIF};font-size:23px;line-height:1.3;color:#E3C46F;">Florian</p>`,
    ].join(""),
    fuss: fussZeile(a),
  });

  return { betreff, text, html };
}
