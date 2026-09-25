/**
 * Was bringt ein volles Haus an Kartenerlösen?
 *
 * Rechnet für den nächsten Donnerstag-, Freitag- und Samstagabend
 * zusammen: Sitze je Kategorie mal Preis je Kategorie an genau diesem
 * Abend. Die Preise kommen aus dem Shop, nicht aus einer Liste im Kopf,
 * denn sie sind je Termin verschieden.
 *
 * Nur Karten. Menü, Getränke und Extras stehen bewusst nicht darin.
 *
 * Aufruf: npx tsx scripts/vollhaus.ts
 */

import "dotenv/config";
import { kommendeTermine } from "@/lib/ditix/spielplan";
import { holeSaalplan } from "@/lib/ditix/saalplan";
import { preiseDerVorstellung } from "@/lib/ditix/preise";

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const euro = (c: number) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " EUR";

async function rechne(t: Awaited<ReturnType<typeof kommendeTermine>>[number]) {
  if (!t.seatmapEventId) return;
  const plan = await holeSaalplan(t.seatmapEventId);
  // Der Shop antwortet gelegentlich mit 502, deshalb ein zweiter Anlauf.
  let preise;
  try {
    preise = await preiseDerVorstellung(t.ditixEventId);
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    preise = await preiseDerVorstellung(t.ditixEventId);
  }

  const tag = WOCHENTAG[new Date(`${t.datum}T12:00:00`).getDay()];
  console.log(`\n=== ${tag}, ${t.datum} ${t.uhrzeit} — ${t.name} ===`);

  const proKategorie = new Map<string, { verkaufbar: number; gesperrt: number }>();
  for (const s of plan.sitze) {
    const e = proKategorie.get(s.kategorie) ?? { verkaufbar: 0, gesperrt: 0 };
    if (s.status === "gesperrt") e.gesperrt += 1;
    else e.verkaufbar += 1;
    proKategorie.set(s.kategorie, e);
  }

  console.log("Preise laut Shop (Saalplan):");
  for (const p of preise.filter((p) => p.ueberSaalplan)) {
    console.log(`  ${p.name}: ${euro(p.bruttoCent)}`);
  }
  console.log("Weitere Ticketarten:");
  for (const p of preise.filter((p) => !p.ueberSaalplan)) {
    console.log(`  ${p.name}: ${euro(p.bruttoCent)}`);
  }

  let summe = 0;
  let plaetze = 0;
  let gesperrtGesamt = 0;
  console.log("Kategorien im Saalplan:");
  for (const [kat, z] of [...proKategorie].sort()) {
    const gleich = (x: string) => x.toLowerCase().replace(/[.\s]/g, "");
    const preis =
      preise.find((p) => gleich(p.name) === gleich(kat)) ??
      preise.find((p) => gleich(p.name).startsWith(gleich(kat)) && !/kids/i.test(p.name));
    /*
      Die VIP Empore hat in Ditix keinen Preis: Die Online-Ticketart ist
      an jedem geprueften Termin inaktiv, hinterlegt sind 0 Euro, aktiv
      ist nur die POS-Variante fuer den Verkauf an der Kasse. Verkauft
      wird sie trotzdem, und zwar immer zum Preis der Golden Seats
      (Florian, 23.09.2026). Genau so rechnen wir hier.
    */
    const golden = preise.find((p) => /^golden seats$/i.test(p.name.trim()))?.bruttoCent ?? 0;
    const cent = preis?.bruttoCent ?? (/empore/i.test(kat) ? golden : 0);
    summe += cent * z.verkaufbar;
    plaetze += z.verkaufbar;
    gesperrtGesamt += z.gesperrt;
    console.log(
      `  ${kat.padEnd(18)} ${String(z.verkaufbar).padStart(3)} Plätze` +
        (z.gesperrt ? ` (+${z.gesperrt} gesperrt)` : "") +
        ` x ${cent ? euro(cent) : "KEIN PREIS IN DITIX"}` +
        (cent ? ` = ${euro(cent * z.verkaufbar)}` : ""),
    );
  }
  console.log(`  ------`);
  console.log(`  ${plaetze} verkaufbare Plätze, ${gesperrtGesamt} gesperrt`);
  console.log(`  VOLLHAUS: ${euro(summe)}`);
}

async function main() {
  const termine = await kommendeTermine(200);
  const abends = termine.filter((t) => Number(t.uhrzeit.slice(0, 2)) >= 17);

  for (const wunsch of [4, 5, 6]) {
    const t = abends.find((x) => new Date(`${x.datum}T12:00:00`).getDay() === wunsch);
    if (!t) {
      console.log(`\nKein ${WOCHENTAG[wunsch]}abend im Spielplan.`);
      continue;
    }
    await rechne(t);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
