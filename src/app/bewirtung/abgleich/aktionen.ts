"use server";

/**
 * Belege und Abbuchungen zusammenbringen.
 *
 * Alles hier ist eine Zuordnung, keine Zahlung: Das Konto wird
 * ausschliesslich gelesen, geaendert wird nur, was im Eventmanager steht.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import {
  belegLoesen,
  belegZuordnen,
  keinBelegNoetig,
  regelAnlegen,
  regelLoeschen,
} from "@/lib/bewirtung/abgleich";

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) throw new Error("Nur für die Buchhaltung.");
  return b!;
}

function zurueck(monat: string, meldung: string): never {
  revalidatePath("/bewirtung/abgleich");
  redirect(`/bewirtung/abgleich?m=${monat}&meldung=${encodeURIComponent(meldung)}`);
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function zuordnen(f: FormData): Promise<void> {
  const b = await zugang();
  await belegZuordnen(text(f, "umsatzId"), text(f, "belegId"), b.name);
  zurueck(text(f, "monat"), "Beleg zugeordnet.");
}

export async function loesen(f: FormData): Promise<void> {
  await zugang();
  await belegLoesen(text(f, "umsatzId"));
  zurueck(text(f, "monat"), "Wieder offen.");
}

export async function ohneBeleg(f: FormData): Promise<void> {
  const b = await zugang();
  await keinBelegNoetig(text(f, "umsatzId"), text(f, "grund") || "braucht keinen Beleg", b.name);
  zurueck(text(f, "monat"), "Abgehakt.");
}

/**
 * Eine Regel fuer alles, was so heisst.
 *
 * Damit ist die Stromrechnung ein fuer alle Mal erledigt, statt jeden
 * Monat neu (Florian, 29.09.2026).
 */
export async function regelSpeichern(f: FormData): Promise<void> {
  const b = await zugang();
  try {
    await regelAnlegen(text(f, "muster"), text(f, "grund"), b.name);
  } catch (fehler) {
    zurueck(text(f, "monat"), fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.");
  }
  zurueck(text(f, "monat"), `Regel gespeichert: alles mit "${text(f, "muster")}" braucht keinen Beleg.`);
}

export async function regelWeg(f: FormData): Promise<void> {
  await zugang();
  await regelLoeschen(text(f, "id"));
  zurueck(text(f, "monat"), "Regel gelöscht.");
}
