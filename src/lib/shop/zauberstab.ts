/**
 * Zauberstäbe aus dem Gewinnspiel.
 *
 * Wer beim Eurowings-Gewinnspiel mitmacht, bekommt einen erscheinenden
 * Zauberstab mit der Post. Die Anschrift kommt vom Shop herein, hier steht
 * sie in einer Liste, die jemand abarbeitet (Florian, 30.09.2026).
 *
 * Verschickt wird von Hand. Das Programm merkt sich nur, was noch offen
 * ist, und druckt Anschrift und Begleitschreiben.
 */

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db/client";
import { nameOrdentlich } from "@/lib/domain/namen";

export interface Zauberstab {
  id: string;
  vorname: string;
  nachname: string;
  name: string;
  email: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  quelle: string;
  notiz: string;
  eingegangenAm: string;
  versendetAm: string | null;
  versendetVon: string | null;
  /** Eigener Schlüssel für den Link aus der Erinnerungsmail. */
  token: string;
  erinnertAm: string | null;
  bestaetigtAm: string | null;
  /** Fehlt die Anschrift noch? Dann ist nichts zu packen. */
  offen: boolean;
}

function baue(r: Record<string, unknown>): Zauberstab {
  const vorname = nameOrdentlich(String(r.vorname ?? ""));
  const nachname = nameOrdentlich(String(r.nachname ?? ""));
  return {
    id: String(r.id),
    vorname,
    nachname,
    name: [vorname, nachname].filter(Boolean).join(" "),
    email: String(r.email ?? ""),
    strasse: String(r.strasse ?? ""),
    plz: String(r.plz ?? ""),
    ort: String(r.ort ?? ""),
    land: String(r.land ?? "Deutschland"),
    quelle: String(r.quelle ?? ""),
    notiz: String(r.notiz ?? ""),
    eingegangenAm: new Date(r.eingegangen_am as string).toISOString(),
    versendetAm: r.versendet_am ? new Date(r.versendet_am as string).toISOString() : null,
    versendetVon: (r.versendet_von as string) ?? null,
    token: String(r.token ?? ""),
    erinnertAm: r.erinnert_am ? new Date(r.erinnert_am as string).toISOString() : null,
    bestaetigtAm: r.bestaetigt_am ? new Date(r.bestaetigt_am as string).toISOString() : null,
    offen: !String(r.strasse ?? "").trim(),
  };
}

