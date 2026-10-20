/**
 * Die in Ditix abgelesene Sitzzuordnung einlesen.
 *
 *   npx tsx scripts/ditix-sitzgruppen-einlesen.ts daten/ditix-sitzgruppen/<datei>.json
 *
 * Die Dateien entstehen beim Durchgehen der Ditix-Verwaltung. Reines
 * Einlesen in unsere eigene Tabelle; in Ditix wird nichts angefasst.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
config({ path: [".env.local", ".env"], quiet: true });

interface Datei {
  ditixEventId: string;
  wann?: string;
  bestellungen: Array<{ bestellung: string; name?: string; sitze: string[] }>;
}

async function main() {
  const pfad = process.argv[2];
  if (!pfad) return console.error("Welche Datei?");
  const d = JSON.parse(readFileSync(pfad, "utf8")) as Datei;

  const { sitzgruppenSpeichern } = await import("../src/lib/db/ditix-sitzgruppen");
  const zeilen = d.bestellungen.flatMap((b) =>
    b.sitze.map((s) => {
      const [sektor, reihe, platz] = s.split("|");
      return { sektor, reihe, platz, bestellung: b.bestellung, name: b.name ?? null };
    }),
  );
  const n = await sitzgruppenSpeichern(d.ditixEventId, zeilen);
  console.log(`${d.wann ?? d.ditixEventId}: ${n} Plaetze aus ${d.bestellungen.length} Bestellungen gesichert.`);
}
void main();
