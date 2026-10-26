"use server";

/**
 * Eine Adresse aus den Magic News nehmen, oder sie ausdrücklich behalten.
 * Beides wird mitgeschrieben, damit dieselbe Adresse nicht jede Woche
 * wieder oben auf der Liste steht.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { ausVerteiler, entscheidungMerken } from "@/lib/verteiler/aufraeumen";

const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Den Verteiler ändert nur das Büro.");
  return b;
}

function zurueck(meldung: string): never {
  revalidatePath("/verteiler");
  redirect(`/verteiler?meldung=${encodeURIComponent(meldung)}`);
}

export async function adresseEntfernen(f: FormData): Promise<void> {
  const b = await zugang();
  const email = text(f, "email", 160);
  try {
    await ausVerteiler(email, text(f, "grund"), b.name);
  } catch (fehler) {
    if (fehler && typeof fehler === "object" && "digest" in fehler) throw fehler;
    zurueck(fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.");
  }
  zurueck(`${email} bekommt keine Magic News mehr.`);
}

export async function adresseBehalten(f: FormData): Promise<void> {
  const b = await zugang();
  const email = text(f, "email", 160);
  await entscheidungMerken(email, "behalten", text(f, "grund"), b.name);
  zurueck(`${email} bleibt im Verteiler und wird nicht mehr vorgeschlagen.`);
}