export async function zauberstaebe(alle = false): Promise<Zauberstab[]> {
  const z = (await db()`
    select * from zauberstab_versand
     where ${alle} or versendet_am is null
     order by versendet_am nulls first, eingegangen_am
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Wie viele warten noch auf ihr Päckchen? Für den Zähler in der Leiste. */
export async function offeneZauberstaebe(): Promise<number> {
  const z = (await db()`
    select count(*)::int as n from zauberstab_versand where versendet_am is null
  `) as Array<{ n: number }>;
  return Number(z[0]?.n ?? 0);
}

/**
 * Eine Anschrift aus dem Shop annehmen.
 *
 * Dieselbe Person zweimal anzulegen bringt niemandem etwas, deshalb
 * gewinnt die erste Anmeldung und die zweite ergänzt nur, was noch fehlt.
 */
/** Ein Schlüssel für den Link in der Erinnerungsmail. Nicht zu erraten. */
function neuerToken(): string {
  return randomBytes(16).toString("hex");
}

export async function zauberstabEintragen(o: {
  vorname: string;
  nachname: string;
  email: string;
  strasse: string;
  plz: string;
  ort: string;
  land?: string;
  quelle: string;
  notiz?: string;
}): Promise<{ id: string; token: string; schonDa: boolean; hatAnschrift: boolean }> {
  const email = o.email.trim().toLowerCase();
  const z = (await db()`
    insert into zauberstab_versand (vorname, nachname, email, strasse, plz, ort, land, quelle, notiz, token)
    values (${o.vorname.trim().slice(0, 80)}, ${o.nachname.trim().slice(0, 80)}, ${email},
            ${o.strasse.trim().slice(0, 120)}, ${o.plz.trim().slice(0, 12)}, ${o.ort.trim().slice(0, 80)},
            ${(o.land ?? "Deutschland").trim().slice(0, 60)}, ${o.quelle.trim().slice(0, 60)},
            ${(o.notiz ?? "").trim().slice(0, 300)}, ${neuerToken()})
    on conflict (lower(email), quelle) where email <> ''
      do update set
        vorname = case when zauberstab_versand.vorname = '' then excluded.vorname else zauberstab_versand.vorname end,
        nachname = case when zauberstab_versand.nachname = '' then excluded.nachname else zauberstab_versand.nachname end,
        strasse = case when zauberstab_versand.strasse = '' then excluded.strasse else zauberstab_versand.strasse end,
        plz = case when zauberstab_versand.plz = '' then excluded.plz else zauberstab_versand.plz end,
        ort = case when zauberstab_versand.ort = '' then excluded.ort else zauberstab_versand.ort end,
        token = coalesce(zauberstab_versand.token, excluded.token)
    returning id, token, (xmax <> 0) as schon_da, (strasse <> '') as hat_anschrift
  `) as Array<{ id: string; token: string; schon_da: boolean; hat_anschrift: boolean }>;
  return {
    id: String(z[0].id),
    token: String(z[0].token ?? ""),
    schonDa: Boolean(z[0].schon_da),
    hatAnschrift: Boolean(z[0].hat_anschrift),
  };
}

export async function zauberstabAbhaken(id: string, von: string): Promise<void> {
  await db()`
    update zauberstab_versand set versendet_am = now(), versendet_von = ${von}
     where id = ${id}::uuid
  `;
}

export async function zauberstabZurueck(id: string): Promise<void> {
  await db()`
    update zauberstab_versand set versendet_am = null, versendet_von = null where id = ${id}::uuid
  `;
}

/** Fehlt etwas, das vor dem Verschicken geklärt werden muss? */
export function brauchtKlaerung(z: Zauberstab): string | null {
  if (!z.strasse.trim()) return "Keine Straße hinterlegt";
  if (!z.plz.trim() || !z.ort.trim()) return "Postleitzahl oder Ort fehlt";
  if (!z.name.trim()) return "Kein Name hinterlegt";
  return null;
}

/** Einen Eintrag über den Link aus der Erinnerungsmail finden. */
export async function zauberstabPerToken(token: string): Promise<Zauberstab | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const z = (await db()`select * from zauberstab_versand where token = ${token} limit 1`) as Array<
    Record<string, unknown>
  >;
  return z[0] ? baue(z[0]) : null;
}

/**
 * Anschrift nachtragen, über den Link aus der Erinnerungsmail.
 *
 * Eine vorhandene Anschrift wird dabei ersetzt: Wer den Link noch einmal
 * benutzt, will in aller Regel etwas richtigstellen.
 */
export async function anschriftNachtragen(
  token: string,
  o: { vorname?: string; nachname?: string; strasse: string; plz: string; ort: string },
): Promise<Zauberstab | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const z = (await db()`
    update zauberstab_versand set
      vorname = coalesce(nullif(${(o.vorname ?? "").trim().slice(0, 80)}, ''), vorname),
      nachname = coalesce(nullif(${(o.nachname ?? "").trim().slice(0, 80)}, ''), nachname),
      strasse = ${o.strasse.trim().slice(0, 120)},
      plz = ${o.plz.trim().slice(0, 12)},
      ort = ${o.ort.trim().slice(0, 80)}
    where token = ${token} and versendet_am is null
    returning *
  `) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

/**
 * Wer mitgemacht, aber keine Anschrift hinterlassen hat, und noch keine
 * Erinnerung bekommen hat. Frühestens nach `stunden`, damit niemand eine
 * Erinnerung bekommt, während er noch tippt.
 */
export async function zauberstaebeOhneAnschrift(stunden = 20): Promise<Zauberstab[]> {
  const z = (await db()`
    select * from zauberstab_versand
     where strasse = ''
       and erinnert_am is null
       and email <> ''
       and eingegangen_am < now() - make_interval(hours => ${stunden})
       and eingegangen_am > now() - interval '30 days'
     order by eingegangen_am
     limit 200
  `) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function erinnerungVermerken(id: string): Promise<void> {
  await db()`update zauberstab_versand set erinnert_am = now() where id = ${id}`;
}

export async function bestaetigungVermerken(id: string): Promise<void> {
  await db()`update zauberstab_versand set bestaetigt_am = now() where id = ${id}`;
}
