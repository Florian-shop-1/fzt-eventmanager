/**
 * Die Konten, die der Bankabruf lesen darf.
 *
 * Zum selben Bankzugang gehoeren mehrere Konten: zwei Geschaeftskonten
 * und die Kreditkarte. Alle sollen im Zahlungsabgleich auftauchen, aber
 * keines soll ungefragt hineinrutschen (Florian, 29.09.2026).
 *
 * Deshalb der Weg: Meldet das Abrufprogramm ein Konto, das hier noch
 * nicht steht, wird es vermerkt und nichts eingelesen. Florian schaltet
 * es einmal frei, ab dann kommen die Umsaetze an.
 *
 * Gespeichert werden nur die letzten vier Stellen. Die vollstaendige
 * IBAN steht ausschliesslich als Umgebungsvariable auf dem Rechner im
 * Haus, nie in dieser Datenbank und nie im Quelltext.
 */

import { db } from "@/lib/db/client";

export interface Bankkonto {
  endetAuf: string;
  bezeichnung: string;
  art: "giro" | "kreditkarte";
  aktiv: boolean;
  zuerstAm: string;
  zuletztAm: string | null;
  zuletztUmsaetze: number;
}

function baue(r: Record<string, unknown>): Bankkonto {
  return {
    endetAuf: String(r.endet_auf),
    bezeichnung: String(r.bezeichnung ?? ""),
    art: r.art === "kreditkarte" ? "kreditkarte" : "giro",
    aktiv: Boolean(r.aktiv),
    zuerstAm: new Date(r.zuerst_am as string).toISOString(),
    zuletztAm: r.zuletzt_am ? new Date(r.zuletzt_am as string).toISOString() : null,
    zuletztUmsaetze: Number(r.zuletzt_umsaetze ?? 0),
  };
}

export async function konten(): Promise<Bankkonto[]> {
  const z = (await db()`
    select * from bank_konto order by aktiv desc, art, endet_auf
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function konto(endetAuf: string): Promise<Bankkonto | null> {
  const z = (await db()`select * from bank_konto where endet_auf = ${endetAuf}`) as Array<
    Record<string, unknown>
  >;
  return z[0] ? baue(z[0]) : null;
}

/**
 * Ein Konto vermerken, das der Abruf gemeldet hat.
 *
 * Freigeschaltet wird es dabei nicht: Das macht ein Mensch.
 */
export async function kontoVermerken(o: {
  endetAuf: string;
  art?: "giro" | "kreditkarte";
  bezeichnung?: string;
}): Promise<void> {
  await db()`
    insert into bank_konto (endet_auf, bezeichnung, art, aktiv)
    values (${o.endetAuf}, ${o.bezeichnung ?? ""}, ${o.art ?? "giro"}, false)
    on conflict (endet_auf) do nothing
  `;
}

export async function kontoFreischalten(endetAuf: string, bezeichnung: string): Promise<void> {
  await db()`
    update bank_konto set aktiv = true, bezeichnung = ${bezeichnung.trim().slice(0, 80)}
     where endet_auf = ${endetAuf}
  `;
}

/**
 * Ein Konto stilllegen.
 *
 * Die schon eingelesenen Umsaetze bleiben stehen: Was einmal zugeordnet
 * war, soll nicht verschwinden, nur weil das Konto nicht mehr abgerufen
 * wird.
 */
export async function kontoStilllegen(endetAuf: string): Promise<void> {
  await db()`update bank_konto set aktiv = false where endet_auf = ${endetAuf}`;
}

export async function abrufMerken(endetAuf: string, umsaetze: number): Promise<void> {
  await db()`
    update bank_konto set zuletzt_am = now(), zuletzt_umsaetze = ${umsaetze}
     where endet_auf = ${endetAuf}
  `;
}
