/**
 * Die Personalakte: alles zu einer Person auf einen Blick.
 *
 * "ich möchte bitte auf Mitarbeiter klicken können, Mitarbeiter
 * auswählen und wie so eine Personalakte auf einen Blick haben,
 * insbesondere dass ich nochmal den Personalbogen senden kann"
 * (Florian, 14.10.2026).
 *
 * Bisher lag alles verstreut: Zugang unter Zugänge, Bogen und alte
 * Papiere unter Personalunterlagen, Vertrag unter Arbeitsverträge,
 * Stunden unter Zeiterfassung. Wer eine Frage zu einem Menschen hatte,
 * musste vier Seiten aufmachen.
 */

import { db } from "@/lib/db/client";
import { nachFamilienname } from "@/lib/domain/namen";

export interface Aktenkopf {
  id: string;
  name: string;
  email: string;
  rolle: string;
  aktiv: boolean;
  geteilt: boolean;
  art: "intern" | "extern" | null;
  fest: boolean;
  schnuppert: boolean;
  handy: string;
  /** Bezahlte Anfahrt je Arbeitstag in Minuten, 0 wenn keine. */
  anfahrtMinuten: number;
  geburtstag: string | null;
  erstelltAm: string;
  letzterLogin: string | null;
  personalbogenAm: string | null;
  ausgeschiedenAm: string | null;
  ausscheidenGrund: string;
  abgemeldetAm: string | null;
}

export interface Aktenstand extends Aktenkopf {
  /** Der jüngste Vertrag, falls einer da ist. */
  vertrag: {
    id: string;
    art: string;
    beginn: string | null;
    stundenlohnCent: number | null;
    festgehaltCent: number | null;
    freigegebenAm: string | null;
    unterschriebenAm: string | null;
  } | null;
  /** Hat er die Geheimhaltung unterschrieben? */
  geheimhaltungAm: string | null;
  /** Stunden der letzten 90 Tage, aus den Stempeln. */
  stundenLetzte90: number;
  /** Wann zuletzt gestempelt wurde. */
  letzterStempel: string | null;
  /** Wie viele Dienste in den kommenden Wochen anstehen. */
  diensteKommend: number;
  /** Dateien in den Personalunterlagen. */
  dateien: number;
}

/**
 * Alle, für die eine Akte sinnvoll ist: eigene Leute, keine
 * Sammelzugänge und niemand von außen.
 *
 * "bitte Osman, Giusi und Lenny aus den Personalakten rausnehmen, die
 * haben ja keinen Vertrag mit uns" (Florian, 15.10.2026). Externe haben
 * weiter einen Zugang, aber keine Akte: Es gibt bei ihnen keinen
 * Personalbogen, keinen Arbeitsvertrag und keine Lohnabrechnung, und ein
 * fehlender Bogen wäre eine Aufgabe, die niemand erledigen kann.
 */
