"use server";

/**
 * Was sich von der Mitarbeiterliste aus auslösen lässt.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfVertraege } from "@/lib/auth/sitzung";
import { anwaltspostHolen } from "@/lib/personal/anwaltspost";

/**
 * Die Post der Arbeitsrechtlerin holen, auf Knopfdruck.
 *
 * Nachts passiert das von selbst. Der Knopf ist für den Fall, dass
 * gerade etwas angekommen ist und nicht bis morgen warten soll
 * (Florian, 15.10.2026).
 */
export async function anwaltspostJetztHolen(): Promise<void> {
  if (!darfVertraege(await angemeldeterBenutzer())) redirect("/");

  let meldung: string;
  try {
    const lauf = await anwaltspostHolen();
    meldung =
      lauf.gesehen === 0
        ? "Keine neue Post von der Kanzlei."
        : `${lauf.gesehen} neue Mails: ${lauf.abgelegt} abgelegt`
          + (lauf.ohneZuordnung > 0 ? `, ${lauf.ohneZuordnung} ohne Zuordnung` : "")
          + (lauf.fehler > 0 ? `, ${lauf.fehler} mit Fehler` : "")
          + ".";
    if (lauf.meldungen.length > 0) meldung += ` ${lauf.meldungen.join(" ")}`;
  } catch (e) {
    meldung = `Das ging schief: ${e instanceof Error ? e.message : "unbekannter Fehler"}`;
  }

  revalidatePath("/mitarbeiter");
  redirect(`/mitarbeiter?meldung=${encodeURIComponent(meldung)}`);
}
