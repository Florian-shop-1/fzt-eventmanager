/**
 * Meldungen von Ditix, unverändert mitgeschrieben.
 *
 * Erster Schritt (Julian, 06.10.2026): Ditix meldet jeden Verkauf an Make,
 * und dieselbe Meldung kommt zusätzlich hierher. Hier wird nichts
 * ausgewertet, nur abgelegt. Erst wenn wir gesehen haben, wie die
 * Meldungen wirklich aussehen, bauen wir darauf auf.
 *
 * Siehe migrations/150_ditix_webhook_eingang.sql.
 */

import { db } from "@/lib/db/client";

/**
 * Das, was zum Abfragen gebraucht wird: eine Vorlage-Funktion, die Zeilen
 * liefert. Neon erfüllt das, und der Test reicht ein Postgres im
 * Arbeitsspeicher hinein.
 */
export type Abfrage = (teile: TemplateStringsArray, ...werte: unknown[]) => Promise<unknown[]>;

function standard(): Abfrage {
  return db() as unknown as Abfrage;
}

export const QUELLE = "ditix_verkauf";

/**
 * Legt die Tabelle an, falls es sie noch nicht gibt.
 *
 * Gleicher Inhalt wie migrations/150_ditix_webhook_eingang.sql. Das ist ein
 * Notbehelf für die Testphase: Der Webhook soll beim ersten Aufruf von
 * Ditix funktionieren, ohne dass vorher jemand die Migration einspielen
 * muss. Die Migration bleibt gültig, beide sind "if not exists", und ein
 * späteres "npm run migrate" richtet nichts an.
 *
 * Läuft einmal je Prozess. Scheitert es (etwa weil zwei Aufrufe gleichzeitig
 * anlegen wollen), wird es beim nächsten Aufruf noch einmal versucht.
 */
export const TABELLE_DDL = [
  `create table if not exists webhook_eingang (
     id            uuid        primary key default gen_random_uuid(),
     quelle        text        not null,
     nachricht_id  text,
     event_type    text        not null default '',
     order_id      text        not null default '',
     empfangen_am  timestamptz not null default now(),
     empfangen_n   int         not null default 1,
     zuletzt_am    timestamptz not null default now(),
     roh           jsonb       not null,
     kopf          jsonb       not null default '{}'::jsonb
   )`,
  "create unique index if not exists webhook_eingang_nachricht on webhook_eingang (quelle, nachricht_id)",
  "create index if not exists webhook_eingang_zeit on webhook_eingang (quelle, empfangen_am desc)",
  "create index if not exists webhook_eingang_order on webhook_eingang (quelle, order_id)",
];

/**
 * Entfernt interne Kopfzeilen aus Zeilen, die vor der Korrektur abgelegt wurden
 * (die Probe vom 06.10.2026 trug den Schlüssel in x-suche). Ohne Treffer
 * ändert es nichts und ist billig. Kann nach einigen Tagen entfallen.
 * Muss mit INTERN oben übereinstimmen.
 */
export const KOPF_BEREINIGUNG = `
  update webhook_eingang
     set kopf = coalesce((
           select jsonb_object_agg(e.k, e.v) from jsonb_each(kopf) as e(k, v)
            where e.k !~* '^(x-vercel-|x-forwarded-|forwarded$|x-pfad$|x-suche$|x-matched-path$|x-invocation-id$|x-nextjs-|x-middleware-|connection$|host$)'
         ), '{}'::jsonb)
   where kopf::text ~* '(x-vercel-|x-forwarded-|"forwarded"|x-pfad|x-suche|x-matched-path|x-invocation-id|x-nextjs-|x-middleware-|"connection"|"host")'`;

let bereit: Promise<void> | null = null;

function sorgeFuerTabelle(): Promise<void> {
  bereit ??= (async () => {
    const roh = db() as unknown as { query: (text: string) => Promise<unknown> };
    try {
      for (const anweisung of TABELLE_DDL) await roh.query(anweisung);
      await roh.query(KOPF_BEREINIGUNG);
    } catch (e) {
      bereit = null;
      console.error("[ditix-eingang] Tabelle anlegen:", e instanceof Error ? e.message : e);
    }
  })();
  return bereit;
}

