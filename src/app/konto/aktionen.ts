"use server";

/**
 * Der eigene Geburtstag: Tag und Monat, mehr nicht.
 *
 * Gespeichert wird am Benutzer selbst, damit auch mitfeiern kann, wer
 * keine Geheimhaltungsvereinbarung unterschrieben hat (Florian, 23.09.2026).
 */

import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { geburtstagSpeichern } from "@/lib/db/geburtstag";

export interface GeburtstagStand {
  meldung?: string;
  fehler?: string;
}

export async function geburtstagSetzen(
  _stand: GeburtstagStand,
  formular: FormData,
): Promise<GeburtstagStand> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return { fehler: "Bitte neu anmelden." };

  const tag = String(formular.get("tag") ?? "");
  const monat = String(formular.get("monat") ?? "");
  if (!tag || !monat) return { fehler: "Bitte Tag und Monat auswählen." };

  // Den 31. Februar gibt es nicht, und der 31. April auch nicht.
  const tageImMonat = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(tag) > (tageImMonat[Number(monat) - 1] ?? 31)) {
    return { fehler: "Diesen Tag gibt es in dem Monat nicht." };
  }

  try {
    await geburtstagSpeichern(benutzer.id, tag, monat);
  } catch {
    return { fehler: "Das hat nicht geklappt. Bitte nochmal versuchen." };
  }
  revalidatePath("/konto");
  return { meldung: "Gespeichert. Wir denken dran." };
}
