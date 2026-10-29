"use server";

import { revalidatePath } from "next/cache";
import { leadSpeichern } from "@/lib/db/buero";

/**
 * Stand und Notiz einer Anfrage nach einem barrierefreien Platz.
 *
 * Gespeichert wird in derselben Tabelle wie bei den Anfragen und den
 * Stoerungen (lead_stand). Die Seite muss danach neu gerechnet werden,
 * sonst steht der alte Stand noch da.
 */
export async function barrierefreiSpeichern(
  schluessel: string,
  formData: FormData,
): Promise<void> {
  await leadSpeichern(schluessel, formData);
  revalidatePath("/barrierefrei");
}
