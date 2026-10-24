/**
 * Probe: Trennt die Upgrade-Rechnung die Gruppen nach Buchung?
 * Aufruf: npx tsx scripts/gruppenprobe.ts
 *
 * Ein Saal aus acht Reihen. In der letzten Reihe sitzen zwei Paare
 * nebeneinander, aus zwei verschiedenen Buchungen. Erwartet: zwei Gruppen
 * mit je zwei Gaesten, nicht eine mit vier.
 */
import type { Saalplan, Sitz } from "../src/lib/ditix/saalplan";
import { empfehlung } from "../src/lib/seating/upgrade";

const REIHEN = 8;
const PLAETZE = 16;

function saal(verkauft: Array<{ reihe: number; platz: number }>): Saalplan {
  const sitze: Sitz[] = [];
  let id = 1;
  for (let r = 1; r <= REIHEN; r++) {
    for (let p = 1; p <= PLAETZE; p++) {
      const istVerkauft = verkauft.some((v) => v.reihe === r && v.platz === p);
      sitze.push({
        id: id++,
        name: String(p),
        reihe: String(r),
        sektor: "Kat. 1",
        sperrgrund: null,
        kategorie: "Kat. 1",
        x: p * 10,
        y: r * 10,
        status: istVerkauft ? "verkauft" : "frei",
      });
    }
  }
  return { sitze, hintergrund: null, frei: sitze.filter((s) => s.status === "frei").length } as Saalplan;
}

const plan = saal([
  { reihe: 8, platz: 7 },
  { reihe: 8, platz: 8 },
  { reihe: 8, platz: 9 },
  { reihe: 8, platz: 10 },
]);

const schluessel = (r: number, p: number) => `Kat. 1|${r}|${p}`;
const zweiPaare = new Map<string, string>([
  [schluessel(8, 7), "FZT-A"],
  [schluessel(8, 8), "FZT-A"],
  [schluessel(8, 9), "FZT-B"],
  [schluessel(8, 10), "FZT-B"],
]);

for (const [was, karte] of [
  ["ohne Buchungen (wie zu Ditix-Zeiten)", undefined],
  ["mit Buchungen aus FloTix", zweiPaare],
] as const) {
  const rat = empfehlung(plan, karte);
  const groessen = rat.umzuege.map((u) => u.gruppe.sitze.length);
  const bleiben = rat.bleiben.map((b) => b.sitze.length);
  console.log(
    `${was}: ${rat.umzuege.length} Umzuege mit Groessen [${groessen.join(", ")}]` +
      (bleiben.length ? `, bleiben [${bleiben.join(", ")}]` : "") +
      `, Gaeste gesamt ${rat.gaeste}`,
  );
}
