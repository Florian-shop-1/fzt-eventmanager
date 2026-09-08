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
  const m = baueVorfreudemail(NUR_TICKET);
  pruefe(m.angeboten.includes("Menü"), "das Menü wird angeboten");
  pruefe(m.text.includes("Osman Kavak"), "der Koch wird beim Namen genannt");
  pruefe(m.text.includes("ausschließlich als Showgast"), "die Exklusivität steht drin");
  pruefe(m.angeboten.includes("Abend drumherum"), "Stehtisch und Armband werden angeboten");
}

console.log("Menü schon gebucht");
{
  const m = baueVorfreudemail(MIT_MENUE);
  pruefe(!m.angeboten.includes("Menü"), "das Menü wird NICHT noch einmal angeboten");
  pruefe(!m.text.includes("Osman Kavak"), "der ganze Menü-Absatz fehlt");
  pruefe(m.angeboten.includes("Abend drumherum"), "der Rest wird trotzdem angeboten");
}

console.log("VIP schon gebucht");
{
  const m = baueVorfreudemail(MIT_VIP);
  pruefe(!m.angeboten.includes("Abend drumherum"), "der Stehtisch fehlt");
  pruefe(m.angeboten.includes("Menü"), "das Menü wird angeboten");
}

console.log("Alles schon gebucht");
{
  const m = baueVorfreudemail(ALLES);
  pruefe(m.angeboten.length === 0, "es wird nichts angeboten");
  pruefe(m.text.includes("Ich freue mich darauf"), "die Erinnerung geht trotzdem raus");
}

console.log("Nachmittagsvorstellung");
{
  const vormittags = baueVorfreudemail(NACHMITTAG);
  const abends = baueVorfreudemail(NUR_TICKET);
  pruefe(
    vormittags.text.includes("Nach der Show bleibst du einfach da"),
    "um 15 Uhr wird nach der Show gegessen",
  );
  pruefe(
    abends.text.includes("Danach musst du nur aufstehen"),
    "um 20 Uhr wird vor der Show gegessen",
  );
}

console.log("Pflichtangaben in jeder Mail");
{
  for (const b of [NUR_TICKET, MIT_MENUE, ALLES, NACHMITTAG]) {
    const m = baueVorfreudemail(b);
    pruefe(m.text.includes("/abmelden/"), "der Abmeldelink steht drin");
    pruefe(m.text.includes("weil du Karten bei uns gekauft hast"), "der Grund steht drin");
    pruefe(m.text.includes("Grethe-Weiser-Str."), "die Anschrift steht drin");
    pruefe(m.text.includes(`/upgrade/${b.zugangToken}`), "der Link zur Seite stimmt");
  }
}

console.log("Der Tag, der angeschrieben wird");
{
  const ziel = zieldatum(new Date("2026-11-21T09:00:00Z"));
  pruefe(ziel === "2026-11-28", `am 21.11. ist der 28.11. dran (${VORLAUF_TAGE} Tage), war: ${ziel}`);
  // Über die Zeitumstellung hinweg: 25.10.2026 ist der Sonntag der Rückstellung.
  const ueberUmstellung = zieldatum(new Date("2026-10-20T09:00:00Z"));
  pruefe(ueberUmstellung === "2026-10-27", `Zeitumstellung verschiebt nichts, war: ${ueberUmstellung}`);
}

console.log("");
console.log("──────── Wortlaut, Gast mit Showticket ohne alles ────────");
console.log("");
console.log(`Betreff: ${baueVorfreudemail(NUR_TICKET).betreff}`);
console.log("");
console.log(baueVorfreudemail(NUR_TICKET).text);
console.log("");
console.log("──────── Wortlaut, Gast der schon alles hat ────────");
console.log("");
console.log(baueVorfreudemail(ALLES).text);
console.log("");

if (fehler > 0) {
  console.error(`${fehler} Prüfung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Prüfungen bestanden.");
