/**
 * Dienstleister, die nach Stunden abrechnen.
 *
 * Bisher gab es dafür nur die Rechnung, und das Büro musste glauben, was
 * daraufstand. Seit dem 07.10.2026 stempelt die Putzfirma selbst und
 * sagt dabei, mit wie vielen Leuten sie da ist: 20 Euro netto je Person
 * und Stunde, "das kannst du dann entsprechend tracken und rechnung
 * checken wenn diese kommt" (Florian).
 *
 * Gerechnet wird hier nichts entschieden: Die Zahlen stehen neben der
 * Rechnung, und wer sie vergleicht, ist ein Mensch.
 */

import { db } from "@/lib/db/client";

/** Wie viele Leute höchstens auf einmal kommen. Schutz vor Vertippern. */
export const MAX_PERSONEN = 20;

export async function personenMerken(o: {
  stempelId: string;
  benutzerId: string;
  personen: number;
}): Promise<boolean> {
  const z = (await db()`
    update stempel set personen = ${o.personen}
     where id = ${o.stempelId}::uuid
       and benutzer_id = ${o.benutzerId}::uuid
       and art = 'kommen'
       and zeitpunkt > now() - interval '12 hours'
    returning id
  `) as unknown[];
  return z.length > 0;
}

export interface Einsatz {
  /** Wer gestempelt hat. Beim gemeinsamen Zugang der Firmenname. */
  name: string;
  datum: string;
  von: string;
  bis: string | null;
  minuten: number;
  personen: number;
  /** Stunden mal Personen mal Satz, in Cent. Null, solange offen. */
  kostenCent: number | null;
}

export interface Monatsabrechnung {
  name: string;
  satzCent: number;
  einsaetze: Einsatz[];
  stunden: number;
  /** Personenstunden: Was auf der Rechnung stehen müsste. */
  personenstunden: number;
  summeCent: number;
  /** Schichten, die noch offen sind: Sie zählen nicht mit. */
  offen: number;
}

/**
 * Ein Monat einer Firma, Schicht für Schicht.
 *
 * Eine Schicht ist ein Kommen mit dem nächsten Gehen. Was noch offen
 * ist, steht mit dabei, zählt aber nicht in die Summe: Eine Zeit ohne
 * Ende ist keine Zahl, gegen die sich eine Rechnung halten lässt.
 */
export async function monatsabrechnung(o: {
  benutzerId: string;
  /** JJJJ-MM */
  monat: string;
}): Promise<Monatsabrechnung | null> {
  const b = (await db()`
    select name, coalesce(stundensatz_cent, 0) as satz from benutzer where id = ${o.benutzerId}::uuid
  `) as Array<{ name: string; satz: number }>;
  if (b.length === 0) return null;
  const satzCent = Number(b[0].satz);

  const z = (await db()`
    select art, zeitpunkt, personen, name
      from stempel
     where benutzer_id = ${o.benutzerId}::uuid
       and to_char(zeitpunkt at time zone 'Europe/Berlin', 'YYYY-MM') = ${o.monat}
     order by zeitpunkt
  `.catch(() => [])) as Array<{ art: string; zeitpunkt: string; personen: number | null; name: string }>;

  const uhr = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    });

  /*
    Gepaart wird je Name, nicht je Firma.

    Seit es den offenen Link gibt, stempelt jeder fuer sich, und dann
    laufen mehrere Schichten gleichzeitig: Eine Reihenfolge ueber alle
    Stempel haette Annas Gehen an Berats Kommen gehaengt. Beim
    gemeinsamen Zugang steht in der Spalte der Firmenname, dort bleibt
    es eine einzige Reihe (Florian, 07.10.2026).
  */
  const einsaetze: Einsatz[] = [];
  let offen = 0;
  const laufend = new Map<string, { start: string; personen: number }>();

  const alsOffen = (name: string, l: { start: string; personen: number }) => {
    offen += 1;
    einsaetze.push({
      name,
      datum: new Date(l.start).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }),
      von: uhr(l.start),
      bis: null,
      minuten: 0,
      personen: l.personen,
      kostenCent: null,
    });
  };

  for (const r of z) {
    const name = String((r as { name?: string }).name ?? "");
    const l = laufend.get(name);

    if (r.art === "kommen") {
      // Zwei Kommen ohne Gehen dazwischen: Das erste bleibt offen stehen.
      if (l) alsOffen(name, l);
      laufend.set(name, { start: r.zeitpunkt, personen: Math.max(1, Number(r.personen ?? 1)) });
      continue;
    }

    if (r.art === "gehen" && l) {
      const minuten = Math.max(
        0,
        Math.round((new Date(r.zeitpunkt).getTime() - new Date(l.start).getTime()) / 60000),
      );
      einsaetze.push({
        name,
        datum: new Date(l.start).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }),
        von: uhr(l.start),
        bis: uhr(r.zeitpunkt),
        minuten,
        personen: l.personen,
        kostenCent: Math.round((minuten / 60) * l.personen * satzCent),
      });
      laufend.delete(name);
    }
  }

  for (const [name, l] of laufend) alsOffen(name, l);
  einsaetze.sort((a, b) => (a.datum + a.von).localeCompare(b.datum + b.von));

  const minuten = einsaetze.reduce((s, e) => s + e.minuten, 0);
  const personenminuten = einsaetze.reduce((s, e) => s + e.minuten * e.personen, 0);

  return {
    name: String(b[0].name),
    satzCent,
    einsaetze,
    stunden: minuten / 60,
    personenstunden: personenminuten / 60,
    summeCent: einsaetze.reduce((s, e) => s + (e.kostenCent ?? 0), 0),
    offen,
  };
}

/** Alle Zugänge, die nach Stunden abrechnen. */
export async function dienstleister(): Promise<Array<{ id: string; name: string; satzCent: number }>> {
  const z = (await db()`
    select id, name, coalesce(stundensatz_cent, 0) as satz
      from benutzer
     where rolle = 'reinigung' and aktiv
     order by name
  `.catch(() => [])) as Array<{ id: string; name: string; satz: number }>;
  return z.map((r) => ({ id: String(r.id), name: String(r.name), satzCent: Number(r.satz) }));
}
