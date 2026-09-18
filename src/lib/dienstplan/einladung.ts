/**
 * Der Einladungslink fürs Showteam. Siehe migrations/041_einladung.sql.
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { appUrl } from "./mails";

export async function aktiveEinladung(): Promise<{ token: string; benutzt: number } | null> {
  const z = (await db()`
    select token, benutzt from einladung where aktiv and rolle = 'showteam' order by erstellt_am desc limit 1
  `) as Array<{ token: string; benutzt: number }>;
  return z[0] ?? null;
}

export async function einladungGueltig(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return false;
  const z = (await db()`select 1 from einladung where token = ${token} and aktiv`) as unknown[];
  return z.length > 0;
}

/** Neuer Link, der alte gilt ab sofort nicht mehr. */
export async function neueEinladung(von: string): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await db()`update einladung set aktiv = false where rolle = 'showteam'`;
  await db()`insert into einladung (token, erstellt_von) values (${token}, ${von})`;
  return token;
}

export async function einladungAbschalten(): Promise<void> {
  await db()`update einladung set aktiv = false where rolle = 'showteam'`;
}

export async function einladungBenutzt(token: string): Promise<void> {
  await db()`update einladung set benutzt = benutzt + 1 where token = ${token}`;
}

export function einladungsLink(token: string): string {
  return `${appUrl()}/einladung/${token}`;
}
