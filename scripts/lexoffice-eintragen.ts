/**
 * Trägt den lexoffice-Schlüssel in die Datei .env.local ein.
 * Wird von "Lexoffice verbinden.cmd" aufgerufen.
 *
 * Der Schlüssel kommt als Argument herein und wird nie ausgegeben,
 * auch nicht gekürzt.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATEI = join(process.cwd(), ".env.local");
const ZEILE = "LEXOFFICE_API_KEY";

function main() {
  const schluessel = (process.argv[2] ?? "").trim();

  if (!schluessel) {
    console.error("Kein Schlüssel angegeben. Abbruch, nichts geändert.");
    process.exit(1);
  }

  // Grobe Plausibilitätsprüfung, damit ein versehentlich kopierter
  // Satz oder eine halbe Zeile nicht stillschweigend landet.
  if (schluessel.length < 20 || /\s/.test(schluessel)) {
    console.error(
      "Das sieht nicht nach einem Schlüssel aus (zu kurz oder enthält Leerzeichen).\n" +
        "Bitte den kompletten Schlüssel aus lexoffice kopieren. Nichts geändert.",
    );
    process.exit(1);
  }

  let inhalt = existsSync(DATEI) ? readFileSync(DATEI, "utf8") : "";

  if (new RegExp(`^${ZEILE}=`, "m").test(inhalt)) {
    inhalt = inhalt.replace(new RegExp(`^${ZEILE}=.*$`, "m"), `${ZEILE}=${schluessel}`);
    console.log("Vorhandener Eintrag wurde ersetzt.");
  } else {
    if (inhalt.length > 0 && !inhalt.endsWith("\n")) inhalt += "\n";
    inhalt += `\n# Lexware Office (frueher lexoffice), erzeugt unter\n`;
    inhalt += `# https://app.lexware.de/addons/public-api\n`;
    inhalt += `${ZEILE}=${schluessel}\n`;
    console.log("Schlüssel wurde eingetragen.");
  }

  writeFileSync(DATEI, inhalt, "utf8");
  console.log("Gespeichert in .env.local (wird nicht in Git aufgenommen).");
}

main();