/** Die Abfrage, die zu benutzen ist: die übergebene (Test) oder die echte, mit Tabelle. */
async function abfrage(gegeben?: Abfrage): Promise<Abfrage> {
  if (gegeben) return gegeben;
  await sorgeFuerTabelle();
  return standard();
}

/**
 * Kopfzeilen, deren Wert nie abgelegt wird: Sie tragen Schlüssel oder
 * Cookies. Nach dem Namen gesucht statt nach einer festen Liste, denn
 * Absender nennen sie verschieden (x-make-apikey, x-api-token, ...), und
 * ein vergessener Name hieße, dass ein Schlüssel im Klartext in der
 * Datenbank steht. Signaturen bleiben: Sie sind für sich kein Geheimnis,
 * und ihr Aufbau zeigt, ob wir die Echtheit einer Meldung prüfen können.
 */
const GEHEIM = /(auth|key|token|secret|schluessel|passw|cookie|credential)/i;

/**
 * Kopfzeilen, die nicht vom Absender kommen, sondern von Vercel und von
 * unserer eigenen Middleware (proxy.ts hängt x-pfad und x-suche an, und
 * x-suche enthält die ganze Adresse, also auch den Schlüssel).
 *
 * Sie sagen nichts darüber, wie Ditix sendet, aber manche tragen Geheimnisse
 * (x-vercel-sc-headers, x-vercel-proxy-signature, forwarded). Deshalb gar
 * nicht erst ablegen. Gefunden beim ersten Livetest am 06.10.2026.
 * Muss mit KOPF_BEREINIGUNG unten übereinstimmen.
 */
const INTERN = /^(x-vercel-|x-forwarded-|forwarded$|x-pfad$|x-suche$|x-matched-path$|x-invocation-id$|x-nextjs-|x-middleware-|connection$|host$)/i;

