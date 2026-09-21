/**
 * Die gelbe Leiste (und einmal am Tag der Hase) für den Dienstplan:
 *  - wer eine offene Schicht übernehmen könnte, sieht sie auf jeder Seite
 *  - Florian wird ab dem 02.10.2026 gefragt, welche Tage noch fest sind
 */

import type { AngemeldeterBenutzer } from "@/lib/auth/sitzung";
import type { Erinnerung } from "@/components/Erinnerungen";
import { db } from "@/lib/db/client";
import { isoDatum } from "@/lib/zeit";
import { offenFuer, planLaden, tageBis } from "./laden";
import { BEZEICHNUNG, einstellungLesen } from "./plan";

export async function dienstplanErinnerungen(b: AngemeldeterBenutzer): Promise<Erinnerung[]> {
  const aufgaben: Erinnerung[] = [];

  if (b.rolle === "chef") {
    const e = await einstellungLesen();
    if (!e.erledigt && e.festeTageFragen && isoDatum(new Date()) >= e.festeTageFragen) {
      aufgaben.push({
        href: "/dienstplan/einrichtung",
        leiste: "Dienstplan: Welche Tage sind bei T1 und T2 fest vergeben?",
        knopf: "Feste Tage eintragen",
        hase: "Du wolltest nach zwei Wochen gefragt werden: Welche Tage sind im Showteam noch fest? Dann steht der Plan von allein.",
      });
    }
  }

  // Nur wer eine Position hat, muss den Plan laden.
  // Florian: erst, wenn überhaupt jemand eine Position hat, sonst wäre vor der Einrichtung alles offen.
  const hat = (await db()`
    select 1 from dienst_quali where ${b.rolle === "chef"} or benutzer_id = ${b.id} limit 1
  `) as unknown[];
  if (hat.length === 0) return aufgaben;

  const { schichten, personen } = await planLaden(3);
  const ich = personen.find((p) => p.id === b.id);

  if (ich && ich.kann.size > 0) {
    const offen = offenFuer(schichten, ich, 14);
    if (offen.length > 0) {
      const erste = offen[0];
      const wann = tageBis(erste.termin.datum);
      aufgaben.push({
        href: "/dienstplan",
        leiste:
          offen.length === 1
            ? `Für ${wann === 0 ? "heute" : wann === 1 ? "morgen" : erste.termin.datum.split("-").reverse().join(".")} wird noch jemand für ${BEZEICHNUNG[erste.position]} gesucht.`
            : `Im Dienstplan sind ${offen.length} Schichten offen, die du übernehmen könntest.`,
        knopf: "Ansehen",
        hase: "Im Dienstplan wird jemand gesucht. Kannst du einspringen? Ein Klick reicht!",
      });
    }
  } else if (b.rolle === "chef") {
    const bald = schichten.filter((s) => tageBis(s.termin.datum) <= 3 && s.slots.some((x) => x.offen));
    if (bald.length > 0) {
      aufgaben.push({
        href: "/dienstplan",
        leiste: `Dienstplan: In den nächsten drei Tagen ${bald.length === 1 ? "ist eine Show" : `sind ${bald.length} Shows`} nicht voll besetzt.`,
        knopf: "Ansehen",
        hase: "Im Dienstplan ist in den nächsten Tagen noch etwas offen.",
      });
    }
  }
  return aufgaben;
}
