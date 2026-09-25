/**
 * Rechnet nach, dass die sparsame Fassung auf 110 Euro pro Gast kommt.
 *
 * Auf der Firmenseite steht "schon ab 110 Euro pro Person, ohne Fine
 * Dining, aber inklusive Umtrunk und Fingerfood". Wenn jemand die Preise
 * im Artikelstamm ändert, soll dieser Test auffallen, bevor es der Kunde
 * tut (Florian, 25.09.2026).
 */

import {
  angebotssumme,
  erzeugePositionen,
  FINGERFOOD_ANGEBOTSOPTIONEN,
  STANDARD_ANGEBOTSOPTIONEN,
  positionsSumme,
} from "../src/lib/angebot/erstellen";
import type { Vorgang } from "../src/lib/domain/vorgang";

const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";

const PERSONEN = 30;
const jetzt = new Date().toISOString();

const vorgang = {
  id: "test",
  kunde: { id: "k", name: "Beispiel GmbH", email: "test@example.com", ansprechpartner: null },
  vorstellung: { id: "v", datum: "2027-01-15", show: "ULMfassbar by Florian Zimmer", beginn: "20:00" },
  gruppen: [
    {
      id: "g1",
      name: "Beispiel GmbH",
      personen: PERSONEN,
      sicherheit: "gebucht",
      menues: { classic: PERSONEN },
      bereichFixiert: "eventgalerie",
    },
  ],
  angebote: [],
  zahlungen: [],
  notizen: [],
  aufgaben: [],
  quelle: "Test",
  erstelltAm: jetzt,
  geaendertAm: jetzt,
} as unknown as Vorgang;

let fehler = 0;

function pruefe(name: string, ist: number, soll: number): void {
  const gut = ist === soll;
  if (!gut) fehler += 1;
  console.log(`  ${gut ? "stimmt" : "FALSCH"}: ${name}: ${eur(ist)} (erwartet ${eur(soll)})`);
}

console.log("\n=== Sparsame Fassung: Fingerfood, Kat. 3, Umtrunk ===");
const sparsam = erzeugePositionen(vorgang, null, FINGERFOOD_ANGEBOTSOPTIONEN);
for (const p of sparsam.filter((p) => !p.istAlternativeZu)) {
  console.log(`  ${p.menge}x ${p.bezeichnung} = ${eur(positionsSumme(p))}`);
}
const summeSparsam = angebotssumme(sparsam);
console.log(`  Gesamt: ${eur(summeSparsam.bruttoCent)}`);
pruefe("pro Gast", Math.round(summeSparsam.bruttoCent / PERSONEN), 11000);

console.log("\n=== Normalfall: Magic Menü, Kat. 2 mit 15 Prozent ===");
const voll = erzeugePositionen(vorgang, null, { ...STANDARD_ANGEBOTSOPTIONEN, mitEmpfang: true });
for (const p of voll.filter((p) => !p.istAlternativeZu)) {
  console.log(`  ${p.menge}x ${p.bezeichnung} = ${eur(positionsSumme(p))}`);
}
const summeVoll = angebotssumme(voll);
console.log(`  Gesamt: ${eur(summeVoll.bruttoCent)}`);
console.log(`  pro Gast: ${eur(Math.round(summeVoll.bruttoCent / PERSONEN))}`);

if (fehler > 0) {
  console.error(`\n${fehler} Prüfung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Prüfungen bestanden.");