/** Was nach einem Schlüssel in einer Adresse aussieht, wird in jedem Wert geschwärzt. */
function saeubern(wert: string): string {
  let aus = wert.replace(/((?:schluessel|key|token|secret)=)[^&\s"]+/gi, "$1[entfernt]");
  for (const geheim of [process.env.DITIX_WEBHOOK_SCHLUESSEL, process.env.DITIX_PRUEF_SCHLUESSEL]) {
    if (geheim && geheim.length >= 8) aus = aus.split(geheim).join("[entfernt]");
  }
  return aus;
}

/** Wie viel von einem unlesbaren Rumpf aufgehoben wird. */
const MAX_UNLESBAR = 5000;

type Objekt = Record<string, unknown>;

function istObjekt(w: unknown): w is Objekt {
  return typeof w === "object" && w !== null && !Array.isArray(w);
}

function text(w: unknown): string {
  if (typeof w === "string") return w.trim().slice(0, 200);
  if (typeof w === "number" && Number.isFinite(w)) return String(w);
  return "";
}

/** Die Kopfzeilen der Anfrage, Schlüssel und Cookies geschwärzt. */
export function kopfzeilen(headers: Headers): Record<string, string> {
  const aus: Record<string, string> = {};
  headers.forEach((wert, name) => {
    const n = name.toLowerCase();
    if (INTERN.test(n)) return;
    // Dass die Kopfzeile da war, ist die Auskunft. Der Wert bleibt draußen.
    aus[n] = GEHEIM.test(n) ? "[entfernt]" : saeubern(wert).slice(0, 300);
  });
  return aus;
}

export interface Ablage {
  id: string;
  /** Dieselbe Meldung (gleiche message_id) war schon da. */
  wiederholt: boolean;
  /** Wie oft sie nun angekommen ist. */
  mal: number;
}

/**
 * Legt eine Meldung ab. Kommt dieselbe message_id noch einmal, wird nichts
 * doppelt abgelegt, aber mitgezählt: So sehen wir, ob Ditix wiederholt.
 */
export async function legeMeldungAb(
  roh: unknown,
  kopf: Record<string, string> = {},
  sqlGegeben?: Abfrage,
): Promise<Ablage> {
  const sql = await abfrage(sqlGegeben);
  const objekt = istObjekt(roh) ? roh : {};
  const daten = istObjekt(objekt.data) ? objekt.data : {};

  const zeilen = (await sql`
    insert into webhook_eingang (quelle, nachricht_id, event_type, order_id, roh, kopf)
    values (${QUELLE}, ${text(objekt.message_id) || null}, ${text(objekt.event_type)},
            ${text(daten.order_id)}, ${JSON.stringify(roh ?? null)}::jsonb,
            ${JSON.stringify(kopf)}::jsonb)
    on conflict (quelle, nachricht_id) do update set
      empfangen_n = webhook_eingang.empfangen_n + 1,
      zuletzt_am  = now()
    returning id, empfangen_n
  `) as Array<{ id: string; empfangen_n: number }>;

  const z = zeilen[0];
  if (!z) throw new Error("Meldung wurde nicht abgelegt.");
  return { id: z.id, wiederholt: Number(z.empfangen_n) > 1, mal: Number(z.empfangen_n) };
}

/** Rumpf, der kein JSON war: trotzdem aufheben, damit er sichtbar wird. */
export function unlesbar(rumpf: string): { _unlesbar: string } {
  return { _unlesbar: rumpf.slice(0, MAX_UNLESBAR) };
}

export interface Eingang {
  id: string;
  empfangenAm: string;
  zuletztAm: string;
  eventType: string;
  orderId: string;
  nachrichtId: string | null;
  mal: number;
  kopf: Record<string, string>;
  roh: unknown;
}

function alsText(w: unknown): string {
  return w instanceof Date ? w.toISOString() : String(w ?? "");
}

function alsJson<T>(w: unknown, leer: T): T {
  if (typeof w === "string") {
    try {
      return JSON.parse(w) as T;
    } catch {
      return leer;
    }
  }
  return (w ?? leer) as T;
}

/** Die letzten Meldungen, neueste zuerst. */
export async function letzteMeldungen(limit = 20, sqlGegeben?: Abfrage): Promise<Eingang[]> {
  const sql = await abfrage(sqlGegeben);
  const n = Math.max(1, Math.min(200, Math.round(limit)));
  const z = (await sql`
    select id, empfangen_am, zuletzt_am, event_type, order_id, nachricht_id, empfangen_n, kopf, roh
      from webhook_eingang
     where quelle = ${QUELLE}
     order by empfangen_am desc
     limit ${n}
  `) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    id: String(r.id),
    empfangenAm: alsText(r.empfangen_am),
    zuletztAm: alsText(r.zuletzt_am),
    eventType: String(r.event_type ?? ""),
    orderId: String(r.order_id ?? ""),
    nachrichtId: r.nachricht_id === null || r.nachricht_id === undefined ? null : String(r.nachricht_id),
    mal: Number(r.empfangen_n ?? 1),
    kopf: alsJson<Record<string, string>>(r.kopf, {}),
    roh: alsJson<unknown>(r.roh, null),
  }));
}

export interface Pfad {
  pfad: string;
  /** In wie vielen der untersuchten Meldungen er vorkommt. */
  vorkommen: number;
  /** Welche Werttypen dort standen, etwa "string" oder "number". */
  typen: string[];
  /** Ein Beispielwert, nur bei Kurztext und Zahlen, nie bei Namen oder Adressen. */
  beispiel?: string;
}

/** Felder, deren Werte nie als Beispiel erscheinen: Sie sind persönlich. */
const PERSOENLICH =
  /(name|email|mail|phone|telefon|street|strasse|zip|plz|city|ort|address|company|firma|token|code)/i;

function typVon(w: unknown): string {
  if (w === null) return "null";
  if (Array.isArray(w)) return "array";
  return typeof w;
}

