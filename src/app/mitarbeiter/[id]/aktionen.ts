"use server";

/**
 * Was sich von der Personalakte aus auslösen lässt.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { lohnbueroPaket } from "@/lib/personal/lohnbuero-paket";

/**
 * Personalbogen und Arbeitsvertrag jetzt ans Lohnbüro schicken.
 *
 * Normalerweise geht das Paket von selbst hinaus, sobald beides vorliegt
 * (Florian, 15.10.2026). Dieser Knopf ist für die Fälle davor: Verträge,
 * die schon unterschrieben waren, als es die Automatik noch nicht gab,
 * und für den Fall, dass eine Mail einmal hängenbleibt.
 */
export async function paketSchicken(benutzerId: string): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!darfVertraege(ich)) redirect("/");

  let meldung: string;
  try {
    const stand = await lohnbueroPaket(benutzerId);
    meldung = stand.verschickt
      ? `Personalbogen und Arbeitsvertrag sind an ${stand.an?.join(" und ")} hinausgegangen.`
      : `Es ging nichts hinaus: ${stand.grund}`;
  } catch (e) {
    meldung = `Die Mail ging nicht hinaus: ${e instanceof Error ? e.message : "unbekannter Fehler"}`;
  }

  revalidatePath(`/mitarbeiter/${benutzerId}`);
  redirect(`/mitarbeiter/${benutzerId}?meldung=${encodeURIComponent(meldung)}`);
}
