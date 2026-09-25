"use server";

import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { geschenkEinloesen, geschenkZurueck } from "@/lib/abbrecher/geschenk";

/** Das Foyer hakt ab, sobald es ausgegeben ist. */
export async function ausgegeben(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Nicht angemeldet.");
  await geschenkEinloesen(String(f.get("id") ?? ""), b.name);
  revalidatePath("/geschenke");
}

/** Vertippt: wieder öffnen. */
export async function dochNicht(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) throw new Error("Nicht angemeldet.");
  await geschenkZurueck(String(f.get("id") ?? ""));
  revalidatePath("/geschenke");
}
