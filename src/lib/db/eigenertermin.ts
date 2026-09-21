/**
 * Eigene Termine, die es im Ticketshop nicht gibt.
 * Siehe migrations/058_eigener_termin.sql.
 *
 * Der typische Fall: Das Haus ist exklusiv gebucht, die Firma bringt ihre
 * Gäste selbst mit, es werden keine Karten verkauft. In Ditix steht dann
 * nichts, im Programm muss der Tag trotzdem auftauchen.
 *
 * Damit daraus kein Sonderfall wird, bekommt so ein Termin eine eigene
 * Kennung und wird im Spielplan einfach mitgeliefert (siehe
 * lib/ditix/spielplan.ts). Küchenblatt, Funktionsheet, Sitzplan, Einlass
 * und Dienstplan arbeiten damit wie mit jeder anderen Vorstellung.
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";

export interface EigenerTermin {
  id: string;
  eventId: string;
  datum: string;
  uhrzeit: string;
  name: string;
  notiz: string;
  angelegtVon: string | null;
}

/** Erkennt einen eigenen Termin an seiner Kennung. */
export function istEigenerTermin(ditixEventId: string): boolean {
  return ditixEventId.startsWith("eigen-");
}

function baue(z: Record<string, unknown>): EigenerTermin {
  return {
    id: String(z.id),
    eventId: String(z.event_id),
    datum: String(z.datum),
    uhrzeit: String(z.uhrzeit).slice(0, 5),
    name: String(z.name),
    notiz: String(z.notiz ?? ""),
    angelegtVon: (z.angelegt_von as string) ?? null,
  };
}

/** Alle eigenen Termine, die noch kommen (oder heute sind). */
export async function eigeneTermine(): Promise<EigenerTermin[]> {
  const z = (await db()`
    select id, event_id, datum::text as datum, uhrzeit, name, notiz, angelegt_von
      from eigener_termin
     where aktiv and datum >= (now() at time zone 'Europe/Berlin')::date - 1
     order by datum, uhrzeit
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Alle eigenen Termine, auch vergangene: für den Spielplan im Rückblick. */
export async function alleEigenenTermine(): Promise<EigenerTermin[]> {
  const z = (await db()`
    select id, event_id, datum::text as datum, uhrzeit, name, notiz, angelegt_von
      from eigener_termin where aktiv order by datum, uhrzeit
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function eigenenTerminAnlegen(o: {
  datum: string;
  uhrzeit: string;
  name: string;
  notiz: string;
  von: string;
}): Promise<EigenerTermin> {
  const eventId = `eigen-${randomBytes(6).toString("hex")}`;
  const z = (await db()`
    insert into eigener_termin (event_id, datum, uhrzeit, name, notiz, angelegt_von)
    values (${eventId}, ${o.datum}::date, ${o.uhrzeit}, ${o.name}, ${o.notiz}, ${o.von})
    returning id, event_id, datum::text as datum, uhrzeit, name, notiz, angelegt_von
  `) as Array<Record<string, unknown>>;
  return baue(z[0]);
}

export async function eigenenTerminAendern(o: {
  id: string;
  datum: string;
  uhrzeit: string;
  name: string;
  notiz: string;
}): Promise<void> {
  await db()`
    update eigener_termin
       set datum = ${o.datum}::date, uhrzeit = ${o.uhrzeit}, name = ${o.name}, notiz = ${o.notiz}
     where id = ${o.id}
  `;
}

/**
 * Nimmt einen Termin wieder heraus. Gelöscht wird nicht wirklich: Was
 * schon daran hängt (Vorgänge, Sitzplan), soll nicht ins Leere zeigen.
 */
export async function eigenenTerminEntfernen(id: string): Promise<void> {
  await db()`update eigener_termin set aktiv = false where id = ${id}`;
}

/** Datum und Uhrzeit aus Europe/Berlin in einen Zeitpunkt umrechnen. */
export function beginnAls(datum: string, uhr: string): number {
  const [j, m, t] = datum.split("-").map(Number);
  const [h, min] = uhr.split(":").map(Number);
  const roh = Date.UTC(j, m - 1, t, h, min);
  // Der Abstand zur Weltzeit ist in Deutschland eine oder zwei Stunden.
  const probe = new Date(roh);
  const berlin = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return roh - (berlin.getTime() - utc.getTime());
}
