/**
 * WhatsApp-Verlauf: speichern, was ankommt, und für den Posteingang lesen.
 *
 * Siehe migrations/030_whatsapp.sql für den Aufbau und warum der Lesestand
 * für alle gemeinsam gilt.
 */

import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, type AngemeldeterBenutzer } from "@/lib/auth/sitzung";
import type { Ereignis } from "@/lib/whatsapp/eingang";

/** 24 Stunden nach der letzten Kundennachricht schliesst WhatsApp das Fenster. */
export const FENSTER_STUNDEN = 24;

export interface Unterhaltung {
  waId: string;
  profilname: string | null;
  letzteNachrichtAm: string | null;
  letzterText: string | null;
  letzteRichtung: "ein" | "aus" | null;
  ungelesen: boolean;
  fensterOffen: boolean;
}

export interface Nachricht {
  id: string;
  richtung: "ein" | "aus";
  herkunft: "kunde" | "eventmanager" | "app";
  typ: string;
  text: string | null;
  zeitpunkt: string;
  status: string | null;
  fehler: string | null;
  gesendetVon: string | null;
}

/**
 * Nur wer die Freigabe hat. Liefert den Benutzer, damit die Aufrufer ihn
 * nicht ein zweites Mal aus der Datenbank holen.
 */
export async function verlangeWhatsApp(): Promise<AngemeldeterBenutzer> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer?.whatsapp) {
    throw new Error("Für den WhatsApp-Posteingang fehlt die Freigabe.");
  }
  return benutzer;
}

/**
 * Legt ab, was der Webhook meldet.
 *
 * Jede Nachricht nur einmal: 360dialog wiederholt ein Päckchen, wenn die
 * Antwort ausbleibt, und dann steht dieselbe Kennung ein zweites Mal da.
 */
export async function ereignisseSpeichern(ereignisse: Ereignis[]): Promise<void> {
  const sql = db();

  for (const e of ereignisse) {
    if (e.art === "nachricht") {
      await sql`
        insert into wa_unterhaltung (wa_id, profilname, letzte_nachricht_am, letzte_eingang_am)
        values (${e.waId}, ${e.profilname}, ${e.zeitpunkt}, ${e.zeitpunkt})
        on conflict (wa_id) do update set
          profilname = coalesce(excluded.profilname, wa_unterhaltung.profilname),
          letzte_nachricht_am = greatest(wa_unterhaltung.letzte_nachricht_am, excluded.letzte_nachricht_am),
          letzte_eingang_am = greatest(wa_unterhaltung.letzte_eingang_am, excluded.letzte_eingang_am)
      `;
      await sql`
        insert into wa_nachricht (meta_id, wa_id, richtung, herkunft, typ, text, zeitpunkt, roh)
        values (${e.metaId}, ${e.waId}, 'ein', 'kunde', ${e.typ}, ${e.text}, ${e.zeitpunkt},
                ${JSON.stringify(e.roh)}::jsonb)
        on conflict (meta_id) do nothing
      `;
    }

    if (e.art === "echo") {
      /*
        Jemand hat in der App geantwortet. Das zählt als erledigt: Die
        Unterhaltung ist dann auch im Eventmanager nicht mehr neu, sonst
        schreibt der Nächste dem Kunden dasselbe noch einmal.
      */
      await sql`
        insert into wa_unterhaltung (wa_id, letzte_nachricht_am, gelesen_am, gelesen_von)
        values (${e.waId}, ${e.zeitpunkt}, ${e.zeitpunkt}, 'WhatsApp App')
        on conflict (wa_id) do update set
          letzte_nachricht_am = greatest(wa_unterhaltung.letzte_nachricht_am, excluded.letzte_nachricht_am),
          gelesen_am = greatest(wa_unterhaltung.gelesen_am, excluded.gelesen_am),
          gelesen_von = 'WhatsApp App'
      `;
      await sql`
        insert into wa_nachricht (meta_id, wa_id, richtung, herkunft, typ, text, zeitpunkt, status, roh)
        values (${e.metaId}, ${e.waId}, 'aus', 'app', ${e.typ}, ${e.text}, ${e.zeitpunkt}, 'sent',
                ${JSON.stringify(e.roh)}::jsonb)
        on conflict (meta_id) do nothing
      `;
    }

    if (e.art === "status") {
      /*
        Ein Status darf nur vorwärts gehen. Die Meldungen kommen nicht
        zwingend in der richtigen Reihenfolge, und "zugestellt" nach
        "gelesen" würde den Haken wieder zurücksetzen.
      */
      await sql`
        update wa_nachricht set
          status = ${e.status},
          fehler = coalesce(${e.fehler}, fehler)
         where meta_id = ${e.metaId}
           and (
             ${e.status}::text = 'failed'
             or array_position(array['sent','delivered','read'], ${e.status}::text)
                > coalesce(array_position(array['sent','delivered','read'], status), 0)
           )
      `;
    }
  }
}

