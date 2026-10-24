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

/**
 * Wie stark der Text geändert wurde, grob in Prozent.
 *
 * Kein Diff-Werkzeug, nur ein Maß: gleicher Anfang, gleiches Ende, der
 * Rest gilt als geändert. Für die Frage "Kleinigkeit oder neu
 * geschrieben" reicht das, und es bleibt nachvollziehbar.
 */
export function abweichung(entwurf: string, gesendet: string): number {
  const a = entwurf.trim();
  const b = gesendet.trim();
  if (!a || !b) return b ? 100 : 0;
  if (a === b) return 0;

  let vorn = 0;
  while (vorn < a.length && vorn < b.length && a[vorn] === b[vorn]) vorn += 1;
  let hinten = 0;
  while (
    hinten < a.length - vorn &&
    hinten < b.length - vorn &&
    a[a.length - 1 - hinten] === b[b.length - 1 - hinten]
  ) {
    hinten += 1;
  }
  const geaendert = Math.max(a.length - vorn - hinten, b.length - vorn - hinten);
  return Math.max(1, Math.min(100, Math.round((geaendert / Math.max(a.length, b.length)) * 100)));
}

/**
 * Entwurf und gesendeten Text nebeneinander festhalten.
 *
 * "dokumentierst du mit, was wir verändern in der antwortnachricht"
 * (Florian, 24.10.2026). Daraus lässt sich in einer Woche ablesen, wo
 * die Vorlage danebenliegt.
 */
export async function lernenMitschreiben(o: {
  waId: string;
  entwurf: WaEntwurf;
  gesendet: string;
  wer: string;
}): Promise<void> {
  await db()`
    insert into wa_entwurf_lernen (wa_id, anlass, codes, entwurf, gesendet, abweichung, wer, vorbereitet_am)
    values (${o.waId}, ${o.entwurf.anlass}, ${o.entwurf.codes}, ${o.entwurf.text}, ${o.gesendet},
            ${abweichung(o.entwurf.text, o.gesendet)}, ${o.wer}, ${o.entwurf.angelegtAm}::timestamptz)
  `.catch((f) => console.warn("[whatsapp] Mitschrift nicht gespeichert:", f));
}

export interface LernZeile {
  waId: string;
  anlass: string;
  codes: string;
  entwurf: string;
  gesendet: string;
  abweichung: number;
  wer: string;
  am: string;
}

/** Die Mitschrift, neueste zuerst. */
export async function lernenLesen(grenze = 50): Promise<LernZeile[]> {
  const z = (await db()`
    select wa_id, anlass, codes, entwurf, gesendet, abweichung, wer, am
      from wa_entwurf_lernen order by am desc limit ${grenze}
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    waId: String(r.wa_id),
    anlass: String(r.anlass ?? ""),
    codes: String(r.codes ?? ""),
    entwurf: String(r.entwurf ?? ""),
    gesendet: String(r.gesendet ?? ""),
    abweichung: Number(r.abweichung ?? 0),
    wer: String(r.wer ?? ""),
    am: new Date(r.am as string).toISOString(),
  }));
}
