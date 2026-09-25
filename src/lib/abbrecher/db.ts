/**
 * Abgebrochene Warenkörbe. Siehe migrations/075_abbrecher.sql.
 *
 * Ein Abbrecher ist eine Buchung, die der Shop gemeldet hat, bei der aber
 * nie eine Zahlung ankam. Der Gast hat also Plätze gewählt, seine Daten
 * eingetippt und ist an der Kasse abgesprungen.
 *
 * Wichtig für alles Weitere: Angeschrieben wird nur, wer im Shop
 * zugestimmt hat (werbe_ok). Wer nicht zugestimmt hat, steht trotzdem in
 * der Liste, damit das Büro die großen Körbe anrufen kann, soweit das
 * zulässig ist.
 */

import { db } from "@/lib/db/client";

export interface Abbrecher {
  id: string;
  cartId: string | null;
  /** Der Termin in Ditix, für den Tiefenlink zurück in die Buchung. */
  ditixEventId: string;
  datum: string;
  uhrzeit: string;
  show: string;
  name: string;
  email: string;
  telefon: string;
  plaetze: number | null;
  gesamtCent: number | null;
  zugangToken: string;
  werbeOk: boolean;
  eingegangenAm: string;
  frageAm: string | null;
  angebotAm: string | null;
  abbruchGrund: string | null;
  abbruchText: string | null;
  posten: Array<{ name: string; anzahl: number; gruppe: string }>;
  /** Hat dieselbe Adresse später doch gekauft? */
  spaeterGekauft: boolean;
  /* Vertrieb, siehe vertrieb.ts */
  status: string;
  bearbeiterId: string | null;
  bearbeiter: string | null;
  vertriebNotiz: string;
  vertriebAm: string | null;
  wiedervorlage: string | null;
}

const GRUND_TEXT: Record<string, string> = {
  preis: "zu teuer",
  termin: "Termin passte nicht",
  technik: "technisches Problem",
  ruecksprache: "wollte erst Rücksprache halten",
  anders: "etwas anderes",
};

export function grundText(grund: string | null): string {
  return grund ? (GRUND_TEXT[grund] ?? grund) : "";
}

export const GRUENDE = Object.entries(GRUND_TEXT).map(([wert, text]) => ({ wert, text }));

/**
 * Die offenen Körbe der letzten Wochen.
 *
 * Die jüngsten zehn Minuten bleiben außen vor: Wer gerade eben an der
 * Kasse steht, hat nicht abgebrochen, der bezahlt noch. Fürs Anschreiben
 * gelten längere Fristen, die stehen im täglichen Lauf.
 *
 * "Später gekauft" zählt nur, was NACH dem Abbruch eingegangen ist. Ohne
 * diese Bedingung verschwand jeder neue Abbruch von jemandem, der
 * irgendwann einmal bei uns gebucht hatte: Florians eigener Testabbruch
 * war deshalb nicht in der Liste zu finden (23.09.2026).
 */
export async function abbrecher(tage = 30): Promise<Abbrecher[]> {
  const z = (await db()`
    select b.*, b.datum::text as datum, b.wiedervorlage::text as wiedervorlage,
           (select n.name from benutzer n where n.id = b.vertrieb_wer) as bearbeiter,
           exists (
             select 1 from shop_buchung k
              where k.bestaetigt and k.email <> '' and lower(k.email) = lower(b.email)
                and k.eingegangen_am > b.eingegangen_am
           ) as spaeter_gekauft,
           coalesce(
             (select json_agg(json_build_object('name', p.name, 'anzahl', p.anzahl, 'gruppe', p.gruppe))
                from shop_buchung_posten p where p.buchung_id = b.id),
             '[]'
           ) as posten
      from shop_buchung b
     where not b.bestaetigt
       and b.email <> ''
       and b.eingegangen_am < now() - interval '10 minutes'
       and b.eingegangen_am >= now() - (${tage} || ' days')::interval
     order by b.eingegangen_am desc
  `) as Array<Record<string, unknown>>;

  return z.map(bauen);
}

function bauen(r: Record<string, unknown>): Abbrecher {
  return ({
    id: String(r.id),
    cartId: (r.cart_id as string) ?? null,
    ditixEventId: String(r.ditix_event_id ?? ""),
    datum: String(r.datum),
    uhrzeit: String(r.uhrzeit ?? ""),
    show: String(r.show ?? ""),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    telefon: String(r.telefon ?? ""),
    plaetze: r.plaetze === null ? null : Number(r.plaetze),
    gesamtCent: r.gesamt_cent === null ? null : Number(r.gesamt_cent),
    zugangToken: String(r.zugang_token ?? ""),
    werbeOk: Boolean(r.werbe_ok),
    eingegangenAm: new Date(r.eingegangen_am as string).toISOString(),
    frageAm: r.frage_am ? new Date(r.frage_am as string).toISOString() : null,
    angebotAm: r.angebot_am ? new Date(r.angebot_am as string).toISOString() : null,
    abbruchGrund: (r.abbruch_grund as string) ?? null,
    abbruchText: (r.abbruch_text as string) ?? null,
    posten: (r.posten as Array<{ name: string; anzahl: number; gruppe: string }>) ?? [],
    spaeterGekauft: Boolean(r.spaeter_gekauft),
    status: String(r.vertrieb_status ?? "neu"),
    bearbeiterId: (r.vertrieb_wer as string) ?? null,
    bearbeiter: (r.bearbeiter as string) ?? null,
    vertriebNotiz: String(r.vertrieb_notiz ?? ""),
    vertriebAm: r.vertrieb_am ? new Date(r.vertrieb_am as string).toISOString() : null,
    wiedervorlage: (r.wiedervorlage as string) ?? null,
  });
}

