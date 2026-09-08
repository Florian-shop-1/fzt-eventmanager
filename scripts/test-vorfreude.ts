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

import { baueVorfreudemail } from "../src/lib/mail/vorfreude";
import { zieldatum, VORLAUF_TAGE } from "../src/lib/mail/vorfreudelauf";
import type { ShopBuchung, BuchungsPosten } from "../src/lib/db/shop-buchungen";
import type { Leistungsgruppe } from "../src/lib/shop/zusatzleistungen";

/** Ein ganz normaler Abend: Menue, Drumherum und Mitbringsel sind buchbar. */
const ALLES_DA = new Set<Leistungsgruppe>(["menue", "vip", "bundle"]);
/** Schnupper-Magic, RegioTV: kein Menue an diesem Abend. */
const OHNE_MENUE = new Set<Leistungsgruppe>(["vip", "bundle"]);

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

console.log("Nur Showticket gebucht");
{
  const m = baueVorfreudemail(NUR_TICKET, ALLES_DA);
  pruefe(m.angeboten.includes("Menü"), "das Menü wird angeboten");
  pruefe(m.text.includes("Osman Kavak"), "der Koch wird beim Namen genannt");
  pruefe(m.text.includes("ausschließlich als Showgast"), "die Exklusivität steht drin");
  pruefe(m.angeboten.includes("Abend drumherum"), "Stehtisch und Armband werden angeboten");
}

console.log("Menü schon gebucht");
{
  const m = baueVorfreudemail(MIT_MENUE, ALLES_DA);
  pruefe(!m.angeboten.includes("Menü"), "das Menü wird NICHT noch einmal angeboten");
  pruefe(!m.text.includes("Osman Kavak"), "der ganze Menü-Absatz fehlt");
  pruefe(m.angeboten.includes("Abend drumherum"), "der Rest wird trotzdem angeboten");
}

console.log("VIP schon gebucht");
{
  const m = baueVorfreudemail(MIT_VIP, ALLES_DA);
  pruefe(!m.angeboten.includes("Abend drumherum"), "der Stehtisch fehlt");
  pruefe(m.angeboten.includes("Menü"), "das Menü wird angeboten");
}

console.log("Alles schon gebucht");
{
  const m = baueVorfreudemail(ALLES, ALLES_DA);
  pruefe(m.angeboten.length === 0, "es wird nichts angeboten");
  pruefe(m.text.includes("Ich freue mich darauf"), "die Erinnerung geht trotzdem raus");
}

console.log("Nachmittagsvorstellung");
{
  const vormittags = baueVorfreudemail(NACHMITTAG, ALLES_DA);
  const abends = baueVorfreudemail(NUR_TICKET, ALLES_DA);
  pruefe(
    vormittags.text.includes("Nach der Show bleibst du einfach da"),
    "um 15 Uhr wird nach der Show gegessen",
  );
  pruefe(
    abends.text.includes("Danach musst du nur aufstehen"),
    "um 20 Uhr wird vor der Show gegessen",
  );
}

console.log("Abend ohne Magicuisine");
{
  const m = baueVorfreudemail(NUR_TICKET, OHNE_MENUE);
  pruefe(!m.angeboten.includes("Menü"), "kein Menü, wenn es an dem Abend keins gibt");
  pruefe(!m.text.includes("Osman Kavak"), "auch der Koch wird nicht erwähnt");
  pruefe(m.angeboten.includes("Abend drumherum"), "der Rest wird trotzdem angeboten");
}

console.log("Shop antwortet nicht");
{
  // verfuegbareGruppen liefert dann eine leere Menge. Die Mail darf nichts
  // versprechen, was sie nicht geprüft hat.
  const m = baueVorfreudemail(NUR_TICKET, new Set());
  pruefe(m.angeboten.length === 0, "im Zweifel wird nichts angeboten");
  pruefe(m.text.includes("Ich freue mich darauf"), "die Erinnerung geht trotzdem raus");
  pruefe(m.text.includes("/upgrade/"), "der Link zur Seite steht trotzdem drin");
}

console.log("Pflichtangaben in jeder Mail");
{
  for (const b of [NUR_TICKET, MIT_MENUE, ALLES, NACHMITTAG]) {
    const m = baueVorfreudemail(b, ALLES_DA);
    pruefe(m.text.includes("/abmelden/"), "der Abmeldelink steht drin");
    pruefe(m.text.includes("weil du Karten bei uns gekauft hast"), "der Grund steht drin");
    pruefe(m.text.includes("Grethe-Weiser-Str."), "die Anschrift steht drin");
    pruefe(m.text.includes(`/upgrade/${b.zugangToken}`), "der Link zur Seite stimmt");
  }
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
