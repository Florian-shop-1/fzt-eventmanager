/**
 * Prüft, ob der lexoffice-Schlüssel funktioniert.
 * Aufruf: npm run lexoffice:test
 *
 * Fragt nur das eigene Profil ab, ändert also nichts. Zusätzlich wird
 * geprüft, ob der Schlüssel Angebote anlegen darf. Ältere Schlüssel
 * dürfen das nicht, und das fällt sonst erst beim ersten Angebot auf.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { LexofficeFehler, holeProfil, lexoffice } from "../src/lib/lexoffice/client";

async function main() {
  if (!process.env.LEXOFFICE_API_KEY) {
    console.error(
      "\nEs ist kein Schlüssel hinterlegt.\n\n" +
        "So geht es:\n" +
        "  1. https://app.lexware.de/addons/public-api aufrufen\n" +
        "  2. Auf 'API-Schlüssel erstellen' klicken\n" +
        "  3. Schlüssel kopieren\n" +
        "  4. Doppelklick auf 'Lexoffice verbinden.cmd' im Projektordner\n",
    );
    process.exit(1);
  }

  console.log("Verbinde mit Lexware Office...\n");

  try {
    const profil = await holeProfil();
    console.log("  Verbindung steht.");
    console.log(`  Firma:        ${profil.companyName}`);
    console.log(`  Besteuerung:  ${profil.taxType}`);
    console.log(`  Kleinunternehmer: ${profil.smallBusiness ? "ja" : "nein"}`);
  } catch (e) {
    if (e instanceof LexofficeFehler) {
      console.error(`  Fehler ${e.status}: ${e.message}`);
    } else {
      console.error("  " + (e instanceof Error ? e.message : String(e)));
    }
    process.exit(1);
  }

  // Darf der Schlüssel Angebote? Nur lesend prüfen, es wird nichts angelegt.
  console.log("\nPrüfe Berechtigung für Angebote...");
  try {
    await lexoffice("/v1/quotations/00000000-0000-0000-0000-000000000000");
    console.log("  Angebote sind freigegeben.");
  } catch (e) {
    if (e instanceof LexofficeFehler && e.status === 404) {
      // 404 heißt: Zugriff erlaubt, dieses eine Angebot gibt es nur nicht.
      console.log("  Angebote sind freigegeben.");
    } else if (e instanceof LexofficeFehler && (e.status === 403 || e.status === 401)) {
      console.error(
        "  Dieser Schlüssel darf keine Angebote anlegen.\n" +
          "  Bitte unter https://app.lexware.de/addons/public-api einen NEUEN\n" +
          "  Schlüssel erzeugen. Schlüssel, die vor der Einführung der\n" +
          "  Angebots-Schnittstelle erstellt wurden, haben diese Berechtigung nicht.",
      );
      process.exit(1);
    } else {
      console.error("  " + (e instanceof Error ? e.message : String(e)));
      process.exit(1);
    }
  }

  console.log("\nAlles bereit. Das Programm kann Angebote in lexoffice anlegen.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
