"use server";

/**
 * Die Show-Checkliste abhaken.
 *
 * Abgehakt wird je Vorstellung. Wer abgehakt hat, steht daneben: Nicht
 * zur Kontrolle, sondern damit man am Abend weiß, wen man fragen kann
 * (Florian, 03.10.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { haken, hakenWeg, punktAendern, punktAnlegen, punktWeg, type Bereich } from "@/lib/showcheck/db";

const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Bitte neu anmelden.");
  // Abhaken darf, wer am Abend arbeitet: Showteam, Büro, Chef.
  if (!["chef", "team", "showteam"].includes(b.rolle)) {
    throw new Error("Die Show-Checkliste ist für das Showteam.");
  }
  return b;
}

function zurueck(abend: string): never {
  revalidatePath("/showcheck");
  redirect(`/showcheck?abend=${encodeURIComponent(abend)}`);
}

export async function punktHaken(f: FormData): Promise<void> {
  const b = await zugang();
  const abend = text(f, "abend", 60);
  const datum = text(f, "datum", 10);
  const punktId = text(f, "punkt", 40);
  const an = text(f, "an", 4) === "ja";

  if (an) await haken({ ditixEventId: abend, datum, punktId, wer: b.name });
  else await hakenWeg(abend, punktId);

  zurueck(abend);
}

/** Die Liste selbst pflegen: nur Florian. */
async function nurChef() {
  const b = await angemeldeterBenutzer();
  if (!b || b.rolle !== "chef") throw new Error("Die Liste ändert nur Florian.");
  return b;
}

export async function punktDazu(f: FormData): Promise<void> {
  await nurChef();
  const bereich = text(f, "bereich", 20) as Bereich;
  const neu = text(f, "text", 300);
  if (neu) await punktAnlegen(bereich, neu);
  zurueck(text(f, "abend", 60));
}

export async function punktUmbenennen(f: FormData): Promise<void> {
  await nurChef();
  const neu = text(f, "text", 300);
  if (neu) await punktAendern(text(f, "punkt", 40), neu);
  zurueck(text(f, "abend", 60));
}

export async function punktEntfernen(f: FormData): Promise<void> {
  await nurChef();
  await punktWeg(text(f, "punkt", 40));
  zurueck(text(f, "abend", 60));
}
