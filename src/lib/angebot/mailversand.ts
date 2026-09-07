"use server";

/**
 * Das Angebot per Mail an den Kunden.
 *
 * Bisher gab es zwei Umwege: den Link kopieren und selbst eine Mail
 * schreiben, oder Outlook mit vorbereitetem Text öffnen. Beides
 * funktioniert, aber beides bricht den Ablauf: Man verlässt das
 * Programm, und ob die Mail wirklich rausging, weiss es hinterher nicht.
 *
 * Jetzt geht sie direkt von hier aus, über das Postfach
 * tickets@florianzimmer.com. Das Angebot wird im selben Zug als
 * versendet vermerkt, ohne dass jemand daran denken muss.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { holeAngebot } from "./lesen";
import { angebotVersendet } from "./speichern";
import { mailVerschicken } from "@/lib/mail/versand";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";

/**
 * Verschickt das Angebot und vermerkt es als versendet.
 *
 * Der Fehler wird abgefangen und als Meldung weitergereicht statt
 * geworfen: Eine geworfene Ausnahme endet beim Benutzer als
 * nichtssagende Fehlerseite, und wer wissen will, warum ein Angebot
 * nicht rausging, hat davon nichts.
 */
export async function angebotPerMail(
  angebotId: string,
  vorgangId: string,
  formData: FormData,
): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Inhaber dürfen Angebote verschicken.");
  }

  const angebot = await holeAngebot(angebotId);
  if (!angebot) throw new Error("Das Angebot wurde nicht gefunden.");

  const an = String(formData.get("an") ?? "").trim() || angebot.kunde.email;
  const betreff = String(formData.get("betreff") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();

  let ziel = `/vorgaenge/${vorgangId}?mail=weg&an=${encodeURIComponent(an)}`;

  try {
    if (!an) throw new Error("Für diesen Kunden ist keine Mailadresse hinterlegt.");
    if (!betreff) throw new Error("Der Betreff fehlt.");
    if (!text) throw new Error("Der Text fehlt.");

    await mailVerschicken({ an, betreff, text });

    // Erst nach dem erfolgreichen Versand vermerken. Andersherum stünde
    // "versendet" auch dann da, wenn die Mail nie rausging.
    await angebotVersendet(angebotId, vorgangId);
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    ziel = `/vorgaenge/${vorgangId}?mail=fehler&meldung=${encodeURIComponent(meldung.slice(0, 400))}`;
  }

  revalidatePath(`/vorgaenge/${vorgangId}`);
  redirect(ziel);
}
