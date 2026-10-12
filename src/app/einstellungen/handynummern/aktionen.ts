"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import { einwilligungSetzen, handySetzen } from "@/lib/personal/handy";

const ziel = (meldung: string, fehler = false) =>
  `/einstellungen/handynummern?${fehler ? "fehler" : "meldung"}=${encodeURIComponent(meldung.slice(0, 300))}`;

/** Eine Nummer nachtragen oder ändern. Nur fürs Büro. */
export async function handySpeichern(formData: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!ich || !darfBenutzerVerwalten(ich.rolle)) redirect("/");

  const id = String(formData.get("id") ?? "");
  const roh = String(formData.get("handy") ?? "");
  const name = String(formData.get("name") ?? "");

  try {
    const nummer = await handySetzen(id, roh);
    revalidatePath("/einstellungen/handynummern");
    redirect(ziel(nummer ? `Nummer von ${name} gespeichert.` : `Nummer von ${name} gelöscht.`));
  } catch (f) {
    // redirect() wirft selbst, das darf hier nicht als Fehler ankommen.
    if (f instanceof Error && f.message.includes("NEXT_REDIRECT")) throw f;
    redirect(ziel(f instanceof Error ? f.message : "Das hat nicht geklappt.", true));
  }
}

/**
 * Eine Einwilligung zurücknehmen.
 *
 * Geben kann sie nur die Person selbst, das Büro kann sie nur
 * widerrufen: Ein Ja, das jemand anderes anklickt, ist keines.
 */
export async function einwilligungZurueck(formData: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!ich || !darfBenutzerVerwalten(ich.rolle)) redirect("/");
  await einwilligungSetzen(String(formData.get("id") ?? ""), false);
  revalidatePath("/einstellungen/handynummern");
  redirect(ziel("Einwilligung zurückgenommen. Es gehen keine WhatsApp-Nachrichten mehr hinaus."));
}
