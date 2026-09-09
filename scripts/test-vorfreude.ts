/**
 * Prüft die Vorfreude-Mail. Aufruf: npm run test:vorfreude
 *
 * Verschickt nichts und verändert nichts. Baut die Mail für erfundene
 * Buchungen und prüft, dass drinsteht, was drinstehen soll -- vor allem, dass
 * NICHTS angeboten wird, was der Gast schon hat. Ein Menü anzubieten, das
 * jemand längst gebucht hat, ist der eine Fehler, der die ganze Mail wertlos
 * macht.
 *
 * Am Ende steht der Wortlaut zum Mitlesen.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { writeFileSync } from "fs";
import { baueVorfreudemail, vorname } from "../src/lib/mail/vorfreude";
import { zieldatum, VORLAUF_TAGE } from "../src/lib/mail/vorfreudelauf";
import type { ShopBuchung, BuchungsPosten } from "../src/lib/db/shop-buchungen";
import type { Leistungsgruppe } from "../src/lib/shop/zusatzleistungen";

/** Ein ganz normaler Abend: Menue, Drumherum und Mitbringsel sind buchbar. */
const ALLES_DA = new Set<Leistungsgruppe>(["menue", "vip", "bundle"]);
/** Schnupper-Magic, RegioTV: kein Menue an diesem Abend. */
const OHNE_MENUE = new Set<Leistungsgruppe>(["vip", "bundle"]);

const SHOP_ADRESSE = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

let fehler = 0;

function pruefe(bedingung: boolean, text: string) {
  console.log(`  ${bedingung ? "stimmt" : "FEHLER"}: ${text}`);
  if (!bedingung) fehler++;
}

function posten(gruppe: BuchungsPosten["gruppe"], name: string): BuchungsPosten {
  return { ticketTypeId: `id-${gruppe}`, name, anzahl: 2, preisCent: 6900, gruppe };
}

function buchung(uhrzeit: string, ...teile: BuchungsPosten[]): ShopBuchung {
  return {
    id: "test",
    name: "Florian Zimmer",
    zugangToken: "0".repeat(32),
    cartId: "test",
    ditixEventId: "ev",
    datum: "2026-11-28",
    uhrzeit,
    show: "Testshow",
    email: "gast@example.com",
    telefon: "",
    plaetze: 2,
    gesamtCent: 9800,
    hinweis: "",
    bestaetigt: true,
    accessCode: null,
    mailGesendetAm: null,
    eingegangenAm: new Date(),
    posten: [posten("sitzplatz", "Kategorie 1"), ...teile],
  };
}

const NUR_TICKET = buchung("20:00");
const MIT_MENUE = buchung("20:00", posten("menue", "4-Gang-Menü CLASSIC"));
const MIT_VIP = buchung("20:00", posten("vip", "VIP-Armband"));
const ALLES = buchung(
  "20:00",
  posten("menue", "4-Gang-Menü CLASSIC"),
  posten("vip", "VIP-Armband"),
);
const NACHMITTAG = buchung("15:00");

console.log("Vorname aus dem Namen loesen");
{
  const faelle: [string, string][] = [
    ["Florian Zimmer", "Florian"],
    ["Zimmer, Florian", "Florian"],
    ["Dr. Florian Zimmer", "Florian"],
    ["florian zimmer", "Florian"],
    ["FLORIAN ZIMMER", "Florian"],
    ["hans-peter mueller", "Hans-Peter"],
    ["Florian", "Florian"],
    ["  Florian   Zimmer ", "Florian"],
    ["", ""],
    ["Musterfirma GmbH", ""],
    ["info", ""],
    ["123", ""],
  ];
  for (const [ein, soll] of faelle) {
    const ist = vorname(ein);
    pruefe(ist === soll, `"${ein}" ergibt "${soll}"${ist === soll ? "" : `, war aber "${ist}"`}`);
  }
}

console.log("Anrede und Betreff");
{
  const mit = baueVorfreudemail(NUR_TICKET, ALLES_DA);
  pruefe(mit.text.startsWith("Hallo Florian,"), "mit Namen wird persoenlich gegruesst");
  pruefe(mit.html.includes("Hallo Florian,"), "auch im HTML-Teil");
  pruefe(mit.betreff.includes("Florian"), `der Vorname steht im Betreff: "${mit.betreff}"`);
  pruefe(mit.betreff.includes(String(VORLAUF_TAGE)), "die Tage stehen im Betreff");

  const ohne = baueVorfreudemail({ ...NUR_TICKET, name: "" }, ALLES_DA);
  pruefe(ohne.text.startsWith("Hallo,"), "ohne Namen der Rueckfall");
  pruefe(!ohne.betreff.includes(","), `Betreff ohne Namen sauber: "${ohne.betreff}"`);
}

