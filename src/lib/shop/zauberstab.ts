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
}): Promise<{ id: string; schonDa: boolean }> {
  const email = o.email.trim().toLowerCase();
  const z = (await db()`
    insert into zauberstab_versand (vorname, nachname, email, strasse, plz, ort, land, quelle, notiz)
    values (${o.vorname.trim().slice(0, 80)}, ${o.nachname.trim().slice(0, 80)}, ${email},
            ${o.strasse.trim().slice(0, 120)}, ${o.plz.trim().slice(0, 12)}, ${o.ort.trim().slice(0, 80)},
            ${(o.land ?? "Deutschland").trim().slice(0, 60)}, ${o.quelle.trim().slice(0, 60)},
            ${(o.notiz ?? "").trim().slice(0, 300)})
    on conflict (lower(email), quelle) where email <> ''
      do update set
        strasse = case when zauberstab_versand.strasse = '' then excluded.strasse else zauberstab_versand.strasse end,
        plz = case when zauberstab_versand.plz = '' then excluded.plz else zauberstab_versand.plz end,
        ort = case when zauberstab_versand.ort = '' then excluded.ort else zauberstab_versand.ort end
    returning id, (xmax <> 0) as schon_da
  `) as Array<{ id: string; schon_da: boolean }>;
  return { id: String(z[0].id), schonDa: Boolean(z[0].schon_da) };
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
