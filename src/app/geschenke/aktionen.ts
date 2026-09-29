"use server";

import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  darfGeschenkEintragen,
  geschenkEinloesen,
  geschenkVonHand,
  geschenkZurueck,
  type GeschenkArt,
} from "@/lib/abbrecher/geschenk";
import { redirect } from "next/navigation";

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

/** Ein Geschenk von Hand eintragen: Florian, Kevin und das Foyer. */
export async function vonHandEintragen(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!darfGeschenkEintragen(b)) throw new Error("Das duerfen nur Florian, Kevin und das Foyer.");

  const text = (k: string) => String(f.get(k) ?? "").trim();
  const art = text("art") as GeschenkArt;
  if (!["baendchen", "glas", "zauberstab"].includes(art)) throw new Error("Bitte ein Geschenk auswaehlen.");

  try {
    await geschenkVonHand({
      name: text("name"),
      email: text("email"),
      art,
      anzahl: Number(text("anzahl")) || 1,
      show: text("show"),
      datum: text("datum"),
      uhrzeit: text("uhrzeit"),
      notiz: text("notiz"),
      erfasstVon: b!.name,
    });
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.";
    redirect(`/geschenke?meldung=${encodeURIComponent(meldung)}`);
  }

  revalidatePath("/geschenke");
  redirect(`/geschenke?meldung=${encodeURIComponent(`${text("name")} ist eingetragen.`)}`);
}
