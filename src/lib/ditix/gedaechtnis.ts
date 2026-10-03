/**
 * Das Gedaechtnis fuer den Spielplan. Siehe migrations/134_spielplan_gedaechtnis.sql.
 *
 * Der Ticketshop nennt nur Vorstellungen, fuer die man noch Karten kaufen
 * kann. Mit dem Showbeginn fallen sie aus seiner Liste, und damit waere im
 * Eventmanager am selben Abend der ganze Tag verschwunden: Funktionsheet,
 * Sitzplan, Einlassliste, Küchenblatt (Florian, 03.10.2026).
 *
 * Also schreiben wir jeden Termin mit, den der Shop einmal genannt hat.
 * Verschwindet er dort, holen wir ihn von hier.
 */

import { db } from "@/lib/db/client";
import type { ShopVorstellung } from "@/lib/ditix/spielplan";

/**
 * Wie lange ein vergessener Termin weiter mitgeschleppt wird.
 *
 * Grosszuegig: Abgerechnet und nachgezaehlt wird manchmal Wochen spaeter,
 * und eine Zeile pro Vorstellung kostet nichts.
 */
const MERKEN_TAGE = 400;

/** Wie oft wir hoechstens schreiben. Gelesen wird viel oefter als gespielt. */
const SCHREIBPAUSE_MS = 15 * 60 * 1000;

let zuletztGeschrieben = 0;

/**
 * Den Spielplan mitschreiben.
 *
 * Laeuft nebenbei beim Lesen. Geht es schief, ist das kein Grund, eine
 * Seite nicht anzuzeigen: Dann fehlt nur die Erinnerung, nicht der Plan.
 */
export async function termineMerken(vorstellungen: ShopVorstellung[]): Promise<void> {
  if (vorstellungen.length === 0) return;
  const jetzt = Date.now();
  if (jetzt - zuletztGeschrieben < SCHREIBPAUSE_MS) return;
  zuletztGeschrieben = jetzt;

  const daten = JSON.stringify(
    vorstellungen.map((v) => ({
      event_id: String(v.id),
      name: String(v.name ?? "").trim(),
      beginn: Number(v.timestampStart),
      ende: v.timestampEnd ? Number(v.timestampEnd) : null,
      ort: String(v.location ?? ""),
      verkauf: String(v.ticketSaleState ?? ""),
      art: String(v.kind ?? ""),
      seatmap_event_id: v.seatmapEventId ?? null,
      seatmap_schema_id: v.seatmapSchemaId ?? null,
    })),
  );

  try {
    await db()`
      insert into spielplan_termin
        (event_id, name, beginn, ende, ort, verkauf, art, seatmap_event_id, seatmap_schema_id, gesehen_am)
      select x.event_id, x.name,
             to_timestamp(x.beginn / 1000.0),
             case when x.ende is null then null else to_timestamp(x.ende / 1000.0) end,
             coalesce(x.ort, ''), coalesce(x.verkauf, ''), coalesce(x.art, ''),
             x.seatmap_event_id, x.seatmap_schema_id, now()
        from jsonb_to_recordset(${daten}::jsonb) as x(
               event_id text, name text, beginn bigint, ende bigint, ort text,
               verkauf text, art text, seatmap_event_id text, seatmap_schema_id text)
       where x.event_id is not null and x.beginn is not null
      on conflict (event_id) do update
        set name = excluded.name,
            beginn = excluded.beginn,
            ende = excluded.ende,
            ort = excluded.ort,
            verkauf = excluded.verkauf,
            art = excluded.art,
            seatmap_event_id = coalesce(excluded.seatmap_event_id, spielplan_termin.seatmap_event_id),
            seatmap_schema_id = coalesce(excluded.seatmap_schema_id, spielplan_termin.seatmap_schema_id),
            gesehen_am = now()
    `;
  } catch (f) {
    console.error("[spielplan] Termine nicht gemerkt:", f);
    // Beim naechsten Mal wieder versuchen, nicht erst in einer Viertelstunde.
    zuletztGeschrieben = 0;
  }
}

/** Alle gemerkten Termine der letzten Zeit, in der Form des Shops. */
export async function gemerkteTermine(): Promise<ShopVorstellung[]> {
  const z = (await db()`
    select event_id, name, beginn, ende, ort, verkauf, art, seatmap_event_id, seatmap_schema_id
      from spielplan_termin
     where beginn > now() - make_interval(days => ${MERKEN_TAGE})
     order by beginn
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    id: String(r.event_id),
    code: "",
    name: String(r.name ?? ""),
    timestampStart: new Date(r.beginn as string).getTime(),
    timestampEnd: r.ende ? new Date(r.ende as string).getTime() : 0,
    location: String(r.ort ?? ""),
    ticketSaleState: String(r.verkauf ?? ""),
    kind: String(r.art ?? ""),
    seatmapEventId: r.seatmap_event_id ? String(r.seatmap_event_id) : undefined,
    seatmapSchemaId: r.seatmap_schema_id ? String(r.seatmap_schema_id) : undefined,
  }));
}
