/**
 * Magicuvée-Bestellungen der Gastronomie. Siehe migrations/045_wein_bestellung.sql.
 *
 * Wer was darf:
 *  - bestellen: die Gastro (Rolle gastro)
 *  - übergeben: Chefs, Büro und Foyer (Sarah)
 *  - Preise, Freischalten, Abrechnung: Florian
 * Solange nicht freigeschaltet ist, sieht alles nur Florian.
 */

import { db } from "@/lib/db/client";
import type { AngemeldeterBenutzer } from "@/lib/auth/sitzung";

export const INHABER = "info@florianzimmer.com";

export interface WeinArtikel {
  id: string;
  name: string;
  vkCent: number;
  ekCent: number;
  aktiv: boolean;
}

export interface WeinPosition {
  artikelId: string;
  name: string;
  menge: number;
  ekCent: number;
}

export interface WeinBestellung {
  id: string;
  bestellerId: string | null;
  bestellerName: string;
  erstelltAm: string;
  notiz: string;
  status: "offen" | "uebergeben" | "storniert";
  uebergebenAm: string | null;
  uebergebenVon: string | null;
  positionen: WeinPosition[];
}

export interface WeinEinstellung {
  freigegeben: boolean;
  meldenAn: string[];
}

export interface WeinZugang {
  sehen: boolean;
  bestellen: boolean;
  uebergeben: boolean;
  verwalten: boolean;
  freigegeben: boolean;
}

export function istInhaber(b: Pick<AngemeldeterBenutzer, "email">): boolean {
  return b.email.toLowerCase() === INHABER;
}

export async function einstellungLesen(): Promise<WeinEinstellung> {
  const z = (await db()`select freigegeben, melden_an from wein_einstellung where id = 1`) as Array<{
    freigegeben: boolean;
    melden_an: string[];
  }>;
  return { freigegeben: Boolean(z[0]?.freigegeben), meldenAn: z[0]?.melden_an ?? [] };
}

export async function zugang(b: AngemeldeterBenutzer | null): Promise<WeinZugang> {
  const nichts = { sehen: false, bestellen: false, uebergeben: false, verwalten: false, freigegeben: false };
  if (!b) return nichts;
  const e = await einstellungLesen().catch(() => null);
  if (!e) return nichts;
  if (istInhaber(b)) return { sehen: true, bestellen: true, uebergeben: true, verwalten: true, freigegeben: e.freigegeben };
  if (!e.freigegeben) return { ...nichts };
  const bestellen = b.rolle === "gastro";
  const uebergeben = ["chef", "team", "foyer"].includes(b.rolle);
  return { sehen: bestellen || uebergeben, bestellen, uebergeben, verwalten: false, freigegeben: true };
}

export async function artikelListe(nurAktive = true): Promise<WeinArtikel[]> {
  const z = (await db()`
    select id, name, vk_cent, ek_cent, aktiv from wein_artikel
     where ${!nurAktive} or aktiv order by sortierung
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    vkCent: Number(r.vk_cent),
    ekCent: Number(r.ek_cent),
    aktiv: Boolean(r.aktiv),
  }));
}

/** Bestellungen, neueste zuerst. Mit bestellerId nur die eigenen. */
export async function bestellungen(o: { bestellerId?: string; seit?: string; bis?: string; status?: string } = {}): Promise<WeinBestellung[]> {
  const z = (await db()`
    select b.*, coalesce(json_agg(json_build_object('artikelId', p.artikel_id, 'name', p.name, 'menge', p.menge, 'ekCent', p.ek_cent)
             order by p.artikel_id) filter (where p.artikel_id is not null), '[]') as positionen
      from wein_bestellung b
      left join wein_position p on p.bestellung_id = b.id
     where (${o.bestellerId ?? null}::uuid is null or b.besteller_id = ${o.bestellerId ?? null}::uuid)
       and (${o.seit ?? null}::timestamptz is null or coalesce(b.uebergeben_am, b.erstellt_am) >= ${o.seit ?? null}::timestamptz)
       and (${o.bis ?? null}::timestamptz is null or coalesce(b.uebergeben_am, b.erstellt_am) < ${o.bis ?? null}::timestamptz)
       and (${o.status ?? null}::text is null or b.status = ${o.status ?? null}::text)
     group by b.id
     order by b.erstellt_am desc
     limit 300
  `) as Array<Record<string, unknown>>;
  const t = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return z.map((r) => ({
    id: String(r.id),
    bestellerId: (r.besteller_id as string) ?? null,
    bestellerName: String(r.besteller_name),
    erstelltAm: t(r.erstellt_am)!,
    notiz: String(r.notiz ?? ""),
    status: r.status as WeinBestellung["status"],
    uebergebenAm: t(r.uebergeben_am),
    uebergebenVon: (r.uebergeben_von as string) ?? null,
    positionen: r.positionen as WeinPosition[],
  }));
}

export async function bestellungAnlegen(
  b: Pick<AngemeldeterBenutzer, "id" | "name">,
  mengen: Array<{ artikel: WeinArtikel; menge: number }>,
  notiz: string,
): Promise<string> {
  const z = (await db()`
    insert into wein_bestellung (besteller_id, besteller_name, notiz) values (${b.id}, ${b.name}, ${notiz})
    returning id
  `) as Array<{ id: string }>;
  const id = z[0].id;
  for (const m of mengen) {
    await db()`
      insert into wein_position (bestellung_id, artikel_id, name, menge, ek_cent)
      values (${id}, ${m.artikel.id}, ${m.artikel.name}, ${m.menge}, ${m.artikel.ekCent})
    `;
  }
  return id;
}

export async function uebergeben(id: string, von: string): Promise<boolean> {
  const z = (await db()`
    update wein_bestellung set status = 'uebergeben', uebergeben_am = now(), uebergeben_von = ${von}
     where id = ${id} and status = 'offen' returning id
  `) as unknown[];
  return z.length > 0;
}

export async function stornieren(id: string, von: string, nurVon?: string): Promise<boolean> {
  const z = (await db()`
    update wein_bestellung set status = 'storniert', storniert_am = now(), storniert_von = ${von}
     where id = ${id} and status = 'offen'
       and (${nurVon ?? null}::uuid is null or besteller_id = ${nurVon ?? null}::uuid)
    returning id
  `) as unknown[];
  return z.length > 0;
}

export async function offeneAnzahl(): Promise<number> {
  const z = (await db()`select count(*)::int as n from wein_bestellung where status = 'offen'`) as Array<{ n: number }>;
  return z[0]?.n ?? 0;
}

export function summe(positionen: WeinPosition[]): number {
  return positionen.reduce((n, p) => n + p.menge * p.ekCent, 0);
}

export function euro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