export async function holeUnterhaltungen(): Promise<Unterhaltung[]> {
  await verlangeWhatsApp();
  const zeilen = (await db()`
    select u.wa_id, u.profilname, u.letzte_nachricht_am, u.letzte_eingang_am, u.gelesen_am,
           n.text as letzter_text, n.richtung as letzte_richtung
      from wa_unterhaltung u
      left join lateral (
        select text, richtung from wa_nachricht
         where wa_id = u.wa_id order by zeitpunkt desc limit 1
      ) n on true
     order by u.letzte_nachricht_am desc nulls last
     limit 200
  `) as Array<Record<string, unknown>>;

  const grenze = Date.now() - FENSTER_STUNDEN * 3600 * 1000;

  return zeilen.map((z) => {
    const eingang = z.letzte_eingang_am ? new Date(z.letzte_eingang_am as string) : null;
    const gelesen = z.gelesen_am ? new Date(z.gelesen_am as string) : null;
    return {
      waId: String(z.wa_id),
      profilname: (z.profilname as string) ?? null,
      letzteNachrichtAm: z.letzte_nachricht_am
        ? new Date(z.letzte_nachricht_am as string).toISOString()
        : null,
      letzterText: (z.letzter_text as string) ?? null,
      letzteRichtung: (z.letzte_richtung as "ein" | "aus") ?? null,
      ungelesen: Boolean(eingang && (!gelesen || eingang > gelesen)),
      fensterOffen: Boolean(eingang && eingang.getTime() > grenze),
    };
  });
}

export async function holeVerlauf(waId: string): Promise<Nachricht[]> {
  await verlangeWhatsApp();
  const zeilen = (await db()`
    select id, richtung, herkunft, typ, text, zeitpunkt, status, fehler, gesendet_von
      from wa_nachricht where wa_id = ${waId}
     order by zeitpunkt
     limit 500
  `) as Array<Record<string, unknown>>;

  return zeilen.map((z) => ({
    id: String(z.id),
    richtung: z.richtung as "ein" | "aus",
    herkunft: z.herkunft as Nachricht["herkunft"],
    typ: String(z.typ),
    text: (z.text as string) ?? null,
    zeitpunkt: new Date(z.zeitpunkt as string).toISOString(),
    status: (z.status as string) ?? null,
    fehler: (z.fehler as string) ?? null,
    gesendetVon: (z.gesendet_von as string) ?? null,
  }));
}

/** Öffnen heisst gelesen, für alle. */
export async function alsGelesenMarkieren(waId: string, von: string): Promise<void> {
  await db()`
    update wa_unterhaltung
       set gelesen_am = now(), gelesen_von = ${von}
     where wa_id = ${waId}
       and letzte_eingang_am is not null
       and (gelesen_am is null or gelesen_am < letzte_eingang_am)
  `;
}

export interface Stand {
  ungelesen: number;
  /** Die neueste ungelesene Nachricht, für die Einblendung. */
  neueste: { waId: string; name: string; text: string; zeitpunkt: string } | null;
}

/** Für den Zähler in der Navigation und die Einblendung unten rechts. */
export async function ungelesenStand(): Promise<Stand> {
  const zeilen = (await db()`
    select u.wa_id, coalesce(u.profilname, '+' || u.wa_id) as name, n.text, n.zeitpunkt,
           count(*) over () as anzahl
      from wa_unterhaltung u
      join lateral (
        select text, zeitpunkt from wa_nachricht
         where wa_id = u.wa_id and richtung = 'ein'
         order by zeitpunkt desc limit 1
      ) n on true
     where u.letzte_eingang_am is not null
       and (u.gelesen_am is null or u.gelesen_am < u.letzte_eingang_am)
     order by n.zeitpunkt desc
     limit 1
  `) as Array<Record<string, unknown>>;

  const z = zeilen[0];
  if (!z) return { ungelesen: 0, neueste: null };
  return {
    ungelesen: Number(z.anzahl),
    neueste: {
      waId: String(z.wa_id),
      name: String(z.name),
      text: String(z.text ?? ""),
      zeitpunkt: new Date(z.zeitpunkt as string).toISOString(),
    },
  };
}

/** Legt eine hier geschriebene Nachricht ab, sobald WhatsApp sie angenommen hat. */
export async function ausgangSpeichern(
  waId: string,
  metaId: string,
  inhalt: string,
  von: string,
): Promise<void> {
  const sql = db();
  await sql`
    update wa_unterhaltung
       set letzte_nachricht_am = now(),
           gelesen_am = greatest(gelesen_am, now()), gelesen_von = ${von}
     where wa_id = ${waId}
  `;
  await sql`
    insert into wa_nachricht (meta_id, wa_id, richtung, herkunft, typ, text, zeitpunkt, status, gesendet_von)
    values (${metaId}, ${waId}, 'aus', 'eventmanager', 'text', ${inhalt}, now(), 'sent', ${von})
    on conflict (meta_id) do nothing
  `;
}
