/**
 * Der Foyerdienst. Siehe migrations/065_foyer_dienstplan.sql.
 *
 * Sarah plant, wer im Foyer steht. Bis zu drei Leute je Showtag, die
 * Zeiten stehen in ihrer Aufstellung vom 22.09.2026:
 *
 *   Freitag (eine Abendshow)      1. Person 18:00, 2. Person 18:45, bis ~23:00
 *   Samstag (Nachmittag + Abend)  1. Person 13:00, 2. Person 14:00,
 *                                 Pause 18:00 bis 18:45, danach bis ~23:00
 *   Sonntag (nur Nachmittag)      1. Person 13:00, 2. Person 13:30, bis ~18:00
 *   Sonntag mit Flo-Zirkus        1. Person 11:30, 2. Person 12:00, bis ~18:00
 *
 * Daraus die Regel, die das Programm rechnet: Die erste Person kommt
 * zwei Stunden vor der ersten Show, die zweite anderthalb Stunden vorher;
 * Schluss ist rund drei Stunden nach Beginn der letzten Show. Die Zeiten
 * sind ein Vorschlag, Sarah kann sie je Tag überschreiben.
 *
 * Wie viele Leute es braucht, ist Sarahs Einschätzung. Als Faustregel gilt
 * eine Person je 50 Gäste: bis 50 eine, über 50 zwei, über 100 drei
 * (Florian, 25.09.2026). Deshalb steht der dritte Platz immer zur
 * Verfügung, auch wenn er meist leer bleibt.
 *
 * Olena und Sarah sind fest angestellt und ohne Rückfrage einteilbar.
 * Wen Sarah sonst einteilt, ist eine Aushilfe. Eine Freigabe braucht es
 * dafür nicht mehr, Kevin und Florian werden nur noch informiert
 * (Florian, 25.09.2026).
 */

import { db } from "@/lib/db/client";
import { kommendeTermine, type Vorstellungstermin } from "@/lib/ditix/spielplan";

export type Freigabe = "nicht_noetig" | "angefragt" | "frei" | "abgelehnt";

export interface FoyerPerson {
  id: string;
  name: string;
  email: string;
  /** Fest angestellt: darf ohne Rückfrage eingeteilt werden. */
  fest: boolean;
}

export interface FoyerDienst {
  id: string;
  datum: string;
  nummer: number;
  benutzerId: string | null;
  name: string | null;
  von: string;
  bis: string;
  freigabe: Freigabe;
  freigabeVon: string | null;
  notiz: string;
}

export interface FoyerTag {
  datum: string;
  /** Anfangszeiten der Shows an diesem Tag, für die Anzeige. */
  shows: Array<{ uhrzeit: string; name: string }>;
  dienste: FoyerDienst[];
  /** Vorgeschlagene Zeiten, wenn noch nichts eingetragen ist. */
  vorschlag: Array<{ von: string; bis: string }>;
  /** Pause zwischen den Shows, nur an Tagen mit zwei Vorstellungen. */
  pause: string | null;
}

const PLAETZE = [1, 2, 3];

