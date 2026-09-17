/**
 * Die gescannten Glücks-Moji-Karten. Siehe migrations/035_scanner.sql.
 */

import { db } from "@/lib/db/client";

export type ScanStatus =
  | "neu" | "wartet_claude" | "claude_laeuft" | "pruefen"
  | "uebertragen" | "doppelt" | "verworfen" | "fehler";

export interface ScanKarte {
  id: string;
  erstelltAm: string;
  erstelltVon: string;
  hatFoto: boolean;
  status: ScanStatus;
  grund: string | null;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  unsicher: string[];
  lesungen: Lesungen;
  kostenCent: number | null;
  geprueftVon: string | null;
  geprueftAm: string | null;
  brevoAm: string | null;
  brevoFehler: string | null;
}

/** Wer gerade handelt. Name für die Anzeige, Kennung für die Zählung. */
export interface Handelnder {
  id: string;
  name: string;
}

/** Was die Leser geliefert haben, für die Prüfansicht. */
export interface Lesungen {
  azure?: { vorname: string; nachname: string; email: string; telefon: string; problem?: string };
  claude?: {
    vorname: string; nachname: string; email: string; telefon: string;
    sicherheit: Record<string, string>; alternativen: string[]; hinweis: string;
  };
  /** Mängel der Adresse und ein Korrekturvorschlag, falls es einen gibt. */
  emailMaengel?: string[];
  emailVorschlag?: string | null;
}

function baue(z: Record<string, unknown>): ScanKarte {
  return {
    id: String(z.id),
    erstelltAm: new Date(z.erstellt_am as string).toISOString(),
    erstelltVon: String(z.erstellt_von ?? ""),
    hatFoto: Boolean(z.hat_foto),
    status: z.status as ScanStatus,
    grund: (z.grund as string) ?? null,
    vorname: String(z.vorname ?? ""),
    nachname: String(z.nachname ?? ""),
    email: String(z.email ?? ""),
    telefon: String(z.telefon ?? ""),
    unsicher: (z.unsicher as string[]) ?? [],
    lesungen: (z.lesungen as Lesungen) ?? {},
    kostenCent: z.kosten_cent === null || z.kosten_cent === undefined ? null : Number(z.kosten_cent),
    geprueftVon: (z.geprueft_von as string) ?? null,
    geprueftAm: z.geprueft_am ? new Date(z.geprueft_am as string).toISOString() : null,
    brevoAm: z.brevo_am ? new Date(z.brevo_am as string).toISOString() : null,
    brevoFehler: (z.brevo_fehler as string) ?? null,
  };
}

const SPALTEN = `id, erstellt_am, erstellt_von, (foto is not null) as hat_foto, status, grund,
  vorname, nachname, email, telefon, unsicher, lesungen, kosten_cent, geprueft_von, geprueft_am, brevo_am, brevo_fehler`;

/** Legt eine Karte an. Null, wenn genau dieses Foto schon da ist. */
export async function karteAnlegen(fotoBase64: string, hash: string, von: Handelnder): Promise<string | null> {
  const zeilen = (await db()`
    insert into scan_karte (foto, foto_hash, erstellt_von, erstellt_von_id)
    values (decode(${fotoBase64}, 'base64'), ${hash}, ${von.name}, ${von.id})
    on conflict (foto_hash) do nothing
    returning id
  `) as Array<{ id: string }>;
  return zeilen[0]?.id ?? null;
}

export async function karte(id: string): Promise<ScanKarte | null> {
  const [z] = (await db().query(`select ${SPALTEN} from scan_karte where id = $1`, [id])) as Array<Record<string, unknown>>;
  return z ? baue(z) : null;
}

export async function karten(status: ScanStatus[], limit = 100): Promise<ScanKarte[]> {
  const zeilen = (await db().query(
    `select ${SPALTEN} from scan_karte where status = any($1) order by erstellt_am desc limit $2`,
    [status, limit],
  )) as Array<Record<string, unknown>>;
  return zeilen.map(baue);
}

