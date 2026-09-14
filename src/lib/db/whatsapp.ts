/**
 * WhatsApp-Verlauf: speichern, was ankommt, und für den Posteingang lesen.
 *
 * Siehe migrations/030_whatsapp.sql für den Aufbau und warum der Lesestand
 * für alle gemeinsam gilt.
 */

import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, type AngemeldeterBenutzer } from "@/lib/auth/sitzung";
import type { Ereignis } from "@/lib/whatsapp/eingang";
import { kennungLesbar } from "@/lib/whatsapp/kennung";

import { dringlichkeit, type Dringlichkeit } from "@/lib/whatsapp/eile";
import {
  ABGELAUFEN_WARNEN_TAGE,
  FENSTER_STUNDEN,
  KNAPP_STUNDEN,
} from "@/lib/whatsapp/eile";

export { FENSTER_STUNDEN, KNAPP_STUNDEN, ABGELAUFEN_WARNEN_TAGE };

export interface Unterhaltung {
  waId: string;
  profilname: string | null;
  letzteNachrichtAm: string | null;
  letzterText: string | null;
  letzteRichtung: "ein" | "aus" | null;
  ungelesen: boolean;
  fensterOffen: boolean;
  dringlichkeit: Dringlichkeit;
  /** Minuten bis zum Ende der 24 Stunden, negativ danach. */
  restMinuten: number | null;
  erledigtVon: string | null;
}

