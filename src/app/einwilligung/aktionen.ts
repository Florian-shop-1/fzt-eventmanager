"use server";

/**
 * Die Einwilligung in Dienstnachrichten per WhatsApp.
 *
 * Nur die Person selbst kann sie geben, und beide Wege sind gleich
 * leicht erreichbar: Ein Ja, zu dem es keine echte Alternative gibt,
 * wäre keines. Wer nein sagt, bekommt dieselben Hinweise per Mail.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { einwilligungSetzen, handySetzen } from "@/lib/personal/handy";

export async function whatsappJa(formData: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!ich) redirect("/anmelden");

  const roh = String(formData.get("handy") ?? "").trim();
  try {
    if (roh) await handySetzen(ich.id, roh);
  } catch {
    redirect("/?meldung=" + encodeURIComponent("Die Nummer sah nicht richtig aus. Zum Beispiel: 0176 1234567."));
  }
  await einwilligungSetzen(ich.id, true);
  revalidatePath("/");
  redirect("/?meldung=" + encodeURIComponent("Danke! Wir melden uns bei Bedarf per WhatsApp."));
}

export async function whatsappNein(): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!ich) redirect("/anmelden");
  await einwilligungSetzen(ich.id, false);
  revalidatePath("/");
  redirect("/?meldung=" + encodeURIComponent("Alles klar, es bleibt bei der Mail."));
}
