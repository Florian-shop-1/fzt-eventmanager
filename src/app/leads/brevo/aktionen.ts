"use server";

/**
 * Anfragen als Kontakte nach Brevo übertragen.
 *
 * Zwei Schritte mit Absicht: erst der Probelauf, der nur rechnet, dann
 * das Übertragen. Was einmal in einer Brevo-Liste steht, bekommt dort
 * Mails, sobald jemand eine Kampagne startet. Das soll niemand
 * versehentlich auslösen (Florian, 29.09.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { holeLeads, istStoerung } from "@/lib/shop/leads";
import { leadsUebertragen } from "@/lib/marketing/brevo-kontakte";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) {
    throw new Error("Das dürfen nur Büro und Geschäftsführung.");
  }
  return b;
}

function zurueck(meldung: string, listeId: string): never {
  revalidatePath("/leads/brevo");
  redirect(`/leads/brevo?liste=${encodeURIComponent(listeId)}&meldung=${encodeURIComponent(meldung)}`);
}

/**
 * Welche Anfragen übertragen werden.
 *
 * Störungsmeldungen nie: Wer einen kaputten Saalplan meldet, hat sich
 * nicht für Werbung gemeldet. Sonst entscheidet die Auswahl.
 */
async function auswahl(nur: string) {
  const alle = (await holeLeads()).filter((l) => !istStoerung(l));
  if (nur === "gewonnen") return alle.filter((l) => /gewonnen/i.test(l.status));
  if (nur === "offen") return alle.filter((l) => /eingegangen|kontakt|erreichbar|angebot/i.test(l.status));
  return alle;
}

export async function probelauf(f: FormData): Promise<void> {
  await zugang();
  const listeId = text(f, "liste");
  const leads = await auswahl(text(f, "nur"));

  const e = await leadsUebertragen({ leads, listeId: Number(listeId) || 0, trocken: true });
  zurueck(
    `Probelauf: ${e.gesendet} Kontakte würden übertragen. ` +
      `${e.ohneMail} ohne brauchbare Mailadresse, ${e.doppelt} doppelte Adressen werden ausgelassen. ` +
      "Es wurde nichts gesendet.",
    listeId,
  );
}

export async function uebertragen(f: FormData): Promise<void> {
  await zugang();
  const listeId = text(f, "liste");
  if (!Number(listeId)) zurueck("Bitte zuerst eine Liste auswählen.", listeId);

  const leads = await auswahl(text(f, "nur"));

  try {
    const e = await leadsUebertragen({ leads, listeId: Number(listeId), trocken: false });
    const teile = [
      `${e.gesendet} Kontakte übertragen`,
      e.ohneMail > 0 ? `${e.ohneMail} ohne Mailadresse ausgelassen` : "",
      e.doppelt > 0 ? `${e.doppelt} doppelte Adressen ausgelassen` : "",
      e.fehler.length > 0 ? `Fehler: ${e.fehler.join(" | ")}` : "",
    ].filter(Boolean);
    zurueck(teile.join(", ") + ".", listeId);
  } catch (fehler) {
    if (fehler && typeof fehler === "object" && "digest" in fehler) throw fehler;
    zurueck(fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.", listeId);
  }
}
