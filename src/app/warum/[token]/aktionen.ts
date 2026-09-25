"use server";

import { redirect } from "next/navigation";
import { buchungPerToken, grundMerken, grundText } from "@/lib/abbrecher/db";
import { notieren } from "@/lib/abbrecher/vertrieb";
import { abbrecherMeldung } from "@/lib/abbrecher/posteingang";

/**
 * Der Gast schreibt uns noch etwas dazu.
 *
 * Offen erreichbar, deshalb hängt hier alles am Schlüssel aus der Mail:
 * Ohne gültigen Schlüssel wird nichts gespeichert, und gespeichert wird
 * nur zu genau dieser einen Buchung.
 *
 * Die Nachricht geht drei Wege, und alle drei braucht es:
 *  - an die Buchung, damit sie beim Vorgang steht,
 *  - in den Vertriebsverlauf, damit sie beim Anruf vor Augen liegt,
 *  - in den Posteingang, damit sie überhaupt jemand sieht und antworten
 *    kann. Von dort geht auch die Meldemail hinaus (Florian, 23.09.2026).
 */
export async function textSchicken(f: FormData): Promise<void> {
  const token = String(f.get("token") ?? "");
  const grund = String(f.get("grund") ?? "");
  const text = String(f.get("text") ?? "").trim().slice(0, 500);

  if (token && text) {
    const a = await buchungPerToken(token).catch(() => null);
    if (a) {
      const wahl = a.abbruchGrund ?? (grund || "anders");
      await grundMerken(token, wahl, text).catch(() => false);
      await notieren(a.id, "Gast selbst", text).catch(() => undefined);

      try {
        await abbrecherMeldung({ buchung: a, grund: wahl, text, dringend: wahl === "technik" });
      } catch {
        // Der Posteingang darf die Antwort des Gastes nicht verhindern:
        // Gespeichert ist sie oben schon.
      }
    }
  }

  redirect(`/warum/${encodeURIComponent(token)}?danke=ja`);
}
