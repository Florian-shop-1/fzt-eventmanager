/**
 * Einladungslinks. Siehe migrations/041_einladung.sql und 042.
 *
 * Zwei Arten:
 *  - offene Links je Bereich: einer für alle (Showteam, Foyer, Gastro ...),
 *    beliebig oft verwendbar, bis er abgeschaltet oder erneuert wird
 *  - persönliche Links: für eine Person, feste E-Mail und Rolle, nur einmal gültig
 *
 * Wer den Link hat, legt sich einen Zugang an. Deshalb gehört er nur in
 * den Kreis, für den er gedacht ist; ein neuer Link schaltet den alten ab.
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

/** Die Bereiche, für die es einen offenen Link geben kann. */
export const BEREICHE: Array<{ rolle: string; titel: string; text: string; achtung?: string }> = [
  {
    rolle: "showteam",
    titel: "Showteam",
    text: "Abenddienst im Saal. Jeder wählt beim Eintragen selbst, was er macht (FOH, T1, T1 Rookie, T2), und landet im Dienstplan.",
  },
  {
    rolle: "foyer",
    titel: "Foyer",
    text: "Einlass, Stehtische, Bändchen. Sieht Foyerblatt, Einlassliste, Sitzplan und Parkplätze, aber keine Preise.",
  },
  {
    rolle: "gastro",
    titel: "Gastronomie",
    text: "Küche und Sitzplan. Sieht Funktionsheet, Küchenblatt und Belegung, keine Preise und keine Kundendaten.",
  },
  {
    rolle: "kiosk",
    titel: "Food-Kiosk",
    text: "Externer Partner. Sieht ausschließlich die Stehtische je Abend.",
  },
  {
    rolle: "team",
    titel: "Büro",
    text: "Vorgänge, Angebote, Versand, Planung.",
    achtung: "Das Büro sieht Preise, Kundendaten und Zahlungen. Diesen Link nur an Leute geben, die das dürfen.",
  },
  {
    rolle: "buchhaltung",
    titel: "Buchhaltung",
    text: "Nur die Belege und die Buchhaltung, nichts aus dem Tagesgeschäft.",
    achtung: "Führt direkt in die Buchhaltung. Am besten nur persönlich weitergeben.",
  },
];

export interface OffenerLink {
  rolle: string;
  token: string;
  benutzt: number;
  erstelltVon: string | null;
  erstelltAm: string;
}

/** Der offene Link eines Bereichs, oder null. */
export async function aktiveEinladung(rolle = "showteam"): Promise<{ token: string; benutzt: number } | null> {
  const z = (await db()`
    select token, benutzt from einladung
     where aktiv and rolle = ${rolle} and email is null
     order by erstellt_am desc limit 1
  `) as Array<{ token: string; benutzt: number }>;
  return z[0] ?? null;
}

/** Alle offenen Links, für die Übersicht bei den Zugängen. */
export async function offeneEinladungen(): Promise<OffenerLink[]> {
  const z = (await db()`
    select distinct on (rolle) rolle, token, benutzt, erstellt_von, erstellt_am
      from einladung where aktiv and email is null
     order by rolle, erstellt_am desc
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    rolle: String(r.rolle),
    token: String(r.token),
    benutzt: Number(r.benutzt ?? 0),
    erstelltVon: (r.erstellt_von as string) ?? null,
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
  }));
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

/** Neuer offener Link für einen Bereich, der alte gilt ab sofort nicht mehr. */
export async function neueEinladung(von: string, rolle = "showteam"): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await db()`update einladung set aktiv = false where rolle = ${rolle} and email is null`;
  await db()`insert into einladung (token, rolle, erstellt_von) values (${token}, ${rolle}, ${von})`;
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

export async function einladungAbschalten(rolle = "showteam"): Promise<void> {
  await db()`update einladung set aktiv = false where rolle = ${rolle} and email is null`;
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
