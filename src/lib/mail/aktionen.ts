"use server";

/**
 * Die Probe aufs Exempel für den Mailversand.
 *
 * Bevor das erste Angebot an einen Kunden geht, will man wissen, ob der
 * Weg überhaupt steht. Deshalb eine Testmail an die eigene Adresse: Sie
 * kostet nichts, erreicht niemanden von aussen und beantwortet die Frage
 * abschliessend.
 */

import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import { mailVerschicken } from "./versand";

export async function testmailSchicken(): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfBenutzerVerwalten(benutzer.rolle)) {
    throw new Error("Nur der Inhaber darf den Mailversand prüfen.");
  }

  await mailVerschicken({
    an: benutzer.email,
    betreff: "Testmail aus dem FZT Eventmanager",
    text: [
      `Hallo ${benutzer.name},`,
      "",
      "diese Mail kommt aus dem Eventmanager. Wenn sie angekommen ist,",
      "steht der Versand: Angebote und Anschreiben können ab jetzt direkt",
      "aus dem Programm heraus verschickt werden.",
      "",
      "Sie sollte ausserdem im Postfach unter Gesendete Elemente stehen.",
      "Falls nicht, sag Bescheid, dann sehe ich mir das an.",
      "",
      "Florian Zimmer Theater GmbH, Eventmanager",
    ].join("\n"),
  });

  revalidatePath("/einstellungen/mail");
}
