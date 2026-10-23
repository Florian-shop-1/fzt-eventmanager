/**
 * Vorbereitete Antworten im WhatsApp-Posteingang.
 *
 * Der Eventmanager schreibt die Antwort und zieht den Code, abgeschickt
 * wird sie von einem Menschen: "bitte bau mal die version, dass wir
 * drübergucken" (Florian, 23.10.2026). Zwischen Vorbereiten und
 * Absenden liegt ein Seitenaufruf, deshalb braucht der Text einen Platz
 * in der Datenbank und nicht nur im Arbeitsspeicher.
 *
 * Je Unterhaltung genau ein Entwurf. Ein neuer ersetzt den alten, und
 * sobald geantwortet wurde, ist er weg.
 */

import { db } from "@/lib/db/client";

export interface WaEntwurf {
  text: string;
  anlass: string;
  codes: string;
  angelegtAm: string;
  angelegtVon: string;
}

export async function entwurfSpeichern(o: {
  waId: string;
  text: string;
  anlass: string;
  codes: string;
  von: string;
}): Promise<void> {
  await db()`
    insert into wa_entwurf (wa_id, text, anlass, codes, angelegt_von)
    values (${o.waId}, ${o.text}, ${o.anlass}, ${o.codes}, ${o.von})
    on conflict (wa_id) do update set
      text = excluded.text, anlass = excluded.anlass, codes = excluded.codes,
      angelegt_von = excluded.angelegt_von, angelegt_am = now()
  `;
}

export async function entwurfLesen(waId: string): Promise<WaEntwurf | null> {
  const z = (await db()`
    select text, anlass, codes, angelegt_am, angelegt_von
      from wa_entwurf where wa_id = ${waId}
  `.catch(() => [])) as Array<Record<string, unknown>>;
  const r = z[0];
  if (!r) return null;
  return {
    text: String(r.text ?? ""),
    anlass: String(r.anlass ?? ""),
    codes: String(r.codes ?? ""),
    angelegtAm: new Date(r.angelegt_am as string).toISOString(),
    angelegtVon: String(r.angelegt_von ?? ""),
  };
}

export async function entwurfLoeschen(waId: string): Promise<void> {
  await db()`delete from wa_entwurf where wa_id = ${waId}`.catch(() => undefined);
}