export async function fotoBase64(id: string): Promise<string | null> {
  const [z] = (await db()`select encode(foto, 'base64') as b from scan_karte where id = ${id}`) as Array<{ b: string | null }>;
  return z?.b?.replace(/\s+/g, "") ?? null;
}

export async function fotoBytes(id: string): Promise<Buffer | null> {
  const b = await fotoBase64(id);
  return b ? Buffer.from(b, "base64") : null;
}

export interface Ergebnis {
  status: ScanStatus;
  grund?: string | null;
  vorname?: string;
  nachname?: string;
  email?: string;
  telefon?: string;
  unsicher?: string[];
  lesungen?: Lesungen;
}

export async function ergebnisSpeichern(id: string, e: Ergebnis): Promise<void> {
  await db()`
    update scan_karte set
      status = ${e.status},
      grund = ${e.grund ?? null},
      vorname = coalesce(${e.vorname ?? null}, vorname),
      nachname = coalesce(${e.nachname ?? null}, nachname),
      email = coalesce(${e.email ?? null}, email),
      telefon = coalesce(${e.telefon ?? null}, telefon),
      unsicher = coalesce(${e.unsicher ?? null}::text[], unsicher),
      lesungen = lesungen || ${JSON.stringify(e.lesungen ?? {})}::jsonb
    where id = ${id}
  `;
}

export async function batchVermerken(ids: string[], batch: string): Promise<void> {
  await db()`
    update scan_karte set status = 'claude_laeuft', claude_batch = ${batch}, claude_gesendet_am = now()
     where id = any(${ids}::uuid[])
  `;
}

export async function offeneBatches(): Promise<string[]> {
  const z = (await db()`
    select distinct claude_batch from scan_karte where status = 'claude_laeuft' and claude_batch is not null
  `) as Array<{ claude_batch: string }>;
  return z.map((x) => x.claude_batch);
}

export async function claudeVermerken(id: string, kostenCent: number | null): Promise<void> {
  await db()`update scan_karte set claude_am = now(), kosten_cent = ${kostenCent} where id = ${id}`;
}

export async function geprueft(id: string, von: Handelnder): Promise<void> {
  await db()`
    update scan_karte set geprueft_von = ${von.name}, geprueft_von_id = ${von.id}, geprueft_am = now()
     where id = ${id}
  `;
}

export interface PersonZahlen {
  name: string;
  heute: number;
  woche: number;
  gesamt: number;
  uebertragen: number;
  geprueft: number;
  zuletzt: string | null;
}

/** Wer wie viel gescannt und geprüft hat. Der aktuelle Name kommt aus dem Zugang. */
export async function jePerson(): Promise<PersonZahlen[]> {
  const zeilen = (await db()`
    with tag as (select date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin' as beginn),
    gescannt as (
      select coalesce(k.erstellt_von_id::text, k.erstellt_von) as schluessel,
             max(coalesce(b.name, k.erstellt_von)) as name,
             count(*) filter (where k.erstellt_am >= (select beginn from tag))::int as heute,
             count(*) filter (where k.erstellt_am >= now() - interval '7 days')::int as woche,
             count(*)::int as gesamt,
             count(*) filter (where k.status = 'uebertragen')::int as uebertragen,
             max(k.erstellt_am) as zuletzt
        from scan_karte k left join benutzer b on b.id = k.erstellt_von_id
       group by 1
    ),
    pruefer as (
      select coalesce(k.geprueft_von_id::text, k.geprueft_von) as schluessel,
             max(coalesce(b.name, k.geprueft_von)) as name,
             count(*)::int as geprueft,
             max(k.geprueft_am) as zuletzt
        from scan_karte k left join benutzer b on b.id = k.geprueft_von_id
       where k.geprueft_am is not null
       group by 1
    )
    select coalesce(g.name, p.name) as name,
           coalesce(g.heute, 0) as heute, coalesce(g.woche, 0) as woche, coalesce(g.gesamt, 0) as gesamt,
           coalesce(g.uebertragen, 0) as uebertragen, coalesce(p.geprueft, 0) as geprueft,
           greatest(g.zuletzt, p.zuletzt) as zuletzt
      from gescannt g full join pruefer p on p.schluessel = g.schluessel
     order by 7 desc nulls last
  `) as Array<Record<string, unknown>>;
  return zeilen.map((z) => ({
    name: String(z.name ?? "?"),
    heute: Number(z.heute),
    woche: Number(z.woche),
    gesamt: Number(z.gesamt),
    uebertragen: Number(z.uebertragen),
    geprueft: Number(z.geprueft),
    zuletzt: z.zuletzt ? new Date(z.zuletzt as string).toISOString() : null,
  }));
}

