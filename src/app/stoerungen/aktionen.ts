"use server";

import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { technikStoerungErledigt } from "@/lib/db/technik-stoerung";

/** Hakt eine gemeldete Störung ab. Danach beginnt für denselben Termin eine neue. */
export async function stoerungAbhaken(id: string, formData: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  const notiz = String(formData.get("notiz") ?? "").trim().slice(0, 500);
  await technikStoerungErledigt(id, benutzer.name, notiz || null);
  revalidatePath("/stoerungen");
}
