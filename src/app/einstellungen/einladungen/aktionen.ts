"use server";

/**
 * Einladungslinks je Bereich: erstellen, erneuern, abschalten.
 * Erlaubt für Florian und Kevin (siehe darfEinladen).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen } from "@/lib/auth/sitzung";
import { BEREICHE, einladungAbschalten, neueEinladung } from "@/lib/dienstplan/einladung";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function verlangeRecht() {
  const b = await angemeldeterBenutzer();
  if (!darfEinladen(b)) throw new Error("Einladungslinks dürfen nur Florian und Kevin ausgeben.");
  return b!;
}

function rolleVon(f: FormData): string {
  const r = text(f, "rolle");
  if (!BEREICHE.some((b) => b.rolle === r)) throw new Error("Diesen Bereich gibt es nicht.");
  return r;
}

function zurueck(meldung: string, rolle: string): never {
  revalidatePath("/einstellungen/einladungen");
  revalidatePath("/dienstplan/einrichtung");
  redirect(`/einstellungen/einladungen?meldung=${encodeURIComponent(meldung)}#b-${rolle}`);
}

/** Neuer Link für einen Bereich. Der alte gilt danach nicht mehr. */
export async function linkErneuern(f: FormData): Promise<void> {
  const b = await verlangeRecht();
  const rolle = rolleVon(f);
  await neueEinladung(b.name, rolle);
  zurueck("Neuer Link erstellt. Der alte gilt nicht mehr.", rolle);
}

export async function linkAbschalten(f: FormData): Promise<void> {
  await verlangeRecht();
  const rolle = rolleVon(f);
  await einladungAbschalten(rolle);
  zurueck("Link abgeschaltet.", rolle);
}
