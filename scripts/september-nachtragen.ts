/**
 * September 2026 aus dem alten Stempelsystem übernehmen.
 *
 * Florian, 01.10.2026: "bitte bei Olena diese Zeiten nachtragen (sind aus
 * dem alten Stempelsystem) ist wichtig wg. arbeitszeitkonto September"
 * und, zur Stundenliste von Ben: "das bitte auch im neuen nachtragen. es
 * kann sein dass er auch mal ein tag doppelt gestempelt hatte."
 *
 * Die alte Liste nennt je Tag nur die erste und die letzte Zeit, dazu die
 * tatsächlich gearbeiteten Stunden. Wo beides auseinanderfällt, lag eine
 * Pause oder eine Unterbrechung dazwischen; sie wird als Pause mitten in
 * den Tag gelegt, damit unter dem Strich genau die Stunden stehen, die
 * die alte Liste ausweist. Die Summe stimmt dadurch auf die Minute, die
 * Lage der Pause ist eine Annahme, und genau das steht auch als Grund an
 * jedem Stempel.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import type { StempelArt } from "@/lib/stempel/db";
import { nachtragen, stempelnde, stempelAmTag } from "@/lib/stempel/db";

const VON = "Florian Zimmer";

/** Hiesige Zeit; der ganze September liegt in der Sommerzeit. */
const ZONE = "+02:00";

interface Tag {
  /** JJJJ-MM-TT */
  tag: string;
  von: string;
  bis: string;
  /** Gearbeitete Zeit laut alter Liste, "H:MM". Fehlt sie, ist es die Spanne. */
  ist?: string;
  /** Feste Pause, wenn sie bekannt ist. */
  pause?: { von: string; bis: string };
}

const BEN: Tag[] = [
  { tag: "2026-09-08", von: "16:35", bis: "23:01", ist: "5:57" },
  { tag: "2026-09-09", von: "14:59", bis: "21:30" },
  { tag: "2026-09-10", von: "15:52", bis: "19:56" },
  { tag: "2026-09-11", von: "16:54", bis: "19:31" },
  { tag: "2026-09-12", von: "08:28", bis: "19:18", ist: "9:04" },
  { tag: "2026-09-13", von: "14:17", bis: "17:19" },
  { tag: "2026-09-17", von: "16:42", bis: "21:34" },
  { tag: "2026-09-18", von: "16:31", bis: "22:54" },
  { tag: "2026-09-19", von: "12:46", bis: "22:54", ist: "9:39" },
  { tag: "2026-09-20", von: "12:38", bis: "17:51" },
  { tag: "2026-09-24", von: "16:36", bis: "19:16" },
  { tag: "2026-09-25", von: "17:29", bis: "23:01" },
];

const OLENA: Tag[] = [
  { tag: "2026-09-12", von: "14:30", bis: "18:00" },
  // Zwei Blöcke an einem Tag; die 40 Minuten dazwischen sind die Pause.
  { tag: "2026-09-19", von: "13:30", bis: "23:00", pause: { von: "18:10", bis: "18:50" } },
  { tag: "2026-09-20", von: "13:00", bis: "19:00" },
];

const LEUTE: Array<{ suche: RegExp; tage: Tag[] }> = [
  { suche: /shchudlo|benjamin|\bben\b/i, tage: BEN },
  { suche: /olena/i, tage: OLENA },
];

function minuten(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function uhr(min: number): string {
  const h = Math.floor(min / 60);
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Die vier (oder zwei) Stempel eines Tages, in der Reihenfolge des Tages. */
function stempelDesTages(t: Tag): Array<{ art: StempelArt; uhrzeit: string }> {
  const von = minuten(t.von);
  const bis = minuten(t.bis);
  const spanne = bis - von;
  const ist = t.ist ? minuten(t.ist) : spanne;
  const pause = t.pause ? minuten(t.pause.bis) - minuten(t.pause.von) : spanne - ist;

  if (pause <= 0) {
    return [
      { art: "kommen", uhrzeit: t.von },
      { art: "gehen", uhrzeit: t.bis },
    ];
  }

  // Ohne bekannte Lage liegt die Pause in der Mitte des Tages.
  const start = t.pause ? minuten(t.pause.von) : von + Math.round((spanne - pause) / 2);
  return [
    { art: "kommen", uhrzeit: t.von },
    { art: "pause_start", uhrzeit: uhr(start) },
    { art: "pause_ende", uhrzeit: uhr(start + pause) },
    { art: "gehen", uhrzeit: t.bis },
  ];
}

async function main(): Promise<void> {
  const alle = await stempelnde();

  for (const eintrag of LEUTE) {
    const treffer = alle.filter((p) => eintrag.suche.test(p.name));
    if (treffer.length !== 1) {
      console.error(`Übersprungen, nicht eindeutig: ${eintrag.suche} → ${treffer.map((p) => p.name).join(", ") || "niemand"}`);
      continue;
    }
    const person = treffer[0];
    console.log(`\n${person.name}`);

    for (const t of eintrag.tage) {
      const da = await stempelAmTag(person.id, t.tag);
      for (const s of stempelDesTages(t)) {
        const zeitpunkt = `${t.tag}T${s.uhrzeit}:00${ZONE}`;
        const soll = new Date(zeitpunkt).getTime();
        if (da.some((x) => x.art === s.art && Math.abs(new Date(x.zeitpunkt).getTime() - soll) < 60_000)) {
          console.log(`  schon da:     ${t.tag} ${s.uhrzeit} ${s.art}`);
          continue;
        }
        await nachtragen({
          benutzerId: person.id,
          art: s.art,
          zeitpunkt,
          von: VON,
          grund:
            t.ist && !t.pause
              ? `Übernahme aus dem alten Stempelsystem, September. Laut alter Liste ${t.von} bis ${t.bis}, gearbeitet ${t.ist}; die Pause ist der Länge nach bekannt, der Lage nach angenommen.`
              : "Übernahme aus dem alten Stempelsystem, September.",
        });
        console.log(`  eingetragen:  ${t.tag} ${s.uhrzeit} ${s.art}`);
      }
    }

    const tage = [...new Set(eintrag.tage.map((t) => t.tag))];
    let summe = 0;
    for (const tag of tage) {
      const s = await stempelAmTag(person.id, tag);
      let offen: number | null = null;
      let pause: number | null = null;
      let min = 0;
      for (const x of s.sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt))) {
        const t = new Date(x.zeitpunkt).getTime() / 60000;
        if (x.art === "kommen") offen = t;
        if (x.art === "pause_start") pause = t;
        if (x.art === "pause_ende" && pause !== null) {
          min -= t - pause;
          pause = null;
        }
        if (x.art === "gehen" && offen !== null) {
          min += t - offen;
          offen = null;
        }
      }
      summe += min;
      console.log(`  ${tag}: ${uhr(Math.round(min))} Std`);
    }
    console.log(`  Summe: ${uhr(Math.round(summe))} Std`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