export async function akten(): Promise<Aktenkopf[]> {
  const z = (await db()`
    select id, name, email, rolle, aktiv, geteilt, art, fest, schnuppert, handy, geburtstag::text,
           erstellt_am, letzter_login, personalbogen_am, ausgeschieden_am, ausscheiden_grund,
           abgemeldet_am, coalesce(anfahrt_minuten, 0) as anfahrt_minuten
      from benutzer
     where not geteilt and rolle not in ('kiosk', 'agentur', 'reinigung')
       and coalesce(art, 'intern') <> 'extern'
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(baueKopf).sort(nachFamilienname);
}

function baueKopf(r: Record<string, unknown>): Aktenkopf {
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email ?? ""),
    rolle: String(r.rolle),
    aktiv: Boolean(r.aktiv),
    geteilt: Boolean(r.geteilt),
    art: (r.art as "intern" | "extern" | null) ?? null,
    fest: Boolean(r.fest),
    schnuppert: Boolean(r.schnuppert),
    handy: String(r.handy ?? ""),
    anfahrtMinuten: Number(r.anfahrt_minuten ?? 0),
    geburtstag: (r.geburtstag as string) ?? null,
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
    letzterLogin: r.letzter_login ? new Date(r.letzter_login as string).toISOString() : null,
    personalbogenAm: r.personalbogen_am ? new Date(r.personalbogen_am as string).toISOString() : null,
    ausgeschiedenAm: r.ausgeschieden_am ? new Date(r.ausgeschieden_am as string).toISOString() : null,
    ausscheidenGrund: String(r.ausscheiden_grund ?? ""),
    abgemeldetAm: r.abgemeldet_am ? new Date(r.abgemeldet_am as string).toISOString() : null,
  };
}

/** Eine einzelne Akte, mit allem, was dazugehört. */
export async function akte(benutzerId: string): Promise<Aktenstand | null> {
  const kopf = (await db()`
    select id, name, email, rolle, aktiv, geteilt, art, fest, schnuppert, handy, geburtstag::text,
           erstellt_am, letzter_login, personalbogen_am, ausgeschieden_am, ausscheiden_grund,
           abgemeldet_am, coalesce(anfahrt_minuten, 0) as anfahrt_minuten
      from benutzer where id = ${benutzerId}::uuid
  `.catch(() => [])) as Array<Record<string, unknown>>;
  if (!kopf[0]) return null;

  const [vertrag, geheim, stunden, dienste, dateien] = await Promise.all([
    db()`
      select id, art, beginn::text as beginn, stundenlohn_cent, festgehalt_cent,
             freigegeben_am, unterschrieben_am
        from arbeitsvertrag
       where benutzer_id = ${benutzerId}::uuid and zurueckgezogen_am is null and abgeloest_am is null
       order by unterschrieben_am desc nulls first, angelegt_am desc limit 1
    `.catch(() => []),
    db()`
      select unterschrieben_am from geheimhaltung where benutzer_id = ${benutzerId}::uuid limit 1
    `.catch(() => []),
    db()`
      select coalesce(sum(case when art = 'gehen' then extract(epoch from zeitpunkt)
                               when art = 'kommen' then -extract(epoch from zeitpunkt) end), 0) / 3600 as stunden,
             max(zeitpunkt) as zuletzt
        from stempel
       where benutzer_id = ${benutzerId}::uuid and zeitpunkt > now() - interval '90 days'
         and art in ('kommen', 'gehen')
    `.catch(() => []),
    db()`
      select count(*)::int as n from dienst_einsatz
       where benutzer_id = ${benutzerId}::uuid and datum >= current_date
    `.catch(() => []),
    db()`
      select count(*)::int as n from personal_datei where benutzer_id = ${benutzerId}::uuid
    `.catch(() => []),
  ]);

  const v = (vertrag as Array<Record<string, unknown>>)[0];
  const s = (stunden as Array<Record<string, unknown>>)[0];

  return {
    ...baueKopf(kopf[0]),
    vertrag: v
      ? {
          id: String(v.id),
          art: String(v.art),
          beginn: (v.beginn as string) ?? null,
          stundenlohnCent: v.stundenlohn_cent === null ? null : Number(v.stundenlohn_cent),
          festgehaltCent: v.festgehalt_cent === null ? null : Number(v.festgehalt_cent),
          freigegebenAm: v.freigegeben_am ? new Date(v.freigegeben_am as string).toISOString() : null,
          unterschriebenAm: v.unterschrieben_am
            ? new Date(v.unterschrieben_am as string).toISOString()
            : null,
        }
      : null,
    geheimhaltungAm: (geheim as Array<{ unterschrieben_am: string | null }>)[0]?.unterschrieben_am
      ? new Date((geheim as Array<{ unterschrieben_am: string }>)[0].unterschrieben_am).toISOString()
      : null,
    stundenLetzte90: Math.max(0, Math.round(Number(s?.stunden ?? 0) * 10) / 10),
    letzterStempel: s?.zuletzt ? new Date(s.zuletzt as string).toISOString() : null,
    diensteKommend: Number((dienste as Array<{ n: number }>)[0]?.n ?? 0),
    dateien: Number((dateien as Array<{ n: number }>)[0]?.n ?? 0),
  };
}
