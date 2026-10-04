/**
 * Hasenpost. Siehe migrations/135_hasenpost.sql.
 *
 * Eine persoenliche Erinnerung an einen einzelnen Mitarbeiter, die der
 * Hase ausspricht. Wer sie liest, sieht nicht, von wem sie kommt: Sie
 * soll aussehen, als haette sich der Hase gemeldet, nicht der Chef
 * (Florian, 04.10.2026).
 *
 * Das ist bewusst so. Eine Erinnerung vom Hasen nimmt man mit, eine
 * Mahnung vom Chef nimmt man persoenlich. Der Absender steht trotzdem in
 * der Datenbank, sonst wuesste am Ende niemand mehr, wer was geschrieben
 * hat.
 *
 * Gezeigt wird hoechstens einmal am Tag, und zwar so lange, bis der
 * Mitarbeiter "Mach ich!" klickt.
 */

import { db } from "@/lib/db/client";

export interface Hasenpost {
  id: string;
  text: string;
  /** Nur fuer die Uebersicht des Absenders, nie fuer den Empfaenger. */
  von: string;
  benutzerId: string;
  name: string;
  angelegtAm: string;
  zuletztGezeigtAm: string | null;
  gezeigtAnzahl: number;
  erledigtAm: string | null;
}

function ausZeile(r: Record<string, unknown>): Hasenpost {
  return {
    id: String(r.id),
    text: String(r.text ?? ""),
    von: String(r.von ?? ""),
    benutzerId: String(r.benutzer_id),
    name: String(r.name ?? ""),
    angelegtAm: new Date(r.angelegt_am as string).toISOString(),
    zuletztGezeigtAm: r.zuletzt_gezeigt_am
      ? new Date(r.zuletzt_gezeigt_am as string).toISOString()
      : null,
    gezeigtAnzahl: Number(r.gezeigt_anzahl ?? 0),
    erledigtAm: r.erledigt_am ? new Date(r.erledigt_am as string).toISOString() : null,
  };
}

export async function postSchicken(o: {
  benutzerId: string;
  text: string;
  von: string;
}): Promise<void> {
  await db()`
    insert into hasenpost (benutzer_id, text, von)
    values (${o.benutzerId}::uuid, ${o.text}, ${o.von})
  `;
}

/**
 * Was der Hase dieser Person jetzt sagen soll.
 *
 * Hoechstens eine Nachricht auf einmal, und nur, wenn sie heute noch
 * nicht gezeigt wurde: Zwei Hasen gleichzeitig sind einer zu viel, und
 * dreimal am Tag derselbe Hinweis macht aus einer Erinnerung eine
 * Belaestigung.
 */
export async function naechstePost(benutzerId: string): Promise<{ id: string; text: string } | null> {
  const z = (await db()`
    select id, text
      from hasenpost
     where benutzer_id = ${benutzerId}::uuid
       and erledigt_am is null and weg_am is null
       and (zuletzt_gezeigt_am is null
            or (zuletzt_gezeigt_am at time zone 'Europe/Berlin')::date
               < (now() at time zone 'Europe/Berlin')::date)
     order by angelegt_am
     limit 1
  `.catch(() => [])) as Array<{ id: string; text: string }>;
  const r = z[0];
  return r ? { id: String(r.id), text: String(r.text) } : null;
}

/** Der Hase hat sie gezeigt. */
export async function postGezeigt(id: string, benutzerId: string): Promise<void> {
  await db()`
    update hasenpost
       set zuletzt_gezeigt_am = now(), gezeigt_anzahl = gezeigt_anzahl + 1
     where id = ${id}::uuid and benutzer_id = ${benutzerId}::uuid
  `;
}

/** "Mach ich!": Danach meldet sich der Hase nicht mehr damit. */
export async function postErledigt(id: string, benutzerId: string): Promise<void> {
  await db()`
    update hasenpost set erledigt_am = now()
     where id = ${id}::uuid and benutzer_id = ${benutzerId}::uuid and erledigt_am is null
  `;
}

/** Zurueckziehen, wenn sich die Sache von selbst geklaert hat. */
export async function postWeg(id: string): Promise<void> {
  await db()`update hasenpost set weg_am = now() where id = ${id}::uuid`;
}

/** Alles Verschickte, fuer die Uebersicht des Absenders. */
export async function allePost(): Promise<Hasenpost[]> {
  const z = (await db()`
    select p.id, p.text, p.von, p.benutzer_id, b.name, p.angelegt_am,
           p.zuletzt_gezeigt_am, p.gezeigt_anzahl, p.erledigt_am
      from hasenpost p join benutzer b on b.id = p.benutzer_id
     where p.weg_am is null
     order by p.erledigt_am is not null, p.angelegt_am desc
     limit 100
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map(ausZeile);
}

/** Wer Post bekommen kann: alle aktiven Zugaenge. */
export async function empfaenger(): Promise<Array<{ id: string; name: string; rolle: string }>> {
  const z = (await db()`
    select id, name, rolle from benutzer
     where aktiv
     order by split_part(name, ' ', 2), name
  `.catch(() => [])) as Array<{ id: string; name: string; rolle: string }>;
  return z.map((r) => ({ id: String(r.id), name: String(r.name), rolle: String(r.rolle) }));
}
