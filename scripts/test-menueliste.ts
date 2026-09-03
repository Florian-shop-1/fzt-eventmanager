/**
 * Prüft, ob die Menüliste aus dem Shop richtig gelesen wird.
 * Aufruf: npm run test:menueliste
 *
 * Liest nur, verändert nichts. Zeigt am Ende die Zahlen, die die Küche
 * für die nächsten Vorstellungen bekäme.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { holeShopBestellungen, shopZusammenfassung } from "../src/lib/shop/menueliste";
import { kommendeTermine } from "../src/lib/ditix/spielplan";

let fehler = 0;

function pruefe(bedingung: boolean, text: string) {
  console.log(`  ${bedingung ? "stimmt" : "FEHLER"}: ${text}`);
  if (!bedingung) fehler++;
}

async function main() {
  console.log("=== Menüliste lesen ===");
  const bestellungen = await holeShopBestellungen();
  console.log(`  ${bestellungen.length} Bestellungen gelesen`);
  pruefe(bestellungen.length > 0, "Es kommen Bestellungen an");
  pruefe(
    bestellungen.every((b) => b.ditixEventId.length > 0),
    "Jede Bestellung hat eine EventID",
  );

  const mitMenue = bestellungen.filter(
    (b) => Object.values(b.menues).reduce((s, n) => s + (n ?? 0), 0) > 0,
  );
  console.log(`  davon ${mitMenue.length} mit Menübestellung`);

  console.log("\n=== Zuordnung der Artikelspalten ===");
  const summe = { classic: 0, sea: 0, veggy: 0, kids: 0 };
  let armband = 0;
  let gold = 0;
  let stehtisch = 0;
  const sonstiges = new Map<string, number>();
  for (const b of bestellungen) {
    summe.classic += b.menues.classic ?? 0;
    summe.sea += b.menues.sea ?? 0;
    summe.veggy += b.menues.veggy ?? 0;
    summe.kids += b.menues.kids ?? 0;
    armband += b.getraenkeArmbaender;
    gold += b.vipArmbandGold;
    stehtisch += b.stehtische;
    for (const s of b.sonstiges) sonstiges.set(s.bezeichnung, (sonstiges.get(s.bezeichnung) ?? 0) + s.menge);
  }
  console.log(`  Menü Classic: ${summe.classic}`);
  console.log(`  Menü Sea:     ${summe.sea}`);
  console.log(`  Menü Veggy:   ${summe.veggy}`);
  console.log(`  Menü Kids:    ${summe.kids}`);
  console.log(`  Getränkeflat (Armbänder): ${armband}`);
  console.log(`  VIP-Armband Gold:         ${gold}`);
  console.log(`  Stehtische:               ${stehtisch}`);
  console.log("  Sonstiges, nicht zugeordnet:");
  for (const [b, m] of sonstiges) console.log(`    ${String(m).padStart(4)}x ${b}`);

  // Die Zahlen aus der Tabelle, von Hand gegengezaehlt am 2026-09-01.
  pruefe(summe.classic === 41, "41 Menüs Classic, wie in der Tabelle");
  pruefe(summe.sea === 18, "18 Menüs Sea");
  pruefe(summe.veggy === 3, "3 Menüs Veggy");
  pruefe(summe.kids === 3, "3 Kids-Menüs");
  pruefe(gold === 3, "3 goldene VIP-Armbänder, nicht als Getränkeflat gezählt");
  pruefe(armband === 6, "6 Getränkeflat-Armbänder");

  console.log("\n=== Die nächsten Vorstellungen mit Menübestellungen ===");
  const termine = await kommendeTermine(40);
  let gezeigt = 0;
  for (const t of termine) {
    const z = await shopZusammenfassung(t.ditixEventId);
    if (z.menuesGesamt === 0 && z.bestellungen === 0) continue;
    console.log(`\n  ${t.datum} ${t.uhrzeit}  ${t.name}`);
    console.log(
      `    ${z.bestellungen} Bestellungen, ${z.menuesGesamt} Menüs ` +
        `(Classic ${z.menues.classic}, Sea ${z.menues.sea}, Veggy ${z.menues.veggy}, Kids ${z.menues.kids})`,
    );
    if (z.getraenkeArmbaender > 0) console.log(`    ${z.getraenkeArmbaender} Getränkearmbänder`);
    if (z.stehtische > 0) console.log(`    ${z.stehtische} Stehtische`);
    gezeigt++;
    if (gezeigt >= 5) break;
  }

  console.log("\n" + (fehler === 0 ? "Alle Prüfungen bestanden." : `${fehler} Abweichung(en).`));
  process.exit(fehler === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