export interface Nachricht {
  id: string;
  richtung: "ein" | "aus";
  herkunft: "kunde" | "eventmanager" | "app" | "automatik";
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

/** Eine Kundennachricht, die gerade zum ersten Mal hier angekommen ist. */
export interface NeuerEingang {
  waId: string;
  name: string;
  typ: string;
  text: string;
}

/**
 * Legt ab, was der Webhook meldet.
 *
 * Jede Nachricht nur einmal: Meta wiederholt ein Päckchen, wenn die Antwort
 * ausbleibt, und dann steht dieselbe Kennung ein zweites Mal da.
 *
 * Liefert die Kundennachrichten, die wirklich neu sind. Nur für die gehen
 * Mail und automatische Antwort hinaus, sonst löste jede Wiederholung von
 * Meta beides noch einmal aus.
 */
export async function ereignisseSpeichern(ereignisse: Ereignis[]): Promise<NeuerEingang[]> {
  const sql = db();
  const neu: NeuerEingang[] = [];

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
      const eingefuegt = (await sql`
        insert into wa_nachricht (meta_id, wa_id, richtung, herkunft, typ, text, zeitpunkt, roh)
        values (${e.metaId}, ${e.waId}, 'ein', 'kunde', ${e.typ}, ${e.text}, ${e.zeitpunkt},
                ${JSON.stringify(e.roh)}::jsonb)
        on conflict (meta_id) do nothing
        returning id
      `) as unknown[];
      if (eingefuegt.length > 0) {
        neu.push({ waId: e.waId, name: e.profilname ?? kennungLesbar(e.waId), typ: e.typ, text: e.text });
      }
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

  return neu;
}

export async function holeUnterhaltungen(): Promise<Unterhaltung[]> {
  await verlangeWhatsApp();
  const zeilen = (await db()`
    select u.wa_id, u.profilname, u.letzte_nachricht_am, u.letzte_eingang_am, u.gelesen_am,
           n.text as letzter_text, n.richtung as letzte_richtung, u.erledigt_von,
           (exists (
              select 1 from wa_nachricht a
               where a.wa_id = u.wa_id and a.richtung = 'aus'
                 and a.herkunft in ('eventmanager', 'app')
                 and a.zeitpunkt >= u.letzte_eingang_am
            ) or coalesce(u.erledigt_am >= u.letzte_eingang_am, false)) as beantwortet,
           coalesce(u.erledigt_am >= u.letzte_eingang_am, false) as anderweitig
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
    const eile = dringlichkeit(eingang, z.beantwortet === true);
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
      dringlichkeit: eile.stufe,
      restMinuten: eile.restMinuten,
      erledigtVon: z.anderweitig === true ? ((z.erledigt_von as string) ?? null) : null,
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
  /** Unbeantwortet und knapp vor oder nach Ablauf der 24 Stunden. */
  dringend: number;
  /** Die neueste ungelesene Nachricht, für die Einblendung. */
  neueste: { waId: string; name: string; text: string; zeitpunkt: string } | null;
}

/** Für den Zähler in der Navigation und die Einblendung unten rechts. */
export async function ungelesenStand(): Promise<Stand> {
  const zeilen = (await db()`
    select u.wa_id, u.profilname, n.text, n.zeitpunkt,
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

  const dringend = await dringendZahl();
  const z = zeilen[0];
  if (!z) return { ungelesen: 0, dringend, neueste: null };
  return {
    ungelesen: Number(z.anzahl),
    dringend,
    neueste: {
      waId: String(z.wa_id),
      name: (z.profilname as string) ?? kennungLesbar(String(z.wa_id)),
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

/**
 * Soll für diese Unterhaltung eine Mail hinaus?
 *
 * Ja, wenn seit dem letzten Öffnen noch keine gegangen ist. Prüfen und
 * Vermerken in einem Befehl: Kommen zwei Nachrichten im selben Augenblick,
 * laufen zwei Webhooks gleichzeitig, und nur einer darf mailen.
 */
export async function mailFaellig(waId: string): Promise<boolean> {
  const zeilen = (await db()`
    update wa_unterhaltung set mail_gemeldet_am = now()
     where wa_id = ${waId}
       and (mail_gemeldet_am is null or mail_gemeldet_am < coalesce(gelesen_am, '-infinity'::timestamptz))
    returning wa_id
  `) as unknown[];
  return zeilen.length > 0;
}

/** Nimmt den Vermerk zurück, wenn die Mail nicht hinausging. Dann versucht es die nächste Nachricht. */
export async function mailVermerkZuruecknehmen(waId: string): Promise<void> {
  await db()`update wa_unterhaltung set mail_gemeldet_am = null where wa_id = ${waId}`;
}

export interface WaEinstellung {
  autoantwortAktiv: boolean;
  autoantwortText: string;
  geaendertAm: string;
  geaendertVon: string | null;
}

export async function holeEinstellung(): Promise<WaEinstellung> {
  const [z] = (await db()`
    select autoantwort_aktiv, autoantwort_text, geaendert_am, geaendert_von
      from wa_einstellung where id = 1
  `) as Array<Record<string, unknown>>;
  return {
    autoantwortAktiv: z?.autoantwort_aktiv === true,
    autoantwortText: String(z?.autoantwort_text ?? ""),
    geaendertAm: z?.geaendert_am ? new Date(z.geaendert_am as string).toISOString() : new Date().toISOString(),
    geaendertVon: (z?.geaendert_von as string) ?? null,
  };
}

/**
 * Wer bei einer neuen WhatsApp eine Mail bekommt: alle mit Freigabe.
 *
 * Erst ging die Meldung an tickets@. Absender ist aber ebenfalls tickets@,
 * und Mails an sich selbst hat Exchange nicht in den Posteingang gelegt,
 * weder mit noch ohne Kopie unter Gesendet (14.09.2026). Jetzt geht sie an
 * die persönlichen Adressen, und die sind auch eher auf dem Handy.
 *
 * Wer die Freigabe bekommt oder verliert, bekommt die Mails damit
 * automatisch oder eben nicht mehr. Die Absenderadresse selbst bleibt
 * draussen, sonst stünde dasselbe Problem wieder da.
 */
export async function meldeempfaenger(): Promise<Array<{ name: string; email: string }>> {
  const absender = (process.env.MAIL_ABSENDER ?? "").trim().toLowerCase();
  const zeilen = (await db()`
    select name, email from benutzer
     where whatsapp and aktiv and coalesce(email, '') <> ''
     order by name
  `) as Array<{ name: string; email: string }>;
  return zeilen.filter((z) => z.email.trim().toLowerCase() !== absender);
}

/** Pause zwischen zwei automatischen Antworten an denselben Kunden. */
export const AUTOANTWORT_STUNDEN = 12;

/**
 * Soll der Kunde jetzt automatisch eine Antwort bekommen?
 *
 * Nur wenn sie eingeschaltet ist, seit 12 Stunden keine automatische ging
 * und in dieser Zeit auch kein Mensch von uns geschrieben hat. Mitten in
 * einem Gespräch mit Kevin soll sich nicht plötzlich die Maschine melden.
 *
 * Wie bei der Mail: prüfen und vermerken in einem Befehl.
 */
export async function autoantwortFaellig(waId: string): Promise<string | null> {
  const zeilen = (await db()`
    update wa_unterhaltung u set autoantwort_am = now()
      from wa_einstellung e
     where e.id = 1 and e.autoantwort_aktiv
       and u.wa_id = ${waId}
       and (u.autoantwort_am is null
            or u.autoantwort_am < now() - make_interval(hours => ${AUTOANTWORT_STUNDEN}))
       and not exists (
         select 1 from wa_nachricht n
          where n.wa_id = u.wa_id and n.richtung = 'aus'
            and n.zeitpunkt > now() - make_interval(hours => ${AUTOANTWORT_STUNDEN})
       )
    returning e.autoantwort_text
  `) as Array<{ autoantwort_text: string }>;
  return zeilen[0]?.autoantwort_text ?? null;
}

/** Ging die automatische Antwort nicht hinaus, versucht es die nächste Nachricht erneut. */
export async function autoantwortVermerkZuruecknehmen(waId: string): Promise<void> {
  await db()`update wa_unterhaltung set autoantwort_am = null where wa_id = ${waId}`;
}

/** Legt eine automatische Antwort im Verlauf ab. */
export async function automatikSpeichern(waId: string, metaId: string, inhalt: string): Promise<void> {
  await db()`
    insert into wa_nachricht (meta_id, wa_id, richtung, herkunft, typ, text, zeitpunkt, status, gesendet_von)
    values (${metaId}, ${waId}, 'aus', 'automatik', 'text', ${inhalt}, now(), 'sent', 'Automatische Antwort')
    on conflict (meta_id) do nothing
  `;
  await db()`update wa_unterhaltung set letzte_nachricht_am = now() where wa_id = ${waId}`;
}

/** Wie viele Unterhaltungen gerade dringend sind. Dieselbe Regel wie dringlichkeit(). */
async function dringendZahl(): Promise<number> {
  const [z] = (await db()`
    select count(*)::int as anzahl
      from wa_unterhaltung u
     where u.letzte_eingang_am is not null
       and u.letzte_eingang_am < now() - make_interval(hours => ${FENSTER_STUNDEN - KNAPP_STUNDEN})
       and u.letzte_eingang_am > now() - make_interval(hours => ${FENSTER_STUNDEN}, days => ${ABGELAUFEN_WARNEN_TAGE})
       and not coalesce(u.erledigt_am >= u.letzte_eingang_am, false)
       and not exists (
         select 1 from wa_nachricht a
          where a.wa_id = u.wa_id and a.richtung = 'aus'
            and a.herkunft in ('eventmanager', 'app')
            and a.zeitpunkt >= u.letzte_eingang_am
       )
  `) as Array<{ anzahl: number }>;
  return Number(z?.anzahl ?? 0);
}

/** Anderweitig erledigt, etwa angerufen. Nimmt die Warnung bis zur nächsten Kundennachricht weg. */
export async function alsErledigtMarkieren(waId: string, von: string): Promise<void> {
  await db()`
    update wa_unterhaltung
       set erledigt_am = now(), erledigt_von = ${von},
           gelesen_am = greatest(gelesen_am, now()), gelesen_von = ${von}
     where wa_id = ${waId}
  `;
}
