/**
 * Eine Visitenkarte nach Brevo tragen, samt Magic News.
 *
 * "du legst alle daten in brevo UND trägst diesen kontakt bei den magic
 * news ein. der grund ist, dass sie die magic-news wollen und mir ihre
 * karte gegeben haben. eine mündliche zustimmung wurde also erteilt.
 * abmelden können sie sich jederzeit" (Florian, 25.10.2026).
 *
 * Die Liste ist dieselbe wie überall sonst im Haus: Magic News, Liste 7.
 * Wer sich abmeldet, fliegt über denselben Weg wieder heraus wie jeder
 * andere auch (siehe abbrecher/magic-news.ts und werbewiderspruch).
 *
 * Welche Felder Brevo kennt, wissen wir hier nicht. Deshalb der zweite
 * Anlauf: Lehnt Brevo ein unbekanntes Feld ab, gehen wir auf die Felder
 * zurück, die das Haus seit jeher benutzt. Lieber ein Kontakt ohne Firma
 * als gar kein Kontakt.
 */

import { LISTE_MAGIC_NEWS } from "@/lib/abbrecher/magic-news";
import type { Visitenkarte } from "./db";

const BREVO = "https://api.brevo.com/v3";

export function brevoBereit(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

const gueltig = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

async function senden(koerper: Record<string, unknown>): Promise<{ ok: boolean; status: number; text: string }> {
  const key = process.env.BREVO_API_KEY?.trim() ?? "";
  const antwort = await fetch(`${BREVO}/contacts`, {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(koerper),
    signal: AbortSignal.timeout(15000),
  });
  // 201 neu angelegt, 204 vorhandener Kontakt ergaenzt.
  const text = antwort.status === 201 || antwort.status === 204 ? "" : await antwort.text().catch(() => "");
  return { ok: antwort.status === 201 || antwort.status === 204, status: antwort.status, text };
}

/**
 * Legt den Kontakt an und setzt ihn auf die Magic News.
 *
 * Gibt zurück, was Brevo gesagt hat. Ein Fehler wird nicht verschluckt:
 * Auf der Karte steht ein Mensch, der auf unsere Post wartet, und wenn
 * das schiefgeht, soll es jemand sehen.
 */
export async function karteNachBrevo(k: Visitenkarte): Promise<{ ok: boolean; meldung: string }> {
  if (!brevoBereit()) return { ok: false, meldung: "Für Brevo fehlt der Schlüssel (BREVO_API_KEY)." };

  const email = k.email.trim().toLowerCase();
  if (!gueltig(email)) return { ok: false, meldung: "Das ist keine brauchbare E-Mail-Adresse." };

  /*
    OPT_IN heißt hier: Er hat uns seine Karte gegeben und die Magic News
    gewollt. Der Beleg dafür steht im Eventmanager an der Karte, mit Datum
    und mit dem Namen dessen, der sie gescannt hat.
  */
  const voll: Record<string, string | boolean> = { OPT_IN: true };
  if (k.vorname) voll.VORNAME = k.vorname;
  if (k.nachname) voll.NACHNAME = k.nachname;
  if (k.firma) voll.FIRMA = k.firma;
  if (k.position) voll.POSITION = k.position;
  if (k.telefon) voll.TELEFON = k.telefon;
  if (k.webseite) voll.WEBSEITE = k.webseite;

  const basis = { email, listIds: [LISTE_MAGIC_NEWS], updateEnabled: true };

  const erst = await senden({ ...basis, attributes: voll });
  if (erst.ok) return { ok: true, meldung: "In Brevo und in den Magic News." };

  // Zweiter Anlauf nur mit den Feldern, die das Haus sicher hat.
  const schlank: Record<string, string | boolean> = { OPT_IN: true };
  if (k.vorname) schlank.VORNAME = k.vorname;
  if (k.nachname) schlank.NACHNAME = k.nachname;

  const zweit = await senden({ ...basis, attributes: schlank });
  if (zweit.ok) {
    return {
      ok: true,
      meldung: "In Brevo und in den Magic News, aber ohne Firma und Telefon: Diese Felder kennt Brevo nicht.",
    };
  }

  const grund = (erst.text || zweit.text || "").slice(0, 200);
  return { ok: false, meldung: `Brevo hat abgelehnt (${zweit.status}). ${grund}`.trim() };
}
