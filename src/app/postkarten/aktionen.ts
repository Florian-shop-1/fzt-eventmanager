"use server";

/**
 * Was man mit einer gescannten Postkarte machen kann.
 *
 * Die Freigabe für die Webseite ist bewusst der einzige Weg nach
 * draußen, und sie verlangt zweierlei auf einmal: ein geschwärztes Bild
 * und einen Menschen, der es bestätigt. Deshalb liegt sie nicht hier,
 * sondern in der Route freigeben/route.ts, wo das Bild ankommt.
 *
 * Hier stehen die Entscheidungen, für die es kein Bild braucht:
 * zurückhalten, verwerfen, als Highlight markieren, Zitat berichtigen.
 */

import { revalidatePath } from "next/cache";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import {
  datenschutzSperren,
  highlightSetzen,
  standSetzen,
  zitatAendern,
  type Kartenstand,
} from "@/lib/postkarte/db";

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) {
    throw new Error("Über Postkarten entscheiden dürfen Florian und das Büro.");
  }
  return b;
}

export async function kartenStand(id: string, status: Kartenstand, notiz = ""): Promise<void> {
  await zugang();
  await standSetzen(id, status, notiz);
  revalidatePath("/postkarten");
}

export async function kartenSperren(id: string, grund: string): Promise<void> {
  await zugang();
  await datenschutzSperren(id, grund || "Enthält Persönliches.");
  revalidatePath("/postkarten");
}

export async function kartenHighlight(id: string, an: boolean): Promise<void> {
  await zugang();
  await highlightSetzen(id, an);
  revalidatePath("/postkarten");
}

/**
 * Das Zitat berichtigen.
 *
 * Erlaubt ist das Kürzen und das Berichtigen eines falsch gelesenen
 * Wortes. Nicht erlaubt ist das Umschreiben: Was auf der Wand steht,
 * muss auf der Karte stehen. Darum steht das Transkript im
 * Eventmanager immer daneben.
 */
export async function kartenZitat(id: string, zitat: string): Promise<void> {
  await zugang();
  await zitatAendern(id, zitat.trim().slice(0, 400));
  revalidatePath("/postkarten");
}
