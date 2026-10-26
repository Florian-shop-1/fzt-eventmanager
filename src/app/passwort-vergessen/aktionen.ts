"use server";

/**
 * Den Link anfordern.
 *
 * Es gibt nur eine Antwort, und die ist immer dieselbe. Auch bei einer
 * unbekannten Adresse, auch bei einem gesperrten Zugang: Sonst verrät die
 * Seite, wer bei uns arbeitet.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { zuruecksetzenAnfordern } from "@/lib/auth/vergessen";

export async function linkAnfordern(f: FormData): Promise<void> {
  const eingabe = String(f.get("email") ?? "").trim().slice(0, 200);
  const kopf = await headers();
  const woher = (kopf.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";

  try {
    await zuruecksetzenAnfordern(eingabe, woher);
  } catch (fehler) {
    if (fehler && typeof fehler === "object" && "digest" in fehler) throw fehler;
    // Auch ein Fehler beim Verschicken bleibt hier: Nach außen sieht jede
    // Anforderung gleich aus. Im Protokoll steht, was los war.
    console.error("[passwort] Anforderung fehlgeschlagen:", fehler);
  }

  redirect("/passwort-vergessen?gesendet=ja");
}
