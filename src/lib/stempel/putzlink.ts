/**
 * Der offene Stempel-Link der Putzfirma. Siehe migrations/153_putzlink.sql.
 *
 * Wer putzt, meldet sich nicht an. Er öffnet den Link, tippt auf seinen
 * Namen und stempelt. Kommt jemand Neues, schreibt er sich einmal
 * hinein und steht beim nächsten Mal in der Liste.
 *
 * Der Schlüssel im Link ist der Nachweis. Dahinter steht nur die eigene
 * Stempeluhr dieser Firma, und das Gelände gilt wie für alle anderen.
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";

export interface Putzlink {
  schluessel: string;
  firmaId: string;
  firma: string;
}

/** Der gültige Link einer Firma, oder null. */
export async function linkVonFirma(benutzerId: string): Promise<string | null> {
  const z = (await db()`
    select schluessel from reinigung_link
     where benutzer_id = ${benutzerId}::uuid and aus_am is null
     order by angelegt_am desc limit 1
  `.catch(() => [])) as Array<{ schluessel: string }>;
  return z[0] ? String(z[0].schluessel) : null;
}

/** Legt einen Link an, wenn es noch keinen gibt. */
export async function linkSicherstellen(benutzerId: string, von: string): Promise<string> {
  const vorhanden = await linkVonFirma(benutzerId);
  if (vorhanden) return vorhanden;
  return linkErneuern(benutzerId, von);
}

/**
 * Neuer Schlüssel, alter ungültig.
 *
 * Für den Tag, an dem der Link irgendwo landet, wo er nicht hingehört.
 */
export async function linkErneuern(benutzerId: string, von: string): Promise<string> {
  const schluessel = randomBytes(18).toString("base64url");
  await db()`update reinigung_link set aus_am = now() where benutzer_id = ${benutzerId}::uuid and aus_am is null`;
  await db()`
    insert into reinigung_link (schluessel, benutzer_id, angelegt_von)
    values (${schluessel}, ${benutzerId}::uuid, ${von})
  `;
  return schluessel;
}

/** Zu welcher Firma gehört dieser Schlüssel? */
export async function firmaZuSchluessel(schluessel: string): Promise<Putzlink | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(schluessel)) return null;
  const z = (await db()`
    select l.schluessel, b.id, b.name
      from reinigung_link l join benutzer b on b.id = l.benutzer_id
     where l.schluessel = ${schluessel} and l.aus_am is null and b.aktiv
     limit 1
  `.catch(() => [])) as Array<{ schluessel: string; id: string; name: string }>;
  const r = z[0];
  return r ? { schluessel: String(r.schluessel), firmaId: String(r.id), firma: String(r.name) } : null;
}

export interface PutzStand {
  name: string;
  /** Eingestempelt seit, als ISO. Null heißt: gerade nicht da. */
  seit: string | null;
  /** Wann zuletzt überhaupt gestempelt wurde, für die Reihenfolge. */
  zuletzt: string;
}

/**
 * Wer von der Firma gerade da ist, und wer zuletzt da war.
 *
 * Die Namen kommen aus den eigenen Stempeln der letzten Monate: Eine
 * gepflegte Mitarbeiterliste wäre eine Liste, die niemand pflegt.
 */
export async function staende(firmaId: string): Promise<PutzStand[]> {
  const z = (await db()`
    select distinct on (name) name, art, zeitpunkt
      from stempel
     where benutzer_id = ${firmaId}::uuid and zeitpunkt > now() - interval '180 days'
     order by name, zeitpunkt desc
  `.catch(() => [])) as Array<{ name: string; art: string; zeitpunkt: string }>;

  return z
    .map((r) => ({
      name: String(r.name),
      seit: r.art === "gehen" ? null : new Date(r.zeitpunkt).toISOString(),
      zuletzt: new Date(r.zeitpunkt).toISOString(),
    }))
    .sort((a, b) => {
      // Wer gerade da ist, steht oben: Der stempelt als Nächstes aus.
      if (Boolean(a.seit) !== Boolean(b.seit)) return a.seit ? -1 : 1;
      return b.zuletzt.localeCompare(a.zuletzt);
    });
}

/** Der Zustand einer einzelnen Person: eingestempelt oder nicht. */
export async function standVonName(firmaId: string, name: string): Promise<"aus" | "arbeit"> {
  const z = (await db()`
    select art from stempel
     where benutzer_id = ${firmaId}::uuid and name = ${name}
     order by zeitpunkt desc limit 1
  `.catch(() => [])) as Array<{ art: string }>;
  return z[0] && z[0].art !== "gehen" ? "arbeit" : "aus";
}

/**
 * Ein Name, wie er auf dem Zettel stehen soll.
 *
 * Keine Mailadressen, keine Romane: Was hier steht, taucht später in der
 * Aufstellung fürs Büro auf.
 */
export function nameSaeubern(roh: string): string {
  return roh
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}