function sammle(w: unknown, pfad: string, aus: Map<string, Pfad>) {
  const eintrag = (typ: string, beispiel?: unknown) => {
    const e = aus.get(pfad) ?? { pfad, vorkommen: 0, typen: [] };
    e.vorkommen++;
    if (!e.typen.includes(typ)) e.typen.push(typ);
    if (
      e.beispiel === undefined &&
      (typeof beispiel === "string" || typeof beispiel === "number") &&
      !PERSOENLICH.test(pfad) &&
      String(beispiel).length <= 60
    ) {
      e.beispiel = String(beispiel);
    }
    aus.set(pfad, e);
  };

  if (Array.isArray(w)) {
    eintrag("array");
    // Bei Listen zählt die Form der Einträge, nicht ihre Reihenfolge.
    for (const x of w.slice(0, 50)) sammle(x, `${pfad}[]`, aus);
  } else if (istObjekt(w)) {
    if (pfad) eintrag("object");
    for (const [k, v] of Object.entries(w)) sammle(v, pfad ? `${pfad}.${k}` : k, aus);
  } else {
    eintrag(typVon(w), w);
  }
}

export interface Uebersicht {
  untersucht: number;
  nachArt: Record<string, number>;
  /** Meldungen, die mehr als einmal ankamen. */
  wiederholt: number;
  /** Bestellungen, zu denen mehr als eine Meldung kam. */
  bestellungenMitMehrerenMeldungen: number;
  /** Alle Felder, die in den Meldungen vorkommen, mit Typ und Häufigkeit. */
  felder: Pfad[];
  /** Welche Kopfzeilen Ditix mitschickt, mit Häufigkeit. */
  kopfzeilen: Record<string, number>;
}

/** Fasst zusammen, wie die letzten Meldungen aufgebaut sind. */
export async function uebersicht(limit = 200, sqlGegeben?: Abfrage): Promise<Uebersicht> {
  const sql = await abfrage(sqlGegeben);
  const liste = await letzteMeldungen(limit, sql);
  const felder = new Map<string, Pfad>();
  const arten: Record<string, number> = {};
  const kopf: Record<string, number> = {};
  const jeBestellung = new Map<string, number>();

  for (const m of liste) {
    sammle(m.roh, "", felder);
    const art = m.eventType || "(leer)";
    arten[art] = (arten[art] ?? 0) + 1;
    for (const k of Object.keys(m.kopf)) kopf[k] = (kopf[k] ?? 0) + 1;
    if (m.orderId) jeBestellung.set(m.orderId, (jeBestellung.get(m.orderId) ?? 0) + 1);
  }

  return {
    untersucht: liste.length,
    nachArt: arten,
    wiederholt: liste.filter((m) => m.mal > 1).length,
    bestellungenMitMehrerenMeldungen: [...jeBestellung.values()].filter((n) => n > 1).length,
    felder: [...felder.values()].sort((a, b) => a.pfad.localeCompare(b.pfad)),
    kopfzeilen: kopf,
  };
}

export interface Pruefbericht {
  stand: string;
  insgesamt: number;
  ersteAm: string | null;
  letzteAm: string | null;
  /** Meldungen je Tag (deutsche Zeit), neueste zuerst. */
  tage: Array<{ tag: string; meldungen: number; bestellungen: number; nachArt: Record<string, number> }>;
  nachArt: Record<string, number>;
  /** Meldungen, die mehrfach angekommen sind (gleiche message_id). */
  wiederholt: number;
  /** Rümpfe, die kein JSON waren. */
  unlesbar: number;
  ohneBestellnummer: number;
  ohneNachrichtId: number;
  bestellungenMitMehrerenMeldungen: number;
  /** Zeilen, in deren Kopfzeilen noch Internes oder ein Schlüssel steht. Muss 0 sein. */
  kopfBelastet: number;
  /** Kopfzeilen der neuesten Meldung. Schlüssel sind geschwärzt. */
  kopfzeilen: Record<string, string>;
  /** Ticket-Typen, wie Ditix sie nennt, mit Menge aus den letzten 200 Meldungen. */
  ticketTypen: Array<{ name: string; tickets: number; meldungen: number }>;
  veranstaltungen: Array<{ name: string; meldungen: number }>;
  /** Nur Zahlen, nie ein Betrag zu einer Bestellung. */
  betrag: { anzahl: number; kleinster: number | null; groesster: number | null; mitNachkomma: number };
  /** Aufbau der Meldungen. Beispielwerte nie bei Personen, Beträgen oder Codes. */
  felder: Pfad[];
  /** Die letzten Meldungen, nur Kennungen und Mengen, nie Namen oder Adressen. */
  letzte: Array<{
    empfangenAm: string;
    art: string;
    bestellung: string;
    nachrichtId: string | null;
    mal: number;
    veranstaltungen: number;
    ticketTypen: number;
    tickets: number;
  }>;
}

