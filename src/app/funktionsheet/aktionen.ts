"use server";

/**
 * Hinweise zum Abend anlegen, ändern und löschen.
 * Erlaubt für Büro, Chefs und das Foyer (Kevin, Florian, Sarah).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfTermineAnlegen } from "@/lib/auth/sitzung";
import { hinweisAendern, hinweisAnlegen, hinweisLoeschen } from "@/lib/db/abendhinweis";
import { firmenmenueAendern, firmenmenueEintragen } from "@/lib/db/firmenmenue";
import {
  eigenenTerminAendern,
  eigenenTerminAnlegen,
  eigenenTerminEntfernen,
} from "@/lib/db/eigenertermin";

const text = (f: FormData, k: string, max = 4000) => String(f.get(k) ?? "").trim().slice(0, max);

async function darf() {
  const b = await angemeldeterBenutzer();
  if (!b || !["chef", "team", "foyer"].includes(b.rolle)) throw new Error("Nicht erlaubt.");
  return b;
}

function zurueck(f: FormData, meldung: string): never {
  revalidatePath("/funktionsheet");
  revalidatePath("/kueche");
  revalidatePath("/foyer");
  const ziel = text(f, "zurueckZu", 200) || "/funktionsheet";
  const trenner = ziel.includes("?") ? "&" : "?";
  const anker = text(f, "anker", 40) || "hinweise";
  redirect(`${ziel}${trenner}meldung=${encodeURIComponent(meldung)}#${anker}`);
}

export async function hinweisSpeichern(f: FormData): Promise<void> {
  const b = await darf();
  const id = text(f, "id", 40);
  const datum = text(f, "datum", 10);
  const titel = text(f, "titel", 120);
  const inhalt = text(f, "text");

  if (!inhalt) zurueck(f, "Es war nichts eingetragen.");
  if (id) {
    await hinweisAendern(id, titel, inhalt, b.name);
    zurueck(f, "Hinweis geändert.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) zurueck(f, "Für diesen Abend geht das nicht.");
  await hinweisAnlegen({ datum, titel, text: inhalt, von: b.name });
  zurueck(f, "Hinweis gespeichert. Er steht jetzt auf dem Funktionsheet.");
}

export async function hinweisEntfernen(f: FormData): Promise<void> {
  await darf();
  await hinweisLoeschen(text(f, "id", 40));
  zurueck(f, "Hinweis gelöscht.");
}

/** Firmenmenüs eintragen, direkt aus dem Funktionsheet heraus. */
export async function firmaEintragen(f: FormData): Promise<void> {
  const e = await firmenmenueEintragen(f);
  zurueck(f, e.meldung);
}

/** Gemeldete Menüzahlen einer Firma nachtragen oder korrigieren. */
export async function firmaAendern(f: FormData): Promise<void> {
  const e = await firmenmenueAendern(f);
  zurueck(f, e.meldung);
}

/* ------------------------------------------------------------------ *
 * Termine, die es im Ticketshop nicht gibt.
 *
 * Zum Beispiel das exklusiv gebuchte Haus: keine Karten, kein Eintrag in
 * Ditix, aber ein ganz normaler Arbeitstag fuer Kueche, Foyer und Technik.
 * Anlegen duerfen das nur Florian und Kevin.
 * ------------------------------------------------------------------ */

async function darfTermine() {
  const b = await angemeldeterBenutzer();
  if (!darfTermineAnlegen(b)) throw new Error("Termine anlegen dürfen nur Florian und Kevin.");
  return b!;
}

const istDatum = (d: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d);
const istUhrzeit = (u: string) => /^[0-9]{2}:[0-9]{2}$/.test(u);

export async function terminAnlegen(f: FormData): Promise<void> {
  const b = await darfTermine();
  const datum = text(f, "datum", 10);
  const uhrzeit = text(f, "uhrzeit", 5);
  const name = text(f, "name", 120);
  if (!istDatum(datum)) zurueck(f, "Bitte ein Datum auswählen.");
  if (!istUhrzeit(uhrzeit)) zurueck(f, "Die Uhrzeit sieht nicht richtig aus (zum Beispiel 20:00).");
  if (!name) zurueck(f, "Bitte schreib dazu, worum es geht.");

  await eigenenTerminAnlegen({ datum, uhrzeit, name, notiz: text(f, "notiz", 300), von: b.name });
  revalidatePath("/", "layout");
  zurueck(f, `${name} am ${datum.split("-").reverse().join(".")} ist angelegt und steht jetzt überall im Programm.`);
}

export async function terminAendern(f: FormData): Promise<void> {
  await darfTermine();
  const datum = text(f, "datum", 10);
  const uhrzeit = text(f, "uhrzeit", 5);
  const name = text(f, "name", 120);
  if (!istDatum(datum) || !istUhrzeit(uhrzeit) || !name) zurueck(f, "Bitte Datum, Uhrzeit und Anlass prüfen.");
  await eigenenTerminAendern({ id: text(f, "id", 40), datum, uhrzeit, name, notiz: text(f, "notiz", 300) });
  revalidatePath("/", "layout");
  zurueck(f, "Termin geändert.");
}

export async function terminEntfernen(f: FormData): Promise<void> {
  await darfTermine();
  await eigenenTerminEntfernen(text(f, "id", 40));
  revalidatePath("/", "layout");
  zurueck(f, "Termin entfernt. Was schon daran hängt, bleibt gespeichert.");
}
