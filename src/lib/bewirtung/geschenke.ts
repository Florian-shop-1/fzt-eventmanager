/**
 * Geschenke: an Mitarbeiter und an Geschäftspartner.
 *
 * Sachbezüge an Mitarbeiter bleiben bis 50 Euro im Monat je Person
 * steuerfrei. Die Grenze gilt pro Kopf und pro Monat, und sie ist eine
 * Freigrenze, kein Freibetrag: Wer einen Cent darüber liegt, versteuert
 * den ganzen Betrag. Deshalb wird hier je Person und Monat gezählt und
 * nicht im Jahr (Florian, 01.10.2026).
 *
 * Gezählt wird, was auf den Belegen steht, nicht was gemeint war. Ein
 * Geschenk ohne Namen taucht gesondert auf: Ohne Empfänger lässt sich die
 * Grenze nicht prüfen.
 */

import { db } from "@/lib/db/client";

/** Die Freigrenze für Sachbezüge, Stand 2026. */
export const SACHBEZUG_GRENZE_CENT = 5000;

export interface Geschenkposten {
  id: string;
  nummer: string | null;
  datum: string;
  geschaeft: string;
  bruttoCent: number;
  fuer: string;
  art: "mitarbeiter" | "partner";
  status: string;
}

export interface Monatskopf {
  /** JJJJ-MM */
  monat: string;
  person: string;
  summeCent: number;
  ueberGrenze: boolean;
  posten: Geschenkposten[];
}

function baue(z: Record<string, unknown>): Geschenkposten {
  return {
    id: String(z.id),
    nummer: (z.nummer as string) ?? null,
    datum: String(z.datum ?? ""),
    geschaeft: String(z.restaurant ?? ""),
    bruttoCent: Number(z.brutto_cent ?? 0),
    fuer: String(z.geschenk_fuer ?? ""),
    art: (z.geschenk as "mitarbeiter" | "partner") ?? "partner",
    status: String(z.status ?? ""),
  };
}

/** Alle Geschenke eines Jahres, Belege und Entwürfe. */
export async function geschenkeDesJahres(jahr: number): Promise<Geschenkposten[]> {
  const z = (await db()`
    select id, nummer, datum::text as datum, restaurant, brutto_cent, geschenk, geschenk_fuer, status
      from bewirtung
     where geschenk <> ''
       and status <> 'storniert'
       and (datum is null or extract(year from datum) = ${jahr})
     order by datum desc nulls last
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/**
 * Je Mitarbeiter und Monat zusammenzählen.
 *
 * Nur die Geschenke an Mitarbeiter: Bei Geschäftspartnern gilt die
 * 50-Euro-Grenze nicht, dort ist die Frage eine andere.
 */
export function nachPersonUndMonat(posten: Geschenkposten[]): Monatskopf[] {
  const karte = new Map<string, Monatskopf>();

  for (const p of posten) {
    if (p.art !== "mitarbeiter") continue;
    const monat = p.datum ? p.datum.slice(0, 7) : "ohne Datum";
    const person = p.fuer.trim() || "ohne Namen";
    const schluessel = `${monat}|${person}`;
    const eintrag = karte.get(schluessel) ?? {
      monat,
      person,
      summeCent: 0,
      ueberGrenze: false,
      posten: [],
    };
    eintrag.summeCent += p.bruttoCent;
    eintrag.posten.push(p);
    eintrag.ueberGrenze = eintrag.summeCent > SACHBEZUG_GRENZE_CENT;
    karte.set(schluessel, eintrag);
  }

  return [...karte.values()].sort((a, b) =>
    b.monat.localeCompare(a.monat) || a.person.localeCompare(b.person, "de"),
  );
}