/**
 * Eine Buchung über den Schlüssel aus der Mail.
 *
 * Bewusst ohne die Filter der Abbrecherliste: Die Angebotsseite muss auch
 * dann noch funktionieren, wenn der Gast inzwischen gebucht hat oder der
 * Abbruch gerade erst passiert ist. Sonst stünde dort "Diesen Link kennen
 * wir nicht mehr", obwohl alles in Ordnung ist (23.09.2026).
 */
export async function buchungPerToken(token: string): Promise<Abbrecher | null> {
  const z = (await db()`
    select b.*, b.datum::text as datum, b.wiedervorlage::text as wiedervorlage,
           (select n.name from benutzer n where n.id = b.vertrieb_wer) as bearbeiter,
           exists (
             select 1 from shop_buchung k
              where k.bestaetigt and k.email <> '' and lower(k.email) = lower(b.email)
                and k.eingegangen_am > b.eingegangen_am
           ) as spaeter_gekauft,
           coalesce(
             (select json_agg(json_build_object('name', p.name, 'anzahl', p.anzahl, 'gruppe', p.gruppe))
                from shop_buchung_posten p where p.buchung_id = b.id),
             '[]'
           ) as posten
      from shop_buchung b
     where b.zugang_token = ${token}
     limit 1
  `) as Array<Record<string, unknown>>;
  return z[0] ? bauen(z[0]) : null;
}

/** Die Antwort auf "Was hat dich abgehalten?" festhalten. */
export async function grundMerken(token: string, grund: string, text: string): Promise<boolean> {
  const z = (await db()`
    update shop_buchung
       set abbruch_grund = ${grund}, abbruch_grund_am = now(), abbruch_text = ${text.slice(0, 500)}
     where zugang_token = ${token}
    returning id
  `) as Array<unknown>;
  return z.length > 0;
}

export async function frageVermerken(id: string): Promise<void> {
  await db()`update shop_buchung set frage_am = now() where id = ${id}`;
}

export async function angebotVermerken(id: string): Promise<void> {
  await db()`update shop_buchung set angebot_am = now() where id = ${id}`;
}

/** Zahlen für die Übersicht: wie viel Geld liegt da, und was sagen die Leute? */
export async function abbruchZahlen(tage = 30): Promise<{
  anzahl: number;
  summeCent: number;
  mitEinwilligung: number;
  gefragt: number;
  geantwortet: number;
  gruende: Array<{ grund: string; anzahl: number }>;
}> {
  const z = (await db()`
    select count(*) as anzahl,
           coalesce(sum(gesamt_cent), 0) as summe,
           count(*) filter (where werbe_ok) as mit_ok,
           count(*) filter (where frage_am is not null) as gefragt,
           count(*) filter (where abbruch_grund is not null) as geantwortet
      from shop_buchung
     where not bestaetigt and email <> ''
       and eingegangen_am >= now() - (${tage} || ' days')::interval
  `) as Array<Record<string, unknown>>;

  const g = (await db()`
    select abbruch_grund as grund, count(*) as anzahl
      from shop_buchung
     where abbruch_grund is not null
       and eingegangen_am >= now() - (${tage} || ' days')::interval
     group by 1 order by 2 desc
  `) as Array<Record<string, unknown>>;

  const r = z[0] ?? {};
  return {
    anzahl: Number(r.anzahl ?? 0),
    summeCent: Number(r.summe ?? 0),
    mitEinwilligung: Number(r.mit_ok ?? 0),
    gefragt: Number(r.gefragt ?? 0),
    geantwortet: Number(r.geantwortet ?? 0),
    gruende: g.map((x) => ({ grund: String(x.grund), anzahl: Number(x.anzahl) })),
  };
}

/* ------------------------------------------------------------------ *
 * Der Schalter
 *
 * Aus, bis Florian einschaltet, und danach hoechstens eine begrenzte Zahl
 * je Lauf. Beim ersten Probelauf standen 228 Mails an: So etwas darf
 * keine naechtliche Uhr von sich aus hinausschicken (23.09.2026).
 * ------------------------------------------------------------------ */

export interface AbbruchEinstellung {
  aktiv: boolean;
  hoechstens: number;
  geaendertAm: string;
  geaendertVon: string | null;
}

export async function abbruchEinstellung(): Promise<AbbruchEinstellung> {
  const z = (await db()`select * from abbruch_einstellung where id = 1`) as Array<Record<string, unknown>>;
  const r = z[0] ?? {};
  return {
    aktiv: Boolean(r.aktiv),
    hoechstens: Number(r.hoechstens ?? 40),
    geaendertAm: r.geaendert_am ? new Date(r.geaendert_am as string).toISOString() : new Date().toISOString(),
    geaendertVon: (r.geaendert_von as string) ?? null,
  };
}

export async function abbruchSchalten(aktiv: boolean, wer: string): Promise<void> {
  await db()`
    update abbruch_einstellung set aktiv = ${aktiv}, geaendert_am = now(), geaendert_von = ${wer} where id = 1
  `;
}
