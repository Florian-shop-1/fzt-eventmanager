/**
 * Die Personalunterlagen: Papierverträge und Papierbögen.
 *
 * Sie liegen bei der Person, zu der sie gehören, und unverändert so, wie
 * sie hereinkamen: "bitte wenn man auf mitarbeiter klickt auch möglich
 * machen, dass man diese alten verträge angucken kann" (Florian,
 * 01.10.2026). Ein Vertrag ist ein Beleg; ein Beleg wird nicht
 * umgeschrieben.
 *
 * Zu sehen nur für die, die auch die Arbeitsverträge sehen.
 */

import { db } from "./client";
import { nachFamilienname } from "@/lib/domain/namen";

export type Unterlagenart = "vertrag" | "bogen";

export interface Unterlage {
  id: string;
  benutzerId: string;
  name: string;
  art: Unterlagenart;
  titel: string;
  dateiname: string;
  typ: string;
  groesse: number;
  notiz: string;
  vertragId: string | null;
  hochgeladenVon: string;
  hochgeladenAm: string;
}

function baue(r: Record<string, unknown>): Unterlage {
  return {
    id: String(r.id),
    benutzerId: String(r.benutzer_id),
    name: String(r.name ?? ""),
    art: (r.art as Unterlagenart) ?? "vertrag",
    titel: String(r.titel ?? ""),
    dateiname: String(r.dateiname ?? ""),
    typ: String(r.typ ?? "application/pdf"),
    groesse: Number(r.groesse ?? 0),
    notiz: String(r.notiz ?? ""),
    vertragId: (r.vertrag_id as string) ?? null,
    hochgeladenVon: String(r.hochgeladen_von ?? ""),
    hochgeladenAm: new Date(r.hochgeladen_am as string).toISOString(),
  };
}

/**
 * Eine Unterlage ablegen.
 *
 * Dieselbe Datei zweimal abzulegen hilft niemandem, deshalb ersetzt ein
 * gleicher Dateiname bei derselben Person die ältere Fassung.
 */
export async function unterlageAblegen(o: {
  benutzerId: string;
  art: Unterlagenart;
  titel: string;
  dateiname: string;
  typ: string;
  inhalt: Buffer;
  notiz?: string;
  vertragId?: string | null;
  von: string;
}): Promise<string> {
  await db()`
    delete from personal_datei
     where benutzer_id = ${o.benutzerId}::uuid and dateiname = ${o.dateiname}
  `;
  const z = (await db()`
    insert into personal_datei (benutzer_id, art, titel, dateiname, typ, inhalt, groesse, notiz,
                                vertrag_id, hochgeladen_von)
    values (${o.benutzerId}::uuid, ${o.art}, ${o.titel}, ${o.dateiname}, ${o.typ},
            decode(${o.inhalt.toString("base64")}, 'base64'), ${o.inhalt.length}, ${o.notiz ?? ""},
            ${o.vertragId ?? null}, ${o.von})
    returning id
  `) as Array<{ id: string }>;
  return String(z[0].id);
}

/** Alle Unterlagen, nach Person. Ohne Inhalt, der kommt erst beim Öffnen. */
export async function alleUnterlagen(): Promise<Unterlage[]> {
  const z = (await db()`
    select d.id, d.benutzer_id, d.art, d.titel, d.dateiname, d.typ, d.groesse, d.notiz,
           d.vertrag_id, d.hochgeladen_von, d.hochgeladen_am, b.name
      from personal_datei d join benutzer b on b.id = d.benutzer_id
     order by d.hochgeladen_am desc
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(baue).sort(nachFamilienname);
}

export async function unterlagenVon(benutzerId: string): Promise<Unterlage[]> {
  const z = (await db()`
    select d.id, d.benutzer_id, d.art, d.titel, d.dateiname, d.typ, d.groesse, d.notiz,
           d.vertrag_id, d.hochgeladen_von, d.hochgeladen_am, b.name
      from personal_datei d join benutzer b on b.id = d.benutzer_id
     where d.benutzer_id = ${benutzerId}::uuid
     order by d.hochgeladen_am desc
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Die Datei selbst. */
export async function unterlageLesen(
  id: string,
): Promise<{ bytes: Buffer; typ: string; dateiname: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const z = (await db()`
    select encode(inhalt, 'base64') as inhalt, typ, dateiname from personal_datei where id = ${id}::uuid
  `.catch(() => [])) as Array<Record<string, unknown>>;
  if (!z[0]) return null;
  return {
    bytes: Buffer.from(String(z[0].inhalt), "base64"),
    typ: String(z[0].typ),
    dateiname: String(z[0].dateiname),
  };
}

export async function unterlageLoeschen(id: string): Promise<void> {
  await db()`delete from personal_datei where id = ${id}::uuid`;
}