export async function brevoVermerken(id: string, fehler: string | null): Promise<void> {
  if (fehler) {
    await db()`update scan_karte set status = 'fehler', brevo_fehler = ${fehler} where id = ${id}`;
  } else {
    await db()`update scan_karte set status = 'uebertragen', brevo_am = now(), brevo_fehler = null where id = ${id}`;
  }
}

/** Ist diese Adresse schon über den Scanner bei Brevo gelandet? */
export async function schonUebertragen(email: string, ausser: string): Promise<boolean> {
  const z = (await db()`
    select 1 from scan_karte
     where lower(email) = lower(${email}) and status = 'uebertragen' and id <> ${ausser}
     limit 1
  `) as unknown[];
  return z.length > 0;
}

export async function alteFotosLoeschen(tage = 30): Promise<number> {
  const z = (await db()`
    update scan_karte set foto = null, foto_geloescht_am = now()
     where foto is not null and erstellt_am < now() - make_interval(days => ${tage})
       and status not in ('neu', 'wartet_claude', 'claude_laeuft', 'pruefen')
    returning id
  `) as unknown[];
  return z.length;
}

export interface ScanZahlen {
  heute: number;
  gesamt: number;
  jeStatus: Record<string, number>;
  kostenCent: number;
}

export async function zahlen(): Promise<ScanZahlen> {
  const zeilen = (await db()`
    select status, count(*)::int as n,
           count(*) filter (where erstellt_am >= date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')::int as heute,
           coalesce(sum(kosten_cent), 0)::float as kosten
      from scan_karte group by status
  `) as Array<{ status: string; n: number; heute: number; kosten: number }>;
  const jeStatus: Record<string, number> = {};
  let gesamt = 0, heute = 0, kostenCent = 0;
  for (const z of zeilen) {
    jeStatus[z.status] = z.n;
    gesamt += z.n;
    heute += z.heute;
    kostenCent += z.kosten;
  }
  return { heute, gesamt, jeStatus, kostenCent };
}

export async function einstellung(): Promise<{ newsletter: number | null; emoji: number | null }> {
  const [z] = (await db()`select liste_newsletter, liste_emoji from scan_einstellung where id = 1`) as Array<{
    liste_newsletter: number | null; liste_emoji: number | null;
  }>;
  return { newsletter: z?.liste_newsletter ?? null, emoji: z?.liste_emoji ?? null };
}

export async function einstellungSpeichern(newsletter: number | null, emoji: number | null, von: string): Promise<void> {
  await db()`
    update scan_einstellung
       set liste_newsletter = ${newsletter}, liste_emoji = ${emoji}, geaendert_am = now(), geaendert_von = ${von}
     where id = 1
  `;
}

/** Tage seit der letzten gescannten Karte. Null, solange noch nie gescannt wurde. */
export async function tageSeitLetztemScan(): Promise<number | null> {
  const [z] = (await db()`
    select floor(extract(epoch from now() - max(erstellt_am)) / 86400)::int as tage from scan_karte
  `) as Array<{ tage: number | null }>;
  return z?.tage ?? null;
}
