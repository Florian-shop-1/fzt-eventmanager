"use server";

/**
 * Hasenpost schreiben und zuruecknehmen.
 *
 * Nur Florian. Eine Nachricht, die nach dem Hasen aussieht und nicht
 * nach dem Absender, ist ein Werkzeug, das in einer Hand bleiben soll
 * (Florian, 04.10.2026: "diese funktion nur für Florian, mich").
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { postSchicken, postWeg } from "@/lib/personal/hasenpost";

const text = (f: FormData, k: string, max = 400) => String(f.get(k) ?? "").trim().slice(0, max);

async function nurFlorian() {
  const b = await angemeldeterBenutzer();
  if (!b || b.rolle !== "chef") throw new Error("Hasenpost schreibt nur Florian.");
  return b;
}

function zurueck(meldung: string): never {
  revalidatePath("/hasenpost");
  redirect(`/hasenpost?meldung=${encodeURIComponent(meldung)}`);
}

export async function postAbschicken(f: FormData): Promise<void> {
  const b = await nurFlorian();
  const benutzerId = text(f, "benutzer", 40);
  const nachricht = text(f, "text", 400);

  if (!/^[0-9a-f-]{36}$/.test(benutzerId)) zurueck("Bitte jemanden auswählen.");
  if (nachricht.length < 3) zurueck("Da fehlt noch die Nachricht.");

  await postSchicken({ benutzerId, text: nachricht, von: b.name });
  zurueck("Der Hase richtet es aus.");
}

export async function postZurueckziehen(f: FormData): Promise<void> {
  await nurFlorian();
  await postWeg(text(f, "id", 40));
  zurueck("Zurückgezogen, der Hase sagt nichts mehr dazu.");
}
