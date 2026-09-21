/**
 * Wohin der Einlass eine Gruppe tatsächlich gesetzt hat.
 * Siehe migrations/060_upgrade_umsetzung.sql.
 *
 * Der Vorschlag auf der Upgrade-Seite ist eine Empfehlung. Am Einlass
 * kommt es anders: Eine Gruppe ist zu fünft statt zu viert, jemand will
 * lieber am Rand sitzen, eine andere Gruppe ist gar nicht erst da. Was
 * am Ende gilt, tippt der Mitarbeiter am Tablet ein.
 *
 * In Ditix wird dabei nichts geändert. Das hier ist unsere eigene Notiz
 * für den Abend, damit später niemand raten muss, wer wo saß.
 */

import { db } from "@/lib/db/client";

export interface Umsetzung {
  schluessel: string;
  art: "gruppe" | "gast";
  quelleText: string;
  zielText: string;
  zielIds: number[];
  personen: number;
  /** Name des Gastes, falls der Einlass ihn mitgeschrieben hat. */
  gastName: string;
  gesetztVon: string | null;
  gesetztAm: string;
}

function baue(z: Record<string, unknown>): Umsetzung {
  return {
    schluessel: String(z.schluessel),
    art: z.art as "gruppe" | "gast",
    quelleText: String(z.quelle_text ?? ""),
    zielText: String(z.ziel_text),
    zielIds: ((z.ziel_ids as number[]) ?? []).map(Number),
    personen: Number(z.personen ?? 0),
    gastName: String(z.gast_name ?? ""),
    gesetztVon: (z.gesetzt_von as string) ?? null,
    gesetztAm: new Date(z.gesetzt_am as string).toISOString(),
  };
}

export async function umsetzungenDerVorstellung(ditixEventId: string): Promise<Umsetzung[]> {
  try {
    const z = (await db()`
      select * from upgrade_umsetzung where ditix_event_id = ${ditixEventId} order by gesetzt_am
    `) as Array<Record<string, unknown>>;
    return z.map(baue);
  } catch (e) {
    console.warn("[upgrade] Umsetzungen nicht lesbar:", e);
    return [];
  }
}

export async function umsetzungSpeichern(o: {
  ditixEventId: string;
  schluessel: string;
  art: "gruppe" | "gast";
  quelleText: string;
  zielText: string;
  zielIds: number[];
  personen: number;
  gastName?: string;
  von: string;
}): Promise<void> {
  await db()`
    insert into upgrade_umsetzung
      (ditix_event_id, schluessel, art, quelle_text, ziel_text, ziel_ids, personen, gast_name, gesetzt_von, gesetzt_am)
    values (${o.ditixEventId}, ${o.schluessel}, ${o.art}, ${o.quelleText}, ${o.zielText},
            ${o.zielIds}::bigint[], ${o.personen}, ${o.gastName ?? ""}, ${o.von}, now())
    on conflict (ditix_event_id, schluessel) do update set
      ziel_text = excluded.ziel_text, ziel_ids = excluded.ziel_ids, personen = excluded.personen,
      quelle_text = excluded.quelle_text, gast_name = excluded.gast_name,
      gesetzt_von = excluded.gesetzt_von, gesetzt_am = now()
  `;
}

export async function umsetzungEntfernen(ditixEventId: string, schluessel: string): Promise<void> {
  await db()`
    delete from upgrade_umsetzung where ditix_event_id = ${ditixEventId} and schluessel = ${schluessel}
  `;
}
