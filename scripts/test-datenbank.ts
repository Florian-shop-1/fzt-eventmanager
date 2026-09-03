/**
 * Prüft das Datenbankschema, ohne dass eine echte Datenbank nötig ist.
 * Aufruf: npx tsx scripts/test-datenbank.ts
 *
 * Läuft gegen PGlite, ein vollständiges Postgres, das im Arbeitsspeicher
 * läuft. Was hier funktioniert, funktioniert auch auf Neon.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

let fehler = 0;

function pruefe(bedingung: boolean, text: string, istwert?: unknown) {
  if (bedingung) {
    console.log(`  stimmt: ${text}`);
  } else {
    console.log(`  FEHLER: ${text}${istwert === undefined ? "" : ` (ist: ${JSON.stringify(istwert)})`}`);
    fehler++;
  }
}

/** Postgres liefert count() je nach Treiber als Zahl oder als Zeichenkette. */
function zahl(wert: unknown): number {
  return Number(wert);
}

async function erwarteFehler(fn: () => Promise<unknown>, text: string) {
  try {
    await fn();
    console.log(`  FEHLER: ${text} (wurde faelschlich akzeptiert)`);
    fehler++;
  } catch {
    console.log(`  stimmt: ${text}`);
  }
}

async function main() {
  const db = new PGlite();

  console.log("=== Migrationen einspielen ===");
  const ordner = join(process.cwd(), "migrations");
  for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(ordner, datei), "utf8"));
    console.log(`  eingespielt: ${datei}`);
  }

  console.log("\n=== Tabellen vorhanden ===");
  const tabellen = await db.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  const namen = tabellen.rows.map((r) => r.table_name);
  console.log(`  ${namen.join(", ")}`);
  for (const erwartet of [
    "angebot",
    "aufgabe",
    "benutzer",
    "gastangaben",
    "gruppe",
    "kunde",
    "notiz",
    "oeffnung",
    "position",
    "shortcut",
    "sitzplan",
    "vorgang",
    "vorstellung",
    "zahlung",
  ]) {
    pruefe(namen.includes(erwartet), `Tabelle ${erwartet}`);
  }

  console.log("\n=== Ein vollständiger Vorgang lässt sich anlegen ===");
  await db.exec(`
    insert into kunde (id, name, email)
      values ('11111111-1111-1111-1111-111111111111', 'Fluoron GmbH', 'schoen@example.com');
    insert into vorstellung (id, datum, show)
      values ('22222222-2222-2222-2222-222222222222', '2026-11-13', 'ULMfassbar by Florian Zimmer');
    insert into vorgang (id, nummer, kunde_id, vorstellung_id, quelle)
      values ('33333333-3333-3333-3333-333333333333', 'V-0826-001',
              '11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222', 'Meta-Lead');
    insert into gruppe (vorgang_id, name, personen, herkunft, menues)
      values ('33333333-3333-3333-3333-333333333333', 'Fluoron GmbH', 20, 'firma',
              '{"classic": 16, "veggy": 4}');
  `);

  const gruppen = await db.query<{ name: string; personen: number; menues: Record<string, number> }>(
    "select name, personen, menues from gruppe",
  );
  pruefe(gruppen.rows[0].personen === 20, "Gruppe mit 20 Personen gespeichert");
  pruefe(gruppen.rows[0].menues.veggy === 4, "Menüwahl als JSON gespeichert und wieder lesbar");

  console.log("\n=== Regeln greifen ===");
  await erwarteFehler(
    () =>
      db.exec(`insert into gruppe (vorgang_id, name, personen, ausnahme_aktiv)
               values ('33333333-3333-3333-3333-333333333333', 'Ohne Grund', 8, true)`),
    "Ausnahme ohne Begründung wird abgelehnt",
  );

  await db.exec(`insert into gruppe (vorgang_id, name, personen, ausnahme_aktiv, ausnahme_grund)
                 values ('33333333-3333-3333-3333-333333333333', 'Mit Grund', 8, true,
                         'Private Feier, waere sonst am Budget gescheitert')`);
  console.log("  stimmt: Ausnahme mit Begründung wird angenommen");

  await erwarteFehler(
    () =>
      db.exec(`insert into gruppe (vorgang_id, name, personen)
               values ('33333333-3333-3333-3333-333333333333', 'Null Personen', 0)`),
    "Gruppe mit null Personen wird abgelehnt",
  );

  await erwarteFehler(
    () => db.exec(`insert into vorstellung (datum, show) values ('2026-11-13', 'ULMfassbar by Florian Zimmer')`),
    "Dieselbe Vorstellung zweimal anzulegen wird abgelehnt",
  );

  console.log("\n=== Angebot mit Alternativpositionen ===");
  await db.exec(`
    insert into angebot (id, vorgang_id, nummer, gueltig_bis, tracking_token)
      values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333',
              'AG-0826-1168', '2026-08-28', 'geheim123');
    insert into position (id, angebot_id, artikel_nummer, bezeichnung, menge, einzel_brutto_cent, ust, sortierung)
      values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444',
              'TK2', 'Ticket Kat. 2', 20, 8900, 0.07, 2);
    insert into position (angebot_id, artikel_nummer, bezeichnung, menge, einzel_brutto_cent, ust, ist_alternative_zu, sortierung)
      values ('44444444-4444-4444-4444-444444444444', 'TGS', 'Ticket Golden Seats', 20, 13900, 0.07,
              '55555555-5555-5555-5555-555555555555', 3);
  `);

  const alternativen = await db.query<{ anzahl: unknown }>(
    "select count(*) as anzahl from position where ist_alternative_zu is not null",
  );
  pruefe(
    zahl(alternativen.rows[0].anzahl) === 1,
    "Alternativposition hängt an der Hauptposition",
    alternativen.rows[0].anzahl,
  );

  console.log("\n=== Öffnungen des Angebots werden mitgezählt ===");
  await db.exec(`
    insert into oeffnung (angebot_id, geraet) values ('44444444-4444-4444-4444-444444444444', 'Handy');
    insert into oeffnung (angebot_id, geraet) values ('44444444-4444-4444-4444-444444444444', 'Rechner');
  `);
  const oeffnungen = await db.query<{ anzahl: unknown }>(
    "select count(*) as anzahl from oeffnung where angebot_id = '44444444-4444-4444-4444-444444444444'",
  );
  pruefe(zahl(oeffnungen.rows[0].anzahl) === 2, "zwei Öffnungen gespeichert", oeffnungen.rows[0].anzahl);

  console.log("\n=== Löschen räumt sauber auf ===");
  await db.exec("delete from vorgang where id = '33333333-3333-3333-3333-333333333333'");
  const rest = await db.query<{ anzahl: unknown }>("select count(*) as anzahl from position");
  pruefe(zahl(rest.rows[0].anzahl) === 0, "Positionen verschwinden mit dem Vorgang", rest.rows[0].anzahl);
  const kundeBleibt = await db.query<{ anzahl: unknown }>("select count(*) as anzahl from kunde");
  pruefe(zahl(kundeBleibt.rows[0].anzahl) === 1, "der Kunde bleibt erhalten", kundeBleibt.rows[0].anzahl);

  await db.close();
  console.log("\n" + (fehler === 0 ? "Alle Prüfungen bestanden." : `${fehler} Fehler.`));
  process.exit(fehler === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
