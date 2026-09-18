"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { findeTermin } from "@/lib/ditix/spielplan";
import { gastAnlegen, gastLoeschen, platzEintragen } from "@/lib/db/gaesteliste";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Eintragen und löschen dürfen Florian und das Büro. */
async function buero() {
  const b = await angemeldeterBenutzer();
  if (!b || (b.rolle !== "chef" && b.rolle !== "team")) throw new Error("Nicht erlaubt.");
  return b;
}

function neu() {
  revalidatePath("/gaesteliste");
  revalidatePath("/upgrades");
  revalidatePath("/einlassliste");
}

export async function gastEintragen(formular: FormData): Promise<void> {
  const b = await buero();
  const vorstellung = text(formular, "vorstellung");
  const name = text(formular, "name").slice(0, 120);
  const anzahl = Math.round(Number(text(formular, "anzahl")));
  const termin = await findeTermin(vorstellung);
  if (!termin) redirect(`/gaesteliste?meldung=${encodeURIComponent("Diese Vorstellung gibt es nicht.")}`);
  if (!name || !(anzahl >= 1 && anzahl <= 30)) {
    redirect(`/gaesteliste?v=${vorstellung}&meldung=${encodeURIComponent("Bitte Name und Anzahl (1 bis 30) angeben.")}`);
  }
  await gastAnlegen({
    ditixEventId: termin.ditixEventId,
    datum: termin.datum,
    uhrzeit: termin.uhrzeit,
    name,
    anzahl,
    notiz: text(formular, "notiz").slice(0, 200),
    von: b.name,
  });
  neu();
  redirect(`/gaesteliste?v=${vorstellung}&meldung=${encodeURIComponent(`${name} (${anzahl}) steht auf der Gästeliste.`)}`);
}

export async function gastEntfernen(formular: FormData): Promise<void> {
  await buero();
  await gastLoeschen(text(formular, "id"));
  neu();
}

/** Vor Ort: wo der Gast tatsächlich sitzt. Darf auch das Showteam und das Foyer. */
export async function gastGesetzt(formular: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || !["chef", "team", "showteam", "foyer"].includes(b.rolle)) throw new Error("Nicht erlaubt.");
  await platzEintragen(text(formular, "id"), text(formular, "platz").slice(0, 60), b.name);
  neu();
}
