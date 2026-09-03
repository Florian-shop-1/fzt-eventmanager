/**
 * Zeigt an, ob die Datenbank erreichbar ist und was drinsteht.
 * Aufruf: npx tsx scripts/db-status.ts
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt. Siehe README, Abschnitt Datenbank einrichten.");
    process.exit(1);
  }
  const sql = neon(url);

  const version = (await sql`select version()`) as { version: string }[];
  console.log("Postgres: " + version[0].version.split(",")[0]);

  const region = url.match(/@[^/]*?\.([a-z0-9-]+)\.aws\.neon\.tech/);
  console.log("Region:   " + (region ? region[1] : "unbekannt"));

  const tabellen = (await sql`
    select table_name,
           (select count(*) from information_schema.columns c
             where c.table_name = t.table_name and c.table_schema = 'public') as spalten
      from information_schema.tables t
     where table_schema = 'public'
     order by table_name
  `) as { table_name: string; spalten: number }[];

  console.log(`\n${tabellen.length} Tabellen:`);
  for (const t of tabellen) {
    const anzahl = (await sql.query(`select count(*)::int as n from "${t.table_name}"`)) as {
      n: number;
    }[];
    console.log(`  ${t.table_name.padEnd(20)} ${String(t.spalten).padStart(2)} Spalten, ${anzahl[0].n} Zeilen`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
