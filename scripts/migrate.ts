/**
 * Spielt die SQL-Dateien aus dem Ordner migrations in die Datenbank ein.
 * Aufruf: npm run migrate
 *
 * Jede Datei wird nur einmal ausgeführt, das merkt sich die Tabelle
 * schema_migration. Neue Änderungen kommen als neue Datei dazu,
 * bestehende Dateien werden nie nachträglich geändert.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

// Next.js liest .env.local, dotenv nimmt von sich aus nur .env.
// Beide Dateien laden, .env.local hat Vorrang.
config({ path: [".env.local", ".env"] });

const ORDNER = join(process.cwd(), "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL fehlt.\n" +
        "So geht es: Datei .env.local anlegen und die Verbindung aus Neon eintragen.\n" +
        "Eine Vorlage steht in .env.example.",
    );
    process.exit(1);
  }

  const sql = neon(url);

  await sql`
    create table if not exists schema_migration (
      datei         text primary key,
      ausgefuehrt_am timestamptz not null default now()
    )
  `;

  const erledigt = new Set(
    ((await sql`select datei from schema_migration`) as { datei: string }[]).map((z) => z.datei),
  );

  const dateien = readdirSync(ORDNER)
    .filter((d) => d.endsWith(".sql"))
    .sort();

  let neue = 0;
  for (const datei of dateien) {
    if (erledigt.has(datei)) {
      console.log(`  übersprungen: ${datei}`);
      continue;
    }

    const inhalt = readFileSync(join(ORDNER, datei), "utf8");
    // Neon nimmt über HTTP nur einen Befehl je Abfrage entgegen, deshalb
    // trennen wir an Semikolons am Zeilenende. Semikolons innerhalb von
    // Zeichenketten gibt es in diesen Dateien bewusst nicht.
    const befehle = inhalt
      .split(/;\s*$/m)
      .map((b) => b.trim())
      .filter((b) => b.length > 0 && !b.split("\n").every((z) => z.trim().startsWith("--")));

    console.log(`  spiele ein: ${datei} (${befehle.length} Befehle)`);
    for (const befehl of befehle) {
      try {
        await sql.query(befehl);
      } catch (e) {
        console.error(`\nFehler in ${datei}:\n${befehl.slice(0, 200)}\n`);
        throw e;
      }
    }

    await sql`insert into schema_migration (datei) values (${datei})`;
    neue += 1;
  }

  console.log(
    neue === 0
      ? "\nDatenbank ist auf dem neuesten Stand."
      : `\n${neue} Migration(en) eingespielt. Datenbank ist auf dem neuesten Stand.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
