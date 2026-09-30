"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { zahlungenAmKontoPruefen } from "@/lib/wein/zahlung";

/**
 * Das Konto von Hand prüfen lassen.
 *
 * Passiert täglich von selbst. Der Knopf ist für den Moment, in dem
 * jemand gerade überwiesen hat und man nicht bis morgen warten will.
 */
export async function jetztPruefen(): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || (!darfKaufmaennisches(b.rolle) && !darfBuchhaltung(b))) {
    throw new Error("Nur Büro und Buchhaltung.");
  }

  const e = await zahlungenAmKontoPruefen();
  revalidatePath("/bestellungen/rechnungen");
  redirect(
    `/bestellungen/rechnungen?meldung=${encodeURIComponent(
      e.bezahlt > 0
        ? `${e.bezahlt} ${e.bezahlt === 1 ? "Rechnung" : "Rechnungen"} als bezahlt erkannt.`
        : `${e.geprueft} offene ${e.geprueft === 1 ? "Rechnung" : "Rechnungen"} geprüft, am Konto ist noch nichts eingegangen.`,
    )}`,
  );
}
