/**
 * Offene Koerbe aus der Ditix-Zeit gegen die Verkaufsliste abgleichen.
 *
 *   npx tsx scripts/ditix-abgleich.ts          nur ansehen, nichts aendern
 *   npx tsx scripts/ditix-abgleich.ts --echt   bestaetigen
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const echt = process.argv.includes("--echt");
  const { ditixAbgleich } = await import("../src/lib/db/ditix-abgleich");
  const e = await ditixAbgleich({ nurProbe: !echt });
  console.log(`${echt ? "BESTAETIGT" : "Probelauf"}: ${e.geprueft} offene Koerbe geprueft, ` +
    `${e.gefunden} in der Verkaufsliste gefunden, ${e.bestaetigt} bestaetigt.`);
  for (const z of e.zeilen.slice(0, 15)) {
    console.log(`  ${z.datum} ${z.show} | ${z.email} | ${z.plaetze} Pl. | Bestellung ${z.bestellung}`);
  }
  if (e.zeilen.length > 15) console.log(`  ... und ${e.zeilen.length - 15} weitere`);
}
void main();
