"use server";

/**
 * Stempeluhr: Einrichtung, Änderungswünsche und Korrekturen.
 *
 * Ändern dürfen nur Werner, Kevin und Florian. Alle anderen stellen einen
 * Antrag; das Büro nimmt ihn an oder lehnt ihn ab. So bleibt jede Änderung
 * an der Arbeitszeit nachvollziehbar.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfZeitenAendern } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import {
  antragEntscheiden,
  antragStellen,
  nachtragen,
  schluesselLoeschen,
  schluesselNeu,
  stempelEntfernen,
  zeitAendern,
  type StempelArt,
} from "@/lib/stempel/db";
import { melden } from "@/lib/stempel/wache";

const text = (f: FormData, k: string, max = 1000) => String(f.get(k) ?? "").trim().slice(0, max);

function zurueck(meldung: string, anker = "", f?: FormData): never {
  revalidatePath("/stempeluhr");
  // Bei einer Korrektur bleibt die Ansicht auf derselben Person und
  // demselben Tag stehen, sonst müsste man jedes Mal neu auswählen.
  const wer = f ? String(f.get("benutzerId") ?? f.get("wer") ?? "") : "";
  const tag = f ? String(f.get("tag") ?? "") : "";
  const dazu = `${wer ? `&wer=${encodeURIComponent(wer)}` : ""}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`;
  redirect(`/stempeluhr?meldung=${encodeURIComponent(meldung)}${dazu}${anker}`);
}

async function verlangeBuero() {
  const b = await angemeldeterBenutzer();
  if (!darfZeitenAendern(b)) throw new Error("Arbeitszeiten dürfen nur Werner, Kevin und Florian ändern.");
  return b!;
}

/** Mittelpunkt, Umkreis und Meldegrenze der Stempeluhr. Nur für den Inhaber. */
export async function standortSpeichern(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || b.rolle !== "chef") throw new Error("Nur die Geschäftsführung darf das ändern.");

  const zahl = (k: string) => Number(String(f.get(k) ?? "").replace(",", ".").trim());
  const lat = zahl("lat");
  const lon = zahl("lon");
  const radius = Math.max(30, Math.min(2000, Math.round(zahl("radius")) || 150));
  const maxStunden = Math.max(1, Math.min(24, Math.round(zahl("maxStunden")) || 10));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    redirect(`/stempeluhr?meldung=${encodeURIComponent("Die Koordinaten sehen nicht richtig aus.")}`);
  }

  const feierabend = /^\d{2}:\d{2}$/.test(text(f, "feierabend", 5)) ? text(f, "feierabend", 5) : "23:45";

  await db()`
    update stempel_einstellung set lat = ${lat}, lon = ${lon}, radius_m = ${radius},
           max_stunden = ${maxStunden}, aktiv = ${Boolean(f.get("aktiv"))}, feierabend = ${feierabend}
     where id = 1
  `;
  zurueck("Gespeichert.");
}

/* ------------------------------------------------------------------ *
 * Mitarbeiter: Korrektur beantragen und Pausen begründen.
 * ------------------------------------------------------------------ */

/** "Ich habe um 17 Uhr aufgehört, nicht um 19 Uhr." Geht ans Büro. */
export async function korrekturBeantragen(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Bitte neu anmelden.");
  const tag = text(f, "tag", 10);
  const wunsch = text(f, "text");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) zurueck("Bitte einen Tag auswählen.", "#antrag");
  if (!wunsch) zurueck("Bitte kurz schreiben, was geändert werden soll.", "#antrag");

  await antragStellen({ benutzerId: b.id, name: b.name, art: "aenderung", tag, text: wunsch });
  await melden(`${b.name} möchte eine Arbeitszeit geändert haben`, [
    `${b.name} bittet um eine Korrektur für den ${tag.split("-").reverse().join(".")}:`,
    wunsch,
    "",
    "Annehmen oder ablehnen geht in der Stempeluhr.",
  ]).catch(() => undefined);

  zurueck("Dein Änderungswunsch ist beim Büro. Du bekommst Bescheid.", "#antrag");
}

/** Warum die Pause ausfiel. Wird nur festgehalten, nicht entschieden. */
export async function pausengrundSenden(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Bitte neu anmelden.");
  const grund = text(f, "text");
  if (!grund) zurueck("Bitte kurz den Grund schreiben.", "#pause");
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  await antragStellen({ benutzerId: b.id, name: b.name, art: "pausengrund", tag: heute, text: grund });
  zurueck("Danke, das ist notiert.", "#pause");
}

