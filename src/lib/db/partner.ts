"use server";

/**
 * Partner mit Freiticket-Kontingent und ihre monatliche Abrechnung.
 *
 * Ditix zaehlt eingeloeste Codes je Code-Satz kumulativ hoch. Fuer eine
 * Monatsrechnung zaehlt deshalb nicht der Stand, sondern die Differenz zum
 * vorigen Stand. Siehe migrations/022_partner_freitickets.sql.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";

export interface Ablesung {
  id: string;
  stichtag: string;
  standGesamt: number;
  /** Neu seit der vorigen Ablesung. Das ist die Rechnungsmenge. */
  zuwachs: number;
  notiz: string | null;
}

export interface Partner {
  id: string;
  name: string;
  ditixAktion: string;
  preisJeCodeCent: number;
  codesAusgegeben: number | null;
  aktiv: boolean;
  notiz: string | null;
  ablesungen: Ablesung[];
  /** Letzter bekannter Gesamtstand. */
  standAktuell: number;
  /** Noch nicht abgerechnet: Zuwachs der neuesten Ablesung. */
  offenerZuwachs: number;
  offenerBetragCent: number;
}

const text = (f: FormData, name: string) => String(f.get(name) ?? "").trim();
const zahl = (f: FormData, name: string, vorgabe = 0) => {
  const n = Number(String(f.get(name) ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : vorgabe;
};

export async function alleParnter(): Promise<Partner[]> {
  const p = (await db()`
    select id, name, ditix_aktion, preis_je_code_cent, codes_ausgegeben, aktiv, notiz
      from partner
     order by aktiv desc, name
  `) as Record<string, unknown>[];
  if (p.length === 0) return [];

  const a = (await db()`
    select id, partner_id, stichtag, stand_gesamt, notiz
      from partner_ablesung
     order by stichtag asc
  `) as Record<string, unknown>[];

  return p.map((z) => {
    const eigene = a.filter((x) => String(x.partner_id) === String(z.id));
    let vorher = 0;
    const ablesungen: Ablesung[] = eigene.map((x) => {
      const stand = Number(x.stand_gesamt);
      // Nie negativ: Wird in Ditix ein Code-Satz zurueckgesetzt, ist ein
      // kleinerer Stand kein Guthaben des Partners.
      const zuwachs = Math.max(0, stand - vorher);
      vorher = stand;
      return {
        id: String(x.id),
        stichtag: String(x.stichtag).slice(0, 10),
        standGesamt: stand,
        zuwachs,
        notiz: (x.notiz as string) ?? null,
      };
    });
    ablesungen.reverse(); // neueste zuerst fuer die Anzeige
    const preis = Number(z.preis_je_code_cent ?? 0);
    const neueste = ablesungen[0];
    return {
      id: String(z.id),
      name: String(z.name),
      ditixAktion: String(z.ditix_aktion ?? ""),
      preisJeCodeCent: preis,
      codesAusgegeben: z.codes_ausgegeben === null ? null : Number(z.codes_ausgegeben),
      aktiv: Boolean(z.aktiv),
      notiz: (z.notiz as string) ?? null,
      ablesungen,
      standAktuell: neueste?.standGesamt ?? 0,
      offenerZuwachs: neueste?.zuwachs ?? 0,
      offenerBetragCent: (neueste?.zuwachs ?? 0) * preis,
    };
  });
}

export async function partnerAnlegen(formData: FormData): Promise<void> {
  const name = text(formData, "name");
  if (!name) return;
  await db()`
    insert into partner (name, ditix_aktion, preis_je_code_cent, codes_ausgegeben, notiz)
    values (${name}, ${text(formData, "ditix_aktion")},
            ${Math.round(zahl(formData, "preis_je_code") * 100)},
            ${zahl(formData, "codes_ausgegeben") || null},
            ${text(formData, "notiz") || null})
  `;
  revalidatePath("/partner");
}

export async function ablesungErfassen(formData: FormData): Promise<void> {
  const partnerId = text(formData, "partner_id");
  const stichtag = text(formData, "stichtag");
  const stand = Math.round(zahl(formData, "stand_gesamt", -1));
  if (!partnerId || !/^\d{4}-\d{2}-\d{2}$/.test(stichtag) || stand < 0) return;
  await db()`
    insert into partner_ablesung (partner_id, stichtag, stand_gesamt, notiz)
    values (${partnerId}, ${stichtag}, ${stand}, ${text(formData, "notiz") || null})
    on conflict (partner_id, stichtag)
    do update set stand_gesamt = excluded.stand_gesamt, notiz = excluded.notiz
  `;
  revalidatePath("/partner");
}
