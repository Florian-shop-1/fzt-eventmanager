/**
 * Die Vertriebsstrecke für abgebrochene Warenkörbe.
 * Siehe migrations/080_abbruch_vertrieb.sql.
 *
 * Bewusst klein gehalten: Bearbeiter, Stufe, Wiedervorlage, Notiz und ein
 * Verlauf, der nur ergänzt wird. Mehr braucht es für ein Haus mit zwei
 * Leuten im Vertrieb nicht, und alles darüber hinaus wird ohnehin nicht
 * gepflegt (Florian, 23.09.2026).
 */

import { db } from "@/lib/db/client";

export type VertriebStatus =
  | "neu"
  | "anrufen"
  | "nicht_erreicht"
  | "im_gespraech"
  | "gewonnen"
  | "verloren"
  | "unqualifiziert";

export const STATUS: Array<{ wert: VertriebStatus; text: string; farbe: string; hinweis: string }> = [
  { wert: "neu", text: "Neu", farbe: "var(--text-leise)", hinweis: "noch niemand dran" },
  { wert: "anrufen", text: "Anrufen", farbe: "var(--warnung)", hinweis: "vorgemerkt" },
  { wert: "nicht_erreicht", text: "Nicht erreicht", farbe: "var(--warnung)", hinweis: "versucht, niemand dran" },
  { wert: "im_gespraech", text: "Im Gespräch", farbe: "var(--info)", hinweis: "erreicht, überlegt noch" },
  { wert: "gewonnen", text: "Gewonnen", farbe: "var(--gut)", hinweis: "hat gebucht" },
  { wert: "verloren", text: "Verloren", farbe: "var(--blocker)", hinweis: "will nicht" },
  { wert: "unqualifiziert", text: "Unqualifiziert", farbe: "var(--text-leise)", hinweis: "kein echter Interessent" },
];

export function statusText(s: string): string {
  return STATUS.find((x) => x.wert === s)?.text ?? s;
}

export function statusFarbe(s: string): string {
  return STATUS.find((x) => x.wert === s)?.farbe ?? "var(--text-leise)";
}

export interface VerlaufZeile {
  wer: string;
  text: string;
  am: string;
}

/** Der Verlauf zu mehreren Buchungen auf einmal, für die Liste. */
export async function verlaeufe(buchungIds: string[]): Promise<Map<string, VerlaufZeile[]>> {
  const karte = new Map<string, VerlaufZeile[]>();
  if (buchungIds.length === 0) return karte;
  const z = (await db()`
    select buchung_id, wer, text, am from abbruch_verlauf
     where buchung_id = any(${buchungIds}::uuid[])
     order by am desc
  `) as Array<Record<string, unknown>>;
  for (const r of z) {
    const id = String(r.buchung_id);
    const liste = karte.get(id) ?? [];
    liste.push({ wer: String(r.wer), text: String(r.text), am: new Date(r.am as string).toISOString() });
    karte.set(id, liste);
  }
  return karte;
}

export async function notieren(buchungId: string, wer: string, text: string): Promise<void> {
  if (!text.trim()) return;
  await db()`insert into abbruch_verlauf (buchung_id, wer, text) values (${buchungId}, ${wer}, ${text.trim().slice(0, 500)})`;
}

/**
 * Stufe, Bearbeiter, Wiedervorlage und Notiz setzen.
 *
 * Jede Änderung landet zusätzlich im Verlauf, damit später niemand raten
 * muss, wer wann was entschieden hat.
 */
export async function vertriebSetzen(o: {
  buchungId: string;
  status: VertriebStatus;
  bearbeiterId: string | null;
  bearbeiterName: string | null;
  wiedervorlage: string | null;
  notiz: string;
  wer: string;
  vorher: { status: string; bearbeiter: string | null };
}): Promise<void> {
  await db()`
    update shop_buchung
       set vertrieb_status = ${o.status},
           vertrieb_wer = ${o.bearbeiterId},
           vertrieb_notiz = ${o.notiz.slice(0, 500)},
           vertrieb_am = now(),
           wiedervorlage = ${o.wiedervorlage}::date
     where id = ${o.buchungId}
  `;

  const teile: string[] = [];
  if (o.vorher.status !== o.status) teile.push(`Stufe: ${statusText(o.vorher.status)} → ${statusText(o.status)}`);
  if ((o.vorher.bearbeiter ?? "") !== (o.bearbeiterName ?? "")) {
    teile.push(o.bearbeiterName ? `Bearbeiter: ${o.bearbeiterName}` : "Bearbeiter entfernt");
  }
  if (o.wiedervorlage) teile.push(`Wiedervorlage: ${o.wiedervorlage.split("-").reverse().join(".")}`);
  if (o.notiz.trim()) teile.push(o.notiz.trim());
  if (teile.length > 0) await notieren(o.buchungId, o.wer, teile.join(" · "));
}

/** Ein Anruf, mit einem Klick festgehalten. */
export async function anrufVermerken(buchungId: string, wer: string, ergebnis: VertriebStatus, notiz: string): Promise<void> {
  await db()`
    update shop_buchung
       set vertrieb_status = ${ergebnis}, vertrieb_am = now()
     where id = ${buchungId}
  `;
  await notieren(buchungId, wer, `Angerufen: ${statusText(ergebnis)}${notiz.trim() ? ` · ${notiz.trim()}` : ""}`);
}

export interface Trichter {
  status: VertriebStatus;
  anzahl: number;
  summeCent: number;
}

/** Wie viele Körbe in welcher Stufe liegen, und wie viel Geld daran hängt. */
export async function trichter(tage = 30): Promise<Trichter[]> {
  const z = (await db()`
    select vertrieb_status as status, count(*) as anzahl, coalesce(sum(gesamt_cent), 0) as summe
      from shop_buchung
     where not bestaetigt and email <> ''
       and eingegangen_am >= now() - (${tage} || ' days')::interval
     group by 1
  `) as Array<Record<string, unknown>>;
  const karte = new Map(z.map((r) => [String(r.status), { anzahl: Number(r.anzahl), summe: Number(r.summe) }]));
  return STATUS.map((s) => ({
    status: s.wert,
    anzahl: karte.get(s.wert)?.anzahl ?? 0,
    summeCent: karte.get(s.wert)?.summe ?? 0,
  }));
}

/**
 * Der Gast hat selbst gemeldet, dass etwas hakt.
 *
 * Dann versprechen wir ihm auf der Antwortseite, dass wir uns melden, und
 * dieses Versprechen muss auch in der Liste ankommen: Der Vorgang landet
 * auf der Anrufliste. Ein Vorgang, um den sich schon jemand kuemmert,
 * bleibt unberuehrt (Florian, 23.09.2026).
 */
export async function rueckrufGewuenscht(buchungId: string, was: string): Promise<void> {
  await db()`
    update shop_buchung
       set vertrieb_status = 'anrufen', vertrieb_am = now()
     where id = ${buchungId} and vertrieb_status in ('neu', 'nicht_erreicht')
  `;
  await notieren(buchungId, "Gast selbst", was);
}
