/**
 * Die Belege eines Monats als PDF, zum Anschauen und Prüfen.
 * Aufruf: npx tsx scripts/belege-pdf-probe.ts 2026-09 fzt [Zieldatei]
 *
 * Nimmt die echten Belege aus der Datenbank, genau die, die auch ans
 * Steuerbüro gingen. So sieht man vor dem ersten Versand, was ankommt.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { belegeDerFirma, fotosZu, monatLesen } from "../src/lib/bewirtung/monat";
import { belegeMonatsPdf } from "../src/lib/bewirtung/pdf-monat";
import { gesellschaftName, istGesellschaft } from "../src/lib/bewirtung/gesellschaft";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

async function los(): Promise<void> {
  const mo = monatLesen(process.argv[2]);
  const g = process.argv[3] ?? "fzt";
  if (!mo || !istGesellschaft(g)) {
    console.error("Aufruf: npx tsx scripts/belege-pdf-probe.ts 2026-09 fzt|magic-expert|true-talent");
    process.exit(1);
  }

  const belege = await belegeDerFirma(mo.jahr, mo.monat, g);
  console.log(`${belege.length} Belege der ${gesellschaftName(g)} im ${MONATE[mo.monat - 1]} ${mo.jahr}`);

  const fotos = await fotosZu(belege);
  console.log(`${fotos.size} Fotos geladen`);

  const pdf = await belegeMonatsPdf({
    gesellschaft: g,
    monatName: `${MONATE[mo.monat - 1]} ${mo.jahr}`,
    belege,
    fotos,
  });

  const ziel = process.argv[4] ?? path.join(process.cwd(), `belege-probe-${g}-${process.argv[2]}.pdf`);
  await writeFile(ziel, pdf);
  console.log(`Geschrieben: ${ziel} (${Math.round(pdf.length / 1024)} KB)`);
}

los().catch((f) => {
  console.error(f);
  process.exit(1);
});
