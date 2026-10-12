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
 * Eine Person von WhatsApp ausnehmen oder sie wieder aufnehmen.
 *
 * Die Grundlage steht im Arbeitsvertrag. Die Ausnahme ist für alte
 * Verträge und für den Fall, dass jemand mit gutem Grund widerspricht.
 */
export async function whatsappUmschalten(formData: FormData): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!ich || !darfBenutzerVerwalten(ich.rolle)) redirect("/");
  const an = String(formData.get("an") ?? "") === "ja";
  await einwilligungSetzen(String(formData.get("id") ?? ""), an);
  revalidatePath("/einstellungen/handynummern");
  redirect(
    ziel(an ? "Bekommt wieder Nachrichten per WhatsApp." : "Ausgenommen. Es bleibt bei der Mail."),
  );
}