console.log("HTML-Teil");
{
  const m = baueVorfreudemail(NUR_TICKET, ALLES_DA);
  pruefe(m.html.includes("/images/logo.png"), "das Logo ist eingebunden");
  pruefe(m.html.includes("Home of Magic"), "die Unterzeile HOME OF MAGIC steht dabei");
  pruefe(m.html.includes("Vorfreude steigern"), "der Knopf traegt die richtige Beschriftung");
  pruefe(!/Jetzt upgraden|Abend veredeln|Upgrade kaufen/i.test(m.html), "keine andere Knopfbeschriftung");
  pruefe(m.html.includes("v:roundrect"), "Outlook-Fassung des Knopfes vorhanden");
  pruefe(m.html.includes(`/upgrade/${NUR_TICKET.zugangToken}`), "der Knopf zeigt auf die richtige Seite");
  pruefe(m.html.includes(`/abmelden/${NUR_TICKET.zugangToken}`), "der Abmeldelink traegt denselben Schluessel");
  pruefe(m.html.includes(">abmelden</a>"), "im HTML steht nur das Wort, nicht die Adresse");
  pruefe(!m.html.includes(`>${SHOP_ADRESSE}/upgrade`), "die lange Adresse steht nicht im Fliesstext");
  pruefe(m.text.includes(`${SHOP_ADRESSE}/upgrade/`), "im Textteil steht sie vollstaendig");
  pruefe(m.html.includes("Florian Zimmer Theater GmbH"), "der volle Firmenname im Fuss");
  pruefe(/>\s*Florian\s*<\/p>/.test(m.html), "unterschrieben ist mit dem Vornamen allein");
  pruefe(m.html.includes("charset=UTF-8"), "die Zeichenkodierung ist gesetzt");
  pruefe(m.html.includes("✨"), "das Funkeln steht im Knopf");
  pruefe(m.html.includes("width=device-width"), "fuer das Handy vorbereitet");
  pruefe(m.html.includes("max-width:600px"), "feste Breite mit Deckel");
}

console.log("Nur Showticket gebucht");
{
  const m = baueVorfreudemail(NUR_TICKET, ALLES_DA);
  pruefe(m.angeboten.includes("Menü"), "das Menü zählt als offen");
  pruefe(m.angeboten.includes("Abend drumherum"), "Stehtisch und Armband ebenso");
  pruefe(m.text.includes("Vorfreude noch ein bisschen steigern"), "der Hinweis auf die Extras steht drin");
  pruefe(m.html.includes("Vorfreude steigern"), "und der Knopf dazu");
}

console.log("Menü schon gebucht");
{
  const m = baueVorfreudemail(MIT_MENUE, ALLES_DA);
  pruefe(!m.angeboten.includes("Menü"), "das Menü zählt nicht mehr als offen");
  pruefe(m.angeboten.includes("Abend drumherum"), "der Rest schon");
}

console.log("VIP schon gebucht");
{
  const m = baueVorfreudemail(MIT_VIP, ALLES_DA);
  pruefe(!m.angeboten.includes("Abend drumherum"), "der Stehtisch fehlt");
  pruefe(m.angeboten.includes("Menü"), "das Menü wird angeboten");
}

console.log("Alles schon gebucht");
{
  const m = baueVorfreudemail(ALLES, new Set(["menue", "vip"]));
  pruefe(m.angeboten.length === 0, "es gibt nichts mehr anzubieten");
  pruefe(!m.text.includes("Extras"), "dann steht auch kein Hinweis darauf im Text");
  pruefe(m.text.includes("Ich freue mich auf dich!"), "die Erinnerung geht trotzdem raus");
}

console.log("Abend ohne Magicuisine");
{
  const m = baueVorfreudemail(NUR_TICKET, OHNE_MENUE);
  pruefe(!m.angeboten.includes("Menü"), "kein Menü, wenn es an dem Abend keins gibt");
  pruefe(m.angeboten.includes("Abend drumherum"), "der Rest zählt trotzdem");
}

