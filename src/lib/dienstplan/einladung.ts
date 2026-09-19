/**
 * Einladungslinks. Siehe migrations/041_einladung.sql und 042.
 *
 * Zwei Arten:
 *  - der offene Link fürs Showteam: einer für alle, jeder wählt seine Position
 *  - persönliche Links: für eine Person, feste E-Mail und Rolle, nur einmal gültig
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { appUrl } from "./mails";

export interface Einladung {
  token: string;
  rolle: string;
  /** Gesetzt bei persönlichen Einladungen. */
  email: string | null;
  art: "intern" | "extern" | null;
  personalbogenErledigt: boolean;
  geheimhaltungErledigt: boolean;
}

export async function aktiveEinladung(): Promise<{ token: string; benutzt: number } | null> {
  const z = (await db()`
    select token, benutzt from einladung
     where aktiv and rolle = 'showteam' and email is null
     order by erstellt_am desc limit 1
  `) as Array<{ token: string; benutzt: number }>;
  return z[0] ?? null;
}

/** Die Einladung zu einem Link, oder null, wenn er nicht (mehr) gilt. */
export async function einladungLesen(token: string): Promise<Einladung | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const z = (await db()`
    select token, rolle, email, art, personalbogen_erledigt, geheimhaltung_erledigt
      from einladung where token = ${token} and aktiv
  `) as Array<Record<string, unknown>>;
  const e = z[0];
  if (!e) return null;
  return {
    token: String(e.token),
    rolle: String(e.rolle),
    email: (e.email as string) ?? null,
    art: (e.art as "intern" | "extern") ?? null,
    personalbogenErledigt: Boolean(e.personalbogen_erledigt),
    geheimhaltungErledigt: Boolean(e.geheimhaltung_erledigt),
  };
}

export async function einladungGueltig(token: string): Promise<boolean> {
  return (await einladungLesen(token)) !== null;
}

/** Neuer Showteam-Link, der alte gilt ab sofort nicht mehr. */
export async function neueEinladung(von: string): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await db()`update einladung set aktiv = false where rolle = 'showteam' and email is null`;
  await db()`insert into einladung (token, erstellt_von) values (${token}, ${von})`;
  return token;
}

/** Persönlicher Link für eine Person, nur einmal gültig. */
export async function persoenlicheEinladung(e: Omit<Einladung, "token">, von: string): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await db()`
    insert into einladung (token, rolle, email, art, personalbogen_erledigt, geheimhaltung_erledigt, erstellt_von)
    values (${token}, ${e.rolle}, ${e.email}, ${e.art}, ${e.personalbogenErledigt}, ${e.geheimhaltungErledigt}, ${von})
  `;
  return token;
}

export async function einladungAbschalten(): Promise<void> {
  await db()`update einladung set aktiv = false where rolle = 'showteam' and email is null`;
}

/** Zählt mit. Persönliche Links gelten danach nicht mehr. */
export async function einladungBenutzt(token: string): Promise<void> {
  await db()`
    update einladung set benutzt = benutzt + 1, aktiv = case when email is null then aktiv else false end
     where token = ${token}
  `;
}

export function einladungsLink(token: string): string {
  return `${appUrl()}/einladung/${token}`;
}
