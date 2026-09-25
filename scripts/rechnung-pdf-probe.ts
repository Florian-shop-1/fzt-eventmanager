/**
 * Eine Musterrechnung als PDF, zum Anschauen des Layouts.
 * Aufruf: npx tsx scripts/rechnung-pdf-probe.ts [Zieldatei]
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { rechnungsPdfEvent } from "../src/lib/rechnung/pdf-event";
import { probeAngebot } from "../src/lib/angebot/pdfdaten";
import { RESERVIERUNGSHINWEIS, ZAHLUNGSZIEL_TAGE } from "../src/lib/rechnung/aus-angebot";

async function los(): Promise<void> {
  const ziel = process.argv[2] ?? path.join(process.cwd(), "rechnung-probe.pdf");
  const angebot = await probeAngebot();

  const heute = new Date();
  const faellig = new Date(heute.getTime() + ZAHLUNGSZIEL_TAGE * 86400_000);

  const pdf = await rechnungsPdfEvent({
    nummer: "RE-0926-0001",
    rechnungsdatum: heute.toISOString().slice(0, 10),
    faelligAm: faellig.toISOString().slice(0, 10),
    zahlungszielTage: ZAHLUNGSZIEL_TAGE,
    leistung: "Veranstaltung am 15.01.2027, ULMfassbar by Florian Zimmer",
    leistungszeitpunkt: "2027-01-15",
    kunde: angebot.kunde,
    // Optionale Positionen hat der Kunde nicht genommen.
    positionen: angebot.positionen.filter((p) => !p.istAlternativeZu),
    hinweis: RESERVIERUNGSHINWEIS,
    absender: angebot.absender,
  });

  await writeFile(ziel, pdf);
  console.log("Geschrieben:", ziel);
}

los().catch((f) => {
  console.error(f);
  process.exit(1);
});
