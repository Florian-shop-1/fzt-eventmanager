/**
 * Woran der Hase das Showteam erinnert: die Checklisten.
 *
 * "es sieht so aus, als wäre die checkliste von der show nicht
 * verwendet worden für nach der show, und foh hat sie gestern gar nicht
 * genutzt" (Florian, 12.10.2026). Eine Liste, die niemand abhakt, ist
 * keine Liste, und sie verbessert sich auch nicht: Was fehlt, fällt nur
 * dem auf, der sie benutzt.
 *
 * Erinnert wird deshalb nur, wenn es an diesem Tag wirklich etwas
 * abzuhaken gibt, und nur an Showtagen. Eine Erinnerung an einem freien
 * Dienstag lernt man wegzuklicken.
 */

import { db } from "@/lib/db/client";
import { termineDesTages } from "@/lib/ditix/spielplan";

export interface Checklistenstand {
  /** Die Vorstellung, um die es geht. */
  ditixEventId: string;
  /** Offene Punkte je Liste. */
  show: number;
  foh: number;
}

function heuteBerlin(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/**
 * Hat diese Person heute nur den eingeweihten Zuschauer?
 *
 * "achtung, Noël ist Zuschauer, die Zuschauer-Position muss nicht auf
 * die Checklisten zugreifen können" (Florian, 12.10.2026). Wer in
 * Reihe 4 sitzt, hakt nichts ab, und eine Erinnerung, die einen nicht
 * betrifft, bringt man sich bei wegzuklicken.
 *
 * Gefragt wird nach beiden Quellen des Dienstplans: dem Eintrag für
 * den Abend und den festen Tagen.
 */
async function nurZuschauer(benutzerId: string, datum: string): Promise<boolean> {
  const z = (await db()`
    select position from dienst_einsatz
     where benutzer_id = ${benutzerId}::uuid and datum = ${datum}::date
     union all
    select f.position from dienst_fest f
     where f.benutzer_id = ${benutzerId}::uuid
       and (f.wochentag is null or f.wochentag = extract(dow from ${datum}::date))
       and not exists (
         select 1 from dienst_einsatz e
          where e.datum = ${datum}::date and e.position = f.position
       )
  `.catch(() => [])) as Array<{ position: string }>;
  // Keine Zeile heißt nicht "Zuschauer": Dann wissen wir es nicht, und
  // der Hinweis darf kommen.
  if (z.length === 0) return false;
  return z.every((r) => r.position === "ZUSCHAUER");
}

/**
 * Was heute noch offen ist, oder null.
 *
 * Gezählt wird für die erste Vorstellung des Tages: Laufen zwei, hat
 * jede ihre eigenen Haken, und die zweite fängt ohnehin später an.
 */
export async function offeneChecklisten(benutzerId: string): Promise<Checklistenstand | null> {
  const heute = heuteBerlin();
  const termine = await termineDesTages(heute).catch(() => []);
  if (termine.length === 0) return null;
  if (await nurZuschauer(benutzerId, heute)) return null;

  // Die Vorstellung, die als nächste dran ist, sonst die letzte des Tages.
  const jetzt = Date.now();
  const naechste = termine.find((t) => t.beginn.getTime() + 60 * 60000 > jetzt) ?? termine[termine.length - 1];

  const z = (await db()`
    select p.liste, count(*)::int as offen
      from showcheck_punkt p
      left join showcheck_haken h
        on h.punkt_id = p.id and h.ditix_event_id = ${naechste.ditixEventId}
     where p.aktiv and p.liste in ('show', 'foh') and h.punkt_id is null
     group by p.liste
  `.catch(() => [])) as Array<{ liste: string; offen: number }>;

  const show = Number(z.find((r) => r.liste === "show")?.offen ?? 0);
  const foh = Number(z.find((r) => r.liste === "foh")?.offen ?? 0);
  if (show === 0 && foh === 0) return null;

  return { ditixEventId: naechste.ditixEventId, show, foh };
}