/** "18:45" aus "20:00" minus 75 Minuten. */
function minus(uhrzeit: string, minuten: number): string {
  const [h, m] = uhrzeit.split(":").map(Number);
  const gesamt = h * 60 + m - minuten;
  const hh = Math.floor(((gesamt % 1440) + 1440) % 1440 / 60);
  const mm = ((gesamt % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function plus(uhrzeit: string, minuten: number): string {
  return minus(uhrzeit, -minuten);
}

/**
 * Die Zeiten eines Tages nach Sarahs Aufstellung.
 *
 * Erste Person zwei Stunden vor der ersten Show, die zweite 45 Minuten
 * später, Schluss rund drei Stunden nach Beginn der letzten Show. An
 * Tagen, die schon mittags anfangen (Flo-Zirkus), reichen anderthalb
 * Stunden Vorlauf, sonst stünde jemand um halb elf im leeren Haus.
 *
 * Die dritte Person, falls es bei vielen Gästen eine braucht, bekommt
 * denselben Vorschlag wie die zweite: sie kommt dazu, nicht später.
 */
export function foyerZeiten(shows: Array<{ uhrzeit: string }>): {
  vorschlag: Array<{ von: string; bis: string }>;
  pause: string | null;
} {
  if (shows.length === 0) return { vorschlag: [], pause: null };
  const erste = shows[0].uhrzeit;
  const letzte = shows[shows.length - 1].uhrzeit;
  const ende = plus(letzte, 180);
  const vorlauf = erste < "14:00" ? 90 : 120;
  const zweitePerson = { von: minus(erste, vorlauf - 45), bis: ende };
  const vorschlag = [{ von: minus(erste, vorlauf), bis: ende }, zweitePerson, zweitePerson];
  // Zwei Shows an einem Tag: dazwischen ist Pause, meist eine Dreiviertelstunde.
  const pause =
    shows.length > 1 ? `${minus(letzte, 120)} bis ${minus(letzte, 75)}` : null;
  return { vorschlag, pause };
}

/** Wer im Foyer arbeiten kann, mit dem Vermerk, wer fest angestellt ist. */
export async function foyerLeute(): Promise<FoyerPerson[]> {
  const z = (await db()`
    select b.id, b.name, b.email, coalesce(f.fest, false) as fest
      from benutzer b
      left join foyer_person f on f.benutzer_id = b.id
     where b.aktiv and (b.rolle = 'foyer' or f.benutzer_id is not null)
     order by coalesce(f.fest, false) desc, b.name
  `) as Array<{ id: string; name: string; email: string; fest: boolean }>;
  return z.map((r) => ({ id: r.id, name: r.name, email: r.email, fest: Boolean(r.fest) }));
}

export async function festSetzen(benutzerId: string, fest: boolean): Promise<void> {
  await db()`
    insert into foyer_person (benutzer_id, fest) values (${benutzerId}, ${fest})
    on conflict (benutzer_id) do update set fest = excluded.fest
  `;
}

/** Alle Einträge ab heute, für die Planung. */
async function diensteAb(datum: string): Promise<FoyerDienst[]> {
  const z = (await db()`
    select d.id, d.datum::text as datum, d.nummer, d.benutzer_id, b.name,
           coalesce(d.von, '') as von, coalesce(d.bis, '') as bis,
           d.freigabe, d.freigabe_von, d.notiz
      from foyer_dienst d left join benutzer b on b.id = d.benutzer_id
     where d.datum >= ${datum}::date
     order by d.datum, d.nummer
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    datum: String(r.datum),
    nummer: Number(r.nummer),
    benutzerId: (r.benutzer_id as string) ?? null,
    name: (r.name as string) ?? null,
    von: String(r.von ?? ""),
    bis: String(r.bis ?? ""),
    freigabe: (r.freigabe as Freigabe) ?? "nicht_noetig",
    freigabeVon: (r.freigabe_von as string) ?? null,
    notiz: String(r.notiz ?? ""),
  }));
}

/** Der Plan: je Showtag zwei Plätze, mit Zeiten und Stand der Freigabe. */
export async function foyerPlan(wochen = 8): Promise<FoyerTag[]> {
  const bis = Date.now() + wochen * 7 * 86400000;
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const [termine, dienste] = await Promise.all([kommendeTermine(400), diensteAb(heute)]);

  const nachTag = new Map<string, Vorstellungstermin[]>();
  for (const t of termine) {
    if (t.beginn.getTime() > bis) continue;
    nachTag.set(t.datum, [...(nachTag.get(t.datum) ?? []), t]);
  }

  return [...nachTag.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([datum, shows]) => {
      const sortiert = [...shows].sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));
      const { vorschlag, pause } = foyerZeiten(sortiert);
      const amTag = dienste.filter((d) => d.datum === datum);
      return {
        datum,
        shows: sortiert.map((s) => ({ uhrzeit: s.uhrzeit, name: s.name })),
        dienste: PLAETZE.map(
          (n) =>
            amTag.find((d) => d.nummer === n) ?? {
              id: "",
              datum,
              nummer: n,
              benutzerId: null,
              name: null,
              von: vorschlag[n - 1]?.von ?? "",
              bis: vorschlag[n - 1]?.bis ?? "",
              freigabe: "nicht_noetig" as Freigabe,
              freigabeVon: null,
              notiz: "",
            },
        ).concat(amTag.filter((d) => d.nummer > PLAETZE.length)),
        vorschlag,
        pause,
      };
    });
}

/** Einteilen oder wieder frei machen. Gibt den gespeicherten Eintrag zurück. */
export async function dienstSetzen(o: {
  datum: string;
  nummer: number;
  benutzerId: string | null;
  von: string;
  bis: string;
  freigabe: Freigabe;
  von_wem: string;
}): Promise<void> {
  await db()`
    insert into foyer_dienst (datum, nummer, benutzer_id, von, bis, freigabe, geaendert_von, geaendert_am)
    values (${o.datum}::date, ${o.nummer}, ${o.benutzerId}, ${o.von}, ${o.bis}, ${o.freigabe}, ${o.von_wem}, now())
    on conflict (datum, nummer) do update set
      benutzer_id = excluded.benutzer_id, von = excluded.von, bis = excluded.bis,
      freigabe = excluded.freigabe, freigabe_von = null, freigabe_am = null,
      geaendert_von = excluded.geaendert_von, geaendert_am = now()
  `;
}

export async function zeitenSetzen(o: {
  datum: string;
  nummer: number;
  von: string;
  bis: string;
  notiz: string;
  von_wem: string;
}): Promise<void> {
  await db()`
    insert into foyer_dienst (datum, nummer, von, bis, notiz, geaendert_von, geaendert_am)
    values (${o.datum}::date, ${o.nummer}, ${o.von}, ${o.bis}, ${o.notiz}, ${o.von_wem}, now())
    on conflict (datum, nummer) do update set
      von = excluded.von, bis = excluded.bis, notiz = excluded.notiz,
      geaendert_von = excluded.geaendert_von, geaendert_am = now()
  `;
}