console.log("Shop antwortet nicht");
{
  // verfuegbareGruppen liefert dann eine leere Menge. Die Mail darf nichts
  // versprechen, was sie nicht geprüft hat.
  const m = baueVorfreudemail(NUR_TICKET, new Set());
  pruefe(m.angeboten.length === 0, "im Zweifel wird nichts angeboten");
  pruefe(!m.text.includes("Extras"), "kein Hinweis auf Extras");
  pruefe(m.text.includes("Ich freue mich auf dich!"), "die Erinnerung geht trotzdem raus");
  pruefe(m.text.includes("/upgrade/"), "der Link zur Seite steht trotzdem drin");
}

console.log("Pflichtangaben in jeder Mail");
{
  for (const b of [NUR_TICKET, MIT_MENUE, ALLES, NACHMITTAG]) {
    const m = baueVorfreudemail(b, ALLES_DA);
    pruefe(m.text.includes("/abmelden/"), "der Abmeldelink steht drin");
    pruefe(m.text.includes("weil du Tickets bei uns gekauft hast"), "der Grund steht drin");
    pruefe(m.html.includes("weil du Tickets bei uns gekauft hast"), "auch im HTML-Teil");
    pruefe(m.text.includes("Grethe-Weiser-Str."), "die Anschrift steht drin");
    pruefe(m.text.includes(`/upgrade/${b.zugangToken}`), "der Link zur Seite stimmt");
  }
}

console.log("Termin steht dynamisch drin");
{
  const a = baueVorfreudemail(NUR_TICKET, ALLES_DA);
  pruefe(a.text.includes("Samstag, 28. November, um 20 Uhr"), "Wochentag, Datum und Zeit im Text");
  pruefe(a.html.includes("Samstag, 28. November, um 20 Uhr"), "dasselbe im HTML");
  pruefe(a.text.includes("Bis Samstag"), "der Gruss nennt den Wochentag");
  const b = baueVorfreudemail({ ...NUR_TICKET, datum: "2026-12-03", uhrzeit: "20:00" }, ALLES_DA);
  pruefe(b.text.includes("Donnerstag, 3. Dezember, um 20 Uhr"), "anderer Termin, anderer Text");
  pruefe(!a.text.includes("Dezember"), "nichts ist fest verdrahtet");
}

console.log("Der Tag, der angeschrieben wird");
{
  const start = new Date("2026-11-23T09:00:00Z");
  const ziel = zieldatum(start);
  const erwartet = new Date("2026-11-23T12:00:00Z");
  erwartet.setUTCDate(erwartet.getUTCDate() + VORLAUF_TAGE);
  pruefe(
    ziel === erwartet.toISOString().slice(0, 10),
    `${VORLAUF_TAGE} Tage nach dem 23.11. ist der ${ziel}`,
  );
  // Über die Zeitumstellung hinweg: In der Nacht auf den 25.10.2026 wird
  // zurückgestellt, der Tag hat 25 Stunden.
  const vor = new Date("2026-10-22T09:00:00Z");
  const soll = new Date("2026-10-22T12:00:00Z");
  soll.setUTCDate(soll.getUTCDate() + VORLAUF_TAGE);
  pruefe(
    zieldatum(vor) === soll.toISOString().slice(0, 10),
    `Zeitumstellung verschiebt nichts, war: ${zieldatum(vor)}`,
  );
}

// Die HTML-Fassungen zum Ansehen im Browser ablegen.
{
  const ziel = process.env.VORSCHAU_ORDNER;
  if (ziel) {
    writeFileSync(`${ziel}/mail-mit-angebot.html`, baueVorfreudemail(NUR_TICKET, ALLES_DA).html, "utf8");
    writeFileSync(`${ziel}/mail-ohne-namen.html`, baueVorfreudemail({ ...NUR_TICKET, name: "" }, ALLES_DA).html, "utf8");
    writeFileSync(`${ziel}/mail-alles-gebucht.html`, baueVorfreudemail(ALLES, ALLES_DA).html, "utf8");
    console.log(`
Vorschau geschrieben nach ${ziel}`);
  }
}

console.log("");
console.log("──────── Wortlaut, Gast mit Showticket ohne alles ────────");
console.log("");
console.log(`Betreff: ${baueVorfreudemail(NUR_TICKET, ALLES_DA).betreff}`);
console.log("");
console.log(baueVorfreudemail(NUR_TICKET, ALLES_DA).text);
console.log("");
console.log("──────── Wortlaut, Gast der schon alles hat ────────");
console.log("");
console.log(baueVorfreudemail(ALLES, ALLES_DA).text);
console.log("");

if (fehler > 0) {
  console.error(`${fehler} Prüfung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Prüfungen bestanden.");
