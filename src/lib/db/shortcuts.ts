"use server";

/**
 * Shortcuts: die Links, die im Alltag ständig gebraucht werden.
 *
 * Sie lagen früher im Browser des jeweiligen Benutzers. Das war praktisch
 * gedacht und in der Sache falsch: Beim Leeren des Browsers waren sie weg,
 * und niemand außer dem Eintragenden hat sie je gesehen. Jetzt stehen sie
 * in der gemeinsamen Datenbank, wo eine geteilte Linksammlung hingehört.
 */

import { revalidatePath } from "next/cache";
import { db } from "./client";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";

export interface Shortcut {
  id: string;
  titel: string;
  url: string;
  notiz: string;
}

/** Alle Shortcuts, in der festgelegten Reihenfolge. */
export async function holeShortcuts(): Promise<Shortcut[]> {
  const zeilen = (await db()`
    select id, titel, url, notiz from shortcut order by sortierung, erstellt_am
  `) as Array<{ id: string; titel: string; url: string; notiz: string }>;

  return zeilen.map((z) => ({
    id: String(z.id),
    titel: z.titel,
    url: z.url,
    notiz: z.notiz,
  }));
}

/**
 * Wacht über Änderungen an der Sammlung.
 *
 * Ansehen und öffnen darf jeder, der die Seite sieht. Ändern nur Büro und
 * Geschäftsführung: Eine geteilte Linkliste, die jeder umschreiben kann,
 * ist am Ende niemandes Liste.
 */
async function verlangeBuero(): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  if (!darfKaufmaennisches(benutzer.rolle)) {
    throw new Error("Für Änderungen an den Shortcuts fehlt die Berechtigung.");
  }
}

function feld(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function shortcutSpeichern(id: string, formData: FormData): Promise<void> {
  await verlangeBuero();
  const titel = feld(formData, "titel") || "Ohne Titel";

  await db()`
    update shortcut
       set titel = ${titel},
           url = ${feld(formData, "url")},
           notiz = ${feld(formData, "notiz")}
     where id = ${id}
  `;
  revalidatePath("/shortcuts");
}

export async function shortcutAnlegen(): Promise<void> {
  await verlangeBuero();
  const hoechste = (await db()`
    select coalesce(max(sortierung), 0) as n from shortcut
  `) as Array<{ n: number }>;

  await db()`
    insert into shortcut (titel, sortierung) values ('Neuer Shortcut', ${Number(hoechste[0].n) + 1})
  `;
  revalidatePath("/shortcuts");
}

export async function shortcutEntfernen(id: string): Promise<void> {
  await verlangeBuero();
  await db()`delete from shortcut where id = ${id}`;
  revalidatePath("/shortcuts");
}
