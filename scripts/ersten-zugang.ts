/**
 * Legt den allerersten Zugang an, damit sich überhaupt jemand anmelden kann.
 * Aufruf: npm run zugang
 *
 * Danach werden alle weiteren Zugänge im Programm selbst angelegt, unter
 * "Zugänge". Läuft das Skript ein zweites Mal, passiert nichts: es legt nur
 * an, was noch fehlt, und zeigt für vorhandene Zugänge kein Passwort an.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { neon } from "@neondatabase/serverless";
import { passwortVerschluesseln, startpasswortErzeugen } from "../src/lib/auth/passwort";

/** Die Zugänge, die Florian genannt hat. */
const ZUGAENGE: Array<{ name: string; email: string; rolle: "chef" | "team" | "gastro" }> = [
  { name: "Florian Zimmer", email: "info@florianzimmer.com", rolle: "chef" },
  { name: "Kevin Steele", email: "kevin.steele@florianzimmer.com", rolle: "team" },
  { name: "Julian", email: "julian@florianzimmer.com", rolle: "team" },
  { name: "Tickets FZT", email: "tickets@florianzimmer.com", rolle: "team" },
  { name: "Osman Kavak", email: "mail@zurforelleulm.de", rolle: "gastro" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt. Siehe README, Abschnitt Datenbank einrichten.");
    process.exit(1);
  }
  const sql = neon(url);

  console.log("");
  const neue: Array<{ name: string; email: string; passwort: string; rolle: string }> = [];

  for (const z of ZUGAENGE) {
    const vorhanden = (await sql`
      select id from benutzer where lower(email) = ${z.email.toLowerCase()}
    `) as Array<{ id: string }>;

    if (vorhanden.length > 0) {
      console.log(`  vorhanden:  ${z.email}`);
      continue;
    }

    const passwort = startpasswortErzeugen();
    await sql`
      insert into benutzer (name, email, rolle, passwort_hash, muss_passwort_aendern, startpasswort)
      values (${z.name}, ${z.email}, ${z.rolle}, ${await passwortVerschluesseln(passwort)}, true,
              ${passwort})
    `;
    neue.push({ ...z, passwort });
    console.log(`  angelegt:   ${z.email}`);
  }

  if (neue.length === 0) {
    console.log("\nAlle Zugänge waren schon da. Passwörter lassen sich im Programm neu vergeben.");
    return;
  }

  console.log("\n" + "=".repeat(64));
  console.log("  STARTPASSWÖRTER, bitte jetzt notieren");
  console.log("=".repeat(64));
  for (const n of neue) {
    console.log("");
    console.log(`  ${n.name}  (${rolleText(n.rolle)})`);
    console.log(`    E-Mail:   ${n.email}`);
    console.log(`    Passwort: ${n.passwort}`);
  }
  console.log("");
  console.log("=".repeat(64));
  console.log("  Diese Passwörter werden nie wieder angezeigt.");
  console.log("  Beim ersten Anmelden wird zum Ändern aufgefordert.");
  console.log("=".repeat(64));
  console.log("");
}

function rolleText(rolle: string): string {
  if (rolle === "chef") return "Geschäftsführung, darf alles";
  if (rolle === "gastro") return "Gastronomie, nur Funktionsheet und Küche";
  return "Team";
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