/* ------------------------------------------------------------------ *
 * Büro: Anträge entscheiden, Zeiten korrigieren.
 * ------------------------------------------------------------------ */

export async function antragBeantworten(f: FormData): Promise<void> {
  const b = await verlangeBuero();
  const id = text(f, "id", 40);
  const status = text(f, "status", 20) === "angenommen" ? "angenommen" : "abgelehnt";
  const antwort = text(f, "antwort");

  const a = await antragEntscheiden(id, status, antwort, b.name);
  if (!a) zurueck("Diesen Antrag gibt es nicht mehr.", "#antraege");

  const p = (await db()`select email from benutzer where id = ${a.benutzerId}`) as Array<{ email: string }>;
  if (p[0]?.email) {
    await mailVerschicken({
      an: p[0].email,
      betreff: status === "angenommen" ? "Deine Arbeitszeit wurde korrigiert" : "Zu deinem Änderungswunsch",
      text: [
        `Hallo ${a.name.split(" ")[0]},`,
        "",
        `dein Änderungswunsch für den ${a.tag.split("-").reverse().join(".")} wurde ${
          status === "angenommen" ? "angenommen" : "abgelehnt"
        }.`,
        antwort ? `\n${b.name} schreibt: ${antwort}` : "",
        "",
        "Bei Fragen meld dich einfach.",
      ].join("\n"),
    }).catch(() => undefined);
  }
  zurueck(status === "angenommen" ? "Angenommen. Bitte die Zeit noch eintragen." : "Abgelehnt, der Mitarbeiter hat Bescheid.", "#antraege");
}

function zeitpunktAus(tag: string, uhrzeit: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag) || !/^\d{1,2}:\d{2}$/.test(uhrzeit)) return null;
  // Über die Datenbank in die richtige Zeitzone bringen wäre sauberer, aber
  // Deutschland hat nur zwei Abstände zur Weltzeit. Den nimmt der Browser-
  // unabhängige Weg über Intl heraus.
  const [j, m, t] = tag.split("-").map(Number);
  const [h, min] = uhrzeit.split(":").map(Number);
  const roh = Date.UTC(j, m - 1, t, h, min);
  // Abstand zur Weltzeit an diesem Tag bestimmen (1 oder 2 Stunden).
  const probe = new Date(roh);
  const berlin = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(roh - (berlin.getTime() - utc.getTime())).toISOString();
}

export async function zeitKorrigieren(f: FormData): Promise<void> {
  const b = await verlangeBuero();
  const id = text(f, "id", 40);
  const zeitpunkt = zeitpunktAus(text(f, "tag", 10), text(f, "uhrzeit", 5));
  if (!zeitpunkt) zurueck("Die Uhrzeit sieht nicht richtig aus (zum Beispiel 17:30).", "#korrektur");
  await zeitAendern(id, zeitpunkt, b.name);
  zurueck("Zeit geändert.", "#korrektur", f);
}

export async function stempelLoeschen(f: FormData): Promise<void> {
  await verlangeBuero();
  await stempelEntfernen(text(f, "id", 40));
  zurueck("Stempel gelöscht.", "#korrektur", f);
}

export async function stempelNachtragen(f: FormData): Promise<void> {
  const b = await verlangeBuero();
  const benutzerId = text(f, "benutzerId", 40);
  const art = text(f, "art", 20) as StempelArt;
  const zeitpunkt = zeitpunktAus(text(f, "tag", 10), text(f, "uhrzeit", 5));
  if (!["kommen", "pause_start", "pause_ende", "gehen"].includes(art)) zurueck("Unbekannte Art.", "#korrektur", f);
  if (!zeitpunkt) zurueck("Die Uhrzeit sieht nicht richtig aus (zum Beispiel 17:30).", "#korrektur", f);
  await nachtragen({ benutzerId, art, zeitpunkt, von: b.name });
  zurueck("Nachgetragen.", "#korrektur", f);
}

/* ------------------------------------------------------------------ *
 * Der persönliche Schlüssel fürs Ausstempeln vom Handy aus.
 * ------------------------------------------------------------------ */

export async function schluesselErzeugen(): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Bitte neu anmelden.");
  await schluesselNeu(b.id);
  zurueck("Dein Link ist fertig. Jetzt unten in den Kurzbefehl einsetzen.", "#automatik");
}

export async function schluesselAbschalten(): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Bitte neu anmelden.");
  await schluesselLoeschen(b.id);
  zurueck("Abgeschaltet. Der alte Link geht nicht mehr.", "#automatik");
}
