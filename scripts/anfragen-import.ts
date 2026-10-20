/**
 * Übernimmt die Anfragen einmalig aus der Google-Tabelle in die eigene Tabelle anfrage
 * (Julian, 20.10.2026). Vor dem Umschalten auf ANFRAGEN_QUELLE=datenbank ausführen.
 *
 *   npx tsx scripts/anfragen-import.ts            nur zählen, nichts schreiben
 *   npx tsx scripts/anfragen-import.ts --wirklich übernehmen
 *
 * Gleicher Schlüssel wie bisher: Bearbeitungsstand (lead_stand) gilt weiter.
 * Jede übernommene Anfrage wird zusätzlich als gemeldet vermerkt, damit beim
 * Umschalten keine Mails zu alten Anfragen hinausgehen. Mehrfach ausführbar:
 * Was schon da ist, bleibt unverändert.
 */
import { config } from "dotenv";
import { holeLeadsAusTabelle } from "../src/lib/shop/leads";
import { ausTabelleUebernehmen } from "../src/lib/db/anfragen";
import { db } from "../src/lib/db/client";

// Wie scripts/migrate.ts: .env.local hat Vorrang.
config({ path: [".env.local", ".env"] });

async function main() {
  const wirklich = process.argv.includes("--wirklich");
  const leads = await holeLeadsAusTabelle();
  console.log(`${leads.length} Anfragen in der Google-Tabelle.`);
  if (!wirklich) {
    console.log("Nur gezählt. Zum Übernehmen: --wirklich");
    return;
  }
  const neu = await ausTabelleUebernehmen(leads);
  for (const l of leads) {
    await db()`insert into anfrage_gemeldet (schluessel) values (${l.schluessel}) on conflict do nothing`;
  }
  console.log(`${neu} neu übernommen, ${leads.length - neu} waren schon da. Alle als gemeldet vermerkt.`);
}

main().catch((f) => {
  console.error(f);
  process.exit(1);
});
