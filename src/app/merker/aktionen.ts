"use server";

/**
 * Der Merkzettel: abhaken, verschieben, etwas Eigenes notieren.
 * Jeder sieht und ändert nur seine eigenen Einträge.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  merkerAnlegen,
  merkerErledigt,
  merkerVerschieben,
  merkerWiederOeffnen,
} from "@/lib/db/merker";

const text = (f: FormData, k: string, max = 1000) => String(f.get(k) ?? "").trim().slice(0, max);

async function ich() {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  return b;
}

function zurueck(meldung: string): never {
  revalidatePath("/merker");
  revalidatePath("/", "layout");
  redirect(`/merker?meldung=${encodeURIComponent(meldung)}`);
}

export async function abhaken(f: FormData): Promise<void> {
  const b = await ich();
  await merkerErledigt(text(f, "id", 40), b.id);
  zurueck("Abgehakt. Ich erinnere dich nicht mehr daran.");
}

export async function verschieben(f: FormData): Promise<void> {
  const b = await ich();
  const tage = Math.max(1, Math.min(365, Number(text(f, "tage", 4)) || 7));
  await merkerVerschieben(text(f, "id", 40), b.id, tage);
  zurueck(`Gut, ich melde mich in ${tage} Tagen wieder.`);
}

export async function wiederOeffnen(f: FormData): Promise<void> {
  const b = await ich();
  await merkerWiederOeffnen(text(f, "id", 40), b.id);
  zurueck("Steht wieder auf dem Zettel.");
}

/** Selbst etwas notieren, woran das Programm erinnern soll. */
export async function notieren(f: FormData): Promise<void> {
  const b = await ich();
  const titel = text(f, "titel", 120);
  if (!titel) zurueck("Ohne Stichwort geht es nicht.");
  await merkerAnlegen({
    benutzerId: b.id,
    schluessel: `eigen-${Date.now()}`,
    titel,
    text: text(f, "text", 500),
    inTagen: Math.max(0, Math.min(365, Number(text(f, "tage", 4)) || 0)),
  });
  zurueck("Notiert.");
}
