"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { notizErledigen } from "@/lib/telefon/werkzeuge";

/** Einen Rückruf abhaken, wenn er erledigt ist. */
export async function notizErledigt(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Nicht erlaubt.");
  await notizErledigen(String(f.get("id") ?? "").slice(0, 40), b.name);
  revalidatePath("/telefon");
  redirect(`/telefon?meldung=${encodeURIComponent("Abgehakt.")}`);
}
