/**
 * Lädt den Dienstplan und erinnert an offene Schichten.
 */

import { kommendeTermine } from "@/lib/ditix/spielplan";
import { isoDatum } from "@/lib/zeit";
import { offeneSchichtenMail } from "./mails";
import { abwesenheiten, istAbwesend, type Abwesenheit } from "./abwesend";
import {
  allePersonen,
  einstellungLesen,
  einsaetzeAb,
  erinnertMerken,
  festeTage,
  planBauen,
  schonImDienst,
  werKann,
  type Person,
  type Position,
  type Schicht,
} from "./plan";
import type { Vorstellungstermin } from "@/lib/ditix/spielplan";

/** Wie weit der Dienstplan in die Zukunft reicht. */
export const WOCHEN_VORAUS = 10;

export async function planLaden(
  wochen = WOCHEN_VORAUS,
): Promise<{ schichten: Schicht[]; personen: Person[]; abwesend: Abwesenheit[] }> {
  const bis = Date.now() + wochen * 7 * 86400000;
  const [termine, personen, fest, einsaetze, abwesend] = await Promise.all([
    kommendeTermine(400),
    allePersonen(),
    festeTage(),
    einsaetzeAb(isoDatum(new Date())),
    abwesenheiten(),
  ]);
  const schichten = planBauen(
    termine.filter((t) => t.beginn.getTime() <= bis),
    personen,
    fest,
    einsaetze,
  );
  return { schichten, personen, abwesend };
}

/** Tage bis zur Show, heute = 0. */
export function tageBis(datum: string, heute = isoDatum(new Date())): number {
  return Math.round((Date.parse(`${datum}T12:00:00Z`) - Date.parse(`${heute}T12:00:00Z`)) / 86400000);
}

/**
 * Stufe der Erinnerung: eine Woche vorher, drei Tage vorher, am Vortag.
 * Mehr nicht, damit es nicht nervt.
 */
export function faelligeStufe(tage: number): number {
  if (tage <= 1) return 3;
  if (tage <= 3) return 2;
  if (tage <= 7) return 1;
  return 0;
}

/** Offene Schichten, die diese Person übernehmen könnte (für die gelbe Leiste). */
export function offenFuer(
  schichten: Schicht[],
  p: Person,
  tage = 14,
  abwesend: Abwesenheit[] = [],
): Array<{ termin: Vorstellungstermin; position: Position }> {
  const liste: Array<{ termin: Vorstellungstermin; position: Position }> = [];
  for (const s of schichten) {
    if (tageBis(s.termin.datum) > tage) continue;
    // Wer an dem Tag im Urlaub ist, wird gar nicht erst gefragt.
    if (istAbwesend(abwesend, p.id, s.termin.datum)) continue;
    for (const slot of s.slots) {
      if (!slot.offen || slot.person?.id === p.id) continue;
      if (!werKann([p], slot.position).length) continue;
      if (schonImDienst(schichten, p.id, s.termin) && !slot.suchtErsatz) continue;
      liste.push({ termin: s.termin, position: slot.position });
    }
  }
  return liste;
}

/**
 * Der tägliche Lauf: Wer eine offene Schicht übernehmen könnte, bekommt
 * eine Mail, eine Woche, drei Tage und einen Tag vorher. Am Vortag geht
 * die Mail zusätzlich an die Chefs.
 */
export async function taeglicheErinnerung(): Promise<{ mails: number; schichten: number; fehler: string[] }> {
  const { schichten, personen, abwesend } = await planLaden(2);
  // Vor der Einrichtung wäre alles offen. Dann schweigen, statt Florian zuzuschütten.
  if (personen.every((p) => p.kann.size === 0)) return { mails: 0, schichten: 0, fehler: [] };
  // Bis zum 02.10.2026 trägt sich das Showteam über den Einladungslink ein.
  // Solange ist vieles nur scheinbar offen, deshalb erst danach erinnern
  // (oder früher, wenn Florian die festen Tage als vollständig markiert).
  const e = await einstellungLesen();
  if (!e.erledigt && e.festeTageFragen && isoDatum(new Date()) < e.festeTageFragen) {
    return { mails: 0, schichten: 0, fehler: [] };
  }
  const chefs = personen.filter((p) => p.rolle === "chef");
  const jePerson = new Map<string, { person: Person; schichten: Array<{ termin: Vorstellungstermin; position: Position }>; dringend: boolean }>();
  const zuMerken: Array<{ termin: Vorstellungstermin; position: Position; stufe: number }> = [];

  for (const s of schichten) {
    const stufe = faelligeStufe(tageBis(s.termin.datum));
    if (stufe === 0) continue;
    for (const slot of s.slots) {
      if (!slot.offen || slot.erinnertStufe >= stufe) continue;
      const an = werKann(personen, slot.position, slot.person?.id).filter(
        (p) => !schonImDienst(schichten, p.id, s.termin) && !istAbwesend(abwesend, p.id, s.termin.datum),
      );
      if (stufe === 3) for (const c of chefs) if (!an.some((p) => p.id === c.id)) an.push(c);
      if (an.length === 0) continue;
      for (const p of an) {
        const e = jePerson.get(p.id) ?? { person: p, schichten: [], dringend: false };
        e.schichten.push({ termin: s.termin, position: slot.position });
        e.dringend ||= stufe === 3;
        jePerson.set(p.id, e);
      }
      zuMerken.push({ termin: s.termin, position: slot.position, stufe });
    }
  }

  const fehler: string[] = [];
  for (const e of jePerson.values()) {
    fehler.push(...(await offeneSchichtenMail({ an: e.person, schichten: e.schichten, dringend: e.dringend })));
  }
  for (const m of zuMerken) await erinnertMerken(m.termin, m.position, m.stufe);
  return { mails: jePerson.size, schichten: zuMerken.length, fehler };
}
