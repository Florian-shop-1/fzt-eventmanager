"use server";

import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { stoerungMailSchalten, technikStoerungErledigt } from "@/lib/db/technik-stoerung";

/** Hakt eine gemeldete Störung ab. Danach beginnt für denselben Termin eine neue. */
export async function stoerungAbhaken(id: string, formData: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  const notiz = String(formData.get("notiz") ?? "").trim().slice(0, 500);
  await technikStoerungErledigt(id, benutzer.name, notiz || null);
  revalidatePath("/stoerungen");
}

/**
 * Warnmails an- oder abschalten.
 *
 * Aufgezeichnet wird in beiden Fällen alles. Es geht nur darum, ob bei der
 * ersten Meldung je Termin eine Mail hinausgeht.
 */
export async function mailSchalten(formData: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  const an = String(formData.get("an") ?? "") === "an";
  await stoerungMailSchalten(
    an,
    benutzer.name,
    an
      ? "Wieder eingeschaltet."
      : "Abgeschaltet nach Rücksprache mit Julian: Die Meldungen entstanden überwiegend im Browser und waren für Gäste kaum sichtbar.",
  );
  revalidatePath("/stoerungen");
}
