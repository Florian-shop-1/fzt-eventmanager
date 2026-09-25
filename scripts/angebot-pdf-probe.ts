/**
 * Ein Musterangebot als PDF erzeugen, zum Anschauen des Layouts.
 *
 * Aufruf: npm run pdf:probe [Zieldatei]
 *
 * Der Absender kommt aus der Einstellung, wenn eine Datenbank erreichbar
 * ist, sonst aus dem Notnagel in pdfdaten.ts. Die echten Pflichtangaben
 * stehen nur in der Einstellung, nie im Code.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { angebotsPdf } from "../src/lib/angebot/pdf";
import { probeAngebot } from "../src/lib/angebot/pdfdaten";

async function los(): Promise<void> {
  const ziel = process.argv[2] ?? path.join(process.cwd(), "angebot-probe.pdf");
  // Zweites Argument: "fingerfood" fuer die sparsame Fassung.
  const fassung = process.argv[3] === "fingerfood" ? "fingerfood" : "finedining";
  const daten = await probeAngebot(fassung);
  await writeFile(ziel, await angebotsPdf(daten));
  console.log("Geschrieben:", ziel);
}

los().catch((f) => {
  console.error(f);
  process.exit(1);
});