/** Pfade, bei denen auch kein Beispielwert in den Prüfbericht gehört. */
const NICHT_ALS_BEISPIEL = /(amount|betrag|price|preis)/i;

/**
 * Bericht zum Prüfen, ob die Meldungen sauber ankommen.
 *
 * Enthält bewusst nichts Persönliches: keine Namen, Adressen, E-Mails und
 * keinen Betrag zu einer Bestellung. Er ist dafür gedacht, von außen mit
 * einem eigenen, nur lesenden Schlüssel abgerufen zu werden
 * (/api/ditix/pruefung), etwa für den Abgleich mit Make.
 */
export async function pruefbericht(sqlGegeben?: Abfrage): Promise<Pruefbericht> {
  const sql = await abfrage(sqlGegeben);

  const summe = (await sql`
    select count(*)::int as n,
           (extract(epoch from min(empfangen_am)) * 1000)::float8 as erste_ms,
           (extract(epoch from max(empfangen_am)) * 1000)::float8 as letzte_ms,
           count(*) filter (where empfangen_n > 1)::int as wiederholt,
           count(*) filter (where jsonb_exists(roh, '_unlesbar'))::int as unlesbar,
           count(*) filter (where order_id = '')::int as ohne_bestellung,
           count(*) filter (where nachricht_id is null)::int as ohne_id
      from webhook_eingang where quelle = ${QUELLE}
  `) as Array<Record<string, number | null>>;

  const jeTagUndArt = (await sql`
    select to_char(empfangen_am at time zone 'Europe/Berlin', 'YYYY-MM-DD') as tag,
           coalesce(nullif(event_type, ''), '(leer)') as art,
           count(*)::int as n
      from webhook_eingang
     where quelle = ${QUELLE} and empfangen_am > now() - interval '60 days'
     group by 1, 2 order by 1 desc
  `) as Array<{ tag: string; art: string; n: number }>;

  const jeTag = (await sql`
    select to_char(empfangen_am at time zone 'Europe/Berlin', 'YYYY-MM-DD') as tag,
           count(distinct nullif(order_id, ''))::int as bestellungen
      from webhook_eingang
     where quelle = ${QUELLE} and empfangen_am > now() - interval '60 days'
     group by 1
  `) as Array<{ tag: string; bestellungen: number }>;

  const mehrfach = (await sql`
    select count(*)::int as n from (
      select order_id from webhook_eingang
       where quelle = ${QUELLE} and order_id <> ''
       group by order_id having count(*) > 1) x
  `) as Array<{ n: number }>;

  const belastet = (await sql`
    select count(*)::int as n from webhook_eingang
     where quelle = ${QUELLE}
       and kopf::text ~* '(schluessel=|x-suche|x-pfad|x-vercel-sc-headers|x-vercel-proxy-signature|"forwarded")'
  `) as Array<{ n: number }>;

  const liste = await letzteMeldungen(200, sql);
  const uebers = await uebersicht(200, sql);

  const tage = new Map<string, Pruefbericht["tage"][number]>();
  for (const z of jeTagUndArt) {
    const t = tage.get(z.tag) ?? { tag: z.tag, meldungen: 0, bestellungen: 0, nachArt: {} };
    t.meldungen += Number(z.n);
    t.nachArt[z.art] = Number(z.n);
    tage.set(z.tag, t);
  }
  for (const z of jeTag) {
    const t = tage.get(z.tag);
    if (t) t.bestellungen = Number(z.bestellungen);
  }

  const typen = new Map<string, { tickets: number; meldungen: number }>();
  const shows = new Map<string, number>();
  const betraege: number[] = [];

  const ausDaten = (roh: unknown) => (istObjekt(roh) && istObjekt(roh.data) ? roh.data : {});
  const events = (roh: unknown): unknown[] => {
    const e = ausDaten(roh).events;
    return Array.isArray(e) ? e : [];
  };

  const letzte = liste.slice(0, 40).map((m) => {
    let ticketTypen = 0;
    let tickets = 0;
    for (const e of events(m.roh)) {
      const typen2 = istObjekt(e) && Array.isArray(e.ticketTypes) ? e.ticketTypes : [];
      for (const t of typen2 as unknown[]) {
        ticketTypen++;
        if (istObjekt(t) && Array.isArray(t.tickets)) tickets += t.tickets.length;
      }
    }
    return {
      empfangenAm: m.empfangenAm,
      art: m.eventType,
      bestellung: m.orderId,
      nachrichtId: m.nachrichtId,
      mal: m.mal,
      veranstaltungen: events(m.roh).length,
      ticketTypen,
      tickets,
    };
  });

  for (const m of liste) {
    const seen = new Set<string>();
    for (const e of events(m.roh)) {
      if (!istObjekt(e)) continue;
      const showName = text(e.name);
      if (showName) shows.set(showName, (shows.get(showName) ?? 0) + 1);
      for (const t of Array.isArray(e.ticketTypes) ? e.ticketTypes : []) {
        if (!istObjekt(t)) continue;
        const name = text(t.name) || "(ohne Namen)";
        const n = Array.isArray(t.tickets) ? t.tickets.length : 0;
        const z = typen.get(name) ?? { tickets: 0, meldungen: 0 };
        z.tickets += n;
        if (!seen.has(name)) {
          z.meldungen++;
          seen.add(name);
        }
        typen.set(name, z);
      }
    }
    const betrag = ausDaten(m.roh).order_amount_gross;
    if (istObjekt(betrag)) {
      const zahl = typeof betrag.amount === "number" ? betrag.amount : Number(text(betrag.amount));
      if (Number.isFinite(zahl)) betraege.push(zahl);
    }
  }

  const s = summe[0] ?? {};
  const ms = (w: number | null | undefined) => (w ? new Date(Number(w)).toISOString() : null);
  const nachArt: Record<string, number> = {};
  for (const z of jeTagUndArt) nachArt[z.art] = (nachArt[z.art] ?? 0) + Number(z.n);

  return {
    stand: new Date().toISOString(),
    insgesamt: Number(s.n ?? 0),
    ersteAm: ms(s.erste_ms),
    letzteAm: ms(s.letzte_ms),
    tage: [...tage.values()].slice(0, 30),
    nachArt,
    wiederholt: Number(s.wiederholt ?? 0),
    unlesbar: Number(s.unlesbar ?? 0),
    ohneBestellnummer: Number(s.ohne_bestellung ?? 0),
    ohneNachrichtId: Number(s.ohne_id ?? 0),
    bestellungenMitMehrerenMeldungen: Number(mehrfach[0]?.n ?? 0),
    kopfBelastet: Number(belastet[0]?.n ?? 0),
    kopfzeilen: liste[0]?.kopf ?? {},
    ticketTypen: [...typen.entries()]
      .map(([name, z]) => ({ name, ...z }))
      .sort((a, b) => b.tickets - a.tickets),
    veranstaltungen: [...shows.entries()]
      .map(([name, meldungen]) => ({ name, meldungen }))
      .sort((a, b) => b.meldungen - a.meldungen),
    betrag: {
      anzahl: betraege.length,
      kleinster: betraege.length ? Math.min(...betraege) : null,
      groesster: betraege.length ? Math.max(...betraege) : null,
      mitNachkomma: betraege.filter((b) => !Number.isInteger(b)).length,
    },
    felder: uebers.felder.map((f) => {
      if (f.beispiel !== undefined && NICHT_ALS_BEISPIEL.test(f.pfad)) {
        const { beispiel: _weg, ...ohne } = f;
        void _weg;
        return ohne;
      }
      return f;
    }),
    letzte,
  };
}
