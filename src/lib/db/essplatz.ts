/**
 * Blockierte Plaetze am Tisch: Eventgalerie oder Loge.
 *
 * "du musst auch Plaetze auf eventgalerie oder loge blockieren koennen.
 * auch wenn nicht feststeht wieviele menues das sind" (Florian,
 * 28.10.2026).
 *
 * Showplatz und Essplatz sind im Haus zwei verschiedene Dinge. Der
 * Showplatz liegt in FloTix, der Essplatz nicht: FloTix kennt Golden
 * Seats und Kategorien, aber keine Loge und keine Eventgalerie. Deshalb
 * stehen diese Sperren hier.
 *
 * Fuer die Kueche sind sie zugleich die Antwort auf "wie viele Essen
 * werden es?", solange die Menuewahl noch nicht erfasst ist: Wer
 * vierzig Plaetze am Tisch blockiert, braucht vierzig Essen.
 *
 * Siehe migrations/220_essplatz_sperre.sql.
 */

import { db } from "@/lib/db/client";
import { kapazitaet } from "@/lib/domain/venue";

export type Essbereich = "logen" | "eventgalerie";

export const BEREICH_NAME: Record<Essbereich, string> = {
  logen: "Loge",
  eventgalerie: "Eventgalerie",
};

export interface Essplatzsperre {
  id: string;
  vorgangId: string;
  bereich: Essbereich;
  plaetze: number;
  bis: string;
  angelegtVon: string;
}

function zuSperre(z: Record<string, unknown>): Essplatzsperre {
  return {
    id: String(z.id),
    vorgangId: String(z.vorgang_id),
    bereich: z.bereich === "logen" ? "logen" : "eventgalerie",
    plaetze: Number(z.plaetze ?? 0),
    bis: new Date(String(z.bis)).toISOString(),
    angelegtVon: String(z.angelegt_von ?? ""),
  };
}

/** Was fuer einen Vorgang gerade gehalten wird. Abgelaufenes zaehlt nicht mit. */
export async function sperrenZuVorgang(vorgangId: string): Promise<Essplatzsperre[]> {
  const zeilen = (await db()`
    select id, vorgang_id, bereich, plaetze, bis, angelegt_von
      from essplatz_sperre
     where vorgang_id = ${vorgangId}::uuid and bis > now()
     order by bereich
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return zeilen.map(zuSperre);
}

/**
 * Setzen oder aendern. Eine Zeile je Vorgang und Bereich, damit aus
 * zweimal Klicken nicht zweimal dieselbe Sperre wird.
 */
export async function sperreSetzen(o: {
  vorgangId: string;
  bereich: Essbereich;
  plaetze: number;
  bis: Date;
  von: string;
}): Promise<void> {
  await db()`
    insert into essplatz_sperre (vorgang_id, bereich, plaetze, bis, angelegt_von)
    values (${o.vorgangId}::uuid, ${o.bereich}, ${Math.max(1, Math.round(o.plaetze))},
            ${o.bis.toISOString()}::timestamptz, ${o.von})
    on conflict (vorgang_id, bereich) do update
       set plaetze = excluded.plaetze, bis = excluded.bis,
           angelegt_von = excluded.angelegt_von, angelegt_am = now()
  `;
}

export async function sperreAufheben(vorgangId: string, bereich?: Essbereich): Promise<void> {
  if (bereich) {
    await db()`
      delete from essplatz_sperre where vorgang_id = ${vorgangId}::uuid and bereich = ${bereich}
    `;
    return;
  }
  await db()`delete from essplatz_sperre where vorgang_id = ${vorgangId}::uuid`;
}

export interface TagesSperre {
  tag: string;
  logen: number;
  eventgalerie: number;
  posten: Array<{ vorgangId: string; nummer: string; firma: string; bereich: Essbereich; plaetze: number; bis: string }>;
}

/**
 * Was an welchem kommenden Abend am Tisch blockiert ist.
 *
 * Gezaehlt wird nur, was noch laeuft: Eine abgelaufene Sperre gibt die
 * Plaetze von selbst wieder frei, ohne dass jemand aufraeumen muss.
 */
export async function gesperrteEssplaetze(abDatum?: string): Promise<TagesSperre[]> {
  const ab = abDatum ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const zeilen = (await db()`
    select v.datum::text as tag, s.bereich, s.plaetze, s.bis,
           vg.id::text as vorgang_id, vg.nummer, coalesce(k.name, 'Firma') as firma
      from essplatz_sperre s
      join vorgang vg     on vg.id = s.vorgang_id
      join vorstellung v  on v.id = vg.vorstellung_id
      left join kunde k   on k.id = vg.kunde_id
     where s.bis > now() and v.datum >= ${ab}::date
     order by v.datum, s.bereich
  `.catch(() => [])) as Array<Record<string, unknown>>;

  const nachTag = new Map<string, TagesSperre>();
  for (const z of zeilen) {
    const tag = String(z.tag);
    const eintrag = nachTag.get(tag) ?? { tag, logen: 0, eventgalerie: 0, posten: [] };
    const bereich: Essbereich = z.bereich === "logen" ? "logen" : "eventgalerie";
    const plaetze = Number(z.plaetze ?? 0);
    eintrag[bereich] += plaetze;
    eintrag.posten.push({
      vorgangId: String(z.vorgang_id),
      nummer: String(z.nummer),
      firma: String(z.firma),
      bereich,
      plaetze,
      bis: new Date(String(z.bis)).toISOString(),
    });
    nachTag.set(tag, eintrag);
  }
  return [...nachTag.values()];
}

/** Wie viele Plaetze es in dem Bereich ueberhaupt gibt. */
export function bereichsKapazitaet(bereich: Essbereich): number {
  return kapazitaet(bereich);
}
