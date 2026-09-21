"use server";

/**
 * Hinweise zum Abend anlegen, ändern und löschen.
 * Erlaubt für Büro, Chefs und das Foyer (Kevin, Florian, Sarah).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { hinweisAendern, hinweisAnlegen, hinweisLoeschen } from "@/lib/db/abendhinweis";

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
  redirect(`${ziel}${trenner}meldung=${encodeURIComponent(meldung)}#hinweise`);
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
