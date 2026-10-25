/**
 * Abbrecher in die Magic News (Florian, 25.10.2026).
 *
 * "trag sie ein in die magic-news, wenn sie nicht widersprochen haben bei der mail wo wir sie versuchen abzuholen.
 * melden sie sich ab, dann wieder aus - easy."
 *
 * Wer eine Rueckholmail bekommen hat und sich nicht ueber den Abmeldeweg darin abgemeldet hat, steht danach in der
 * Brevo-Liste Magic News (Liste 7, dieselbe wie bei den Kaeufern, siehe kaeufer-melden.ts im Backend). Wer sich abmeldet,
 * wird dort wieder entfernt (werbewiderspruch.ts). Adressen der Agentur bleiben aussen vor, wie beim Backend.
 *
 * Nichts davon darf den Lauf aufhalten: Jeder Fehler wird gezaehlt und geschluckt.
 */

import type { Abbrecher } from "./db";

const BREVO = "https://api.brevo.com/v3";
export const LISTE_MAGIC_NEWS = 7;

const NICHT_MELDEN = (process.env.KAEUFER_NICHT_MELDEN ?? "profitables.marketing,rethinklabs.de")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

function schluessel(): string | null {
  return process.env.BREVO_API_KEY?.trim() || null;
}

const gueltig = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !NICHT_MELDEN.some((x) => email.toLowerCase().includes(x));

/** Legt den Kontakt an oder ergaenzt ihn und setzt ihn auf die Magic News. Gibt zurueck, ob Brevo es angenommen hat. */
export async function inMagicNews(email: string, name: string): Promise<boolean> {
  const key = schluessel();
  const adresse = email.trim().toLowerCase();
  if (!key || !gueltig(adresse)) return false;

  const teile = name.trim().split(/\s+/).filter(Boolean);
  const attribute: Record<string, string | boolean> = { OPT_IN: true };
  if (teile[0]) attribute.VORNAME = teile[0];
  if (teile.length > 1) attribute.NACHNAME = teile.slice(1).join(" ");

  try {
    const antwort = await fetch(`${BREVO}/contacts`, {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: adresse, attributes: attribute, listIds: [LISTE_MAGIC_NEWS], updateEnabled: true }),
      signal: AbortSignal.timeout(10000),
    });
    // 201 neu angelegt, 204 vorhandener Kontakt ergaenzt.
    return antwort.status === 201 || antwort.status === 204;
  } catch {
    return false;
  }
}

/** Nimmt die Adresse von der Magic-News-Liste, wenn sie sich abgemeldet hat. Fehler sind hier nicht schlimm. */
export async function ausMagicNews(email: string): Promise<void> {
  const key = schluessel();
  const adresse = email.trim().toLowerCase();
  if (!key || !adresse.includes("@")) return;
  try {
    await fetch(`${BREVO}/contacts/${encodeURIComponent(adresse)}?identifierType=email_id`, {
      method: "PUT",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ unlinkListIds: [LISTE_MAGIC_NEWS] }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Der Widerspruch im Eventmanager gilt trotzdem: Von hier aus bekommt die Adresse nichts mehr.
  }
}

/**
 * Alle, die eine Rueckholmail bekommen haben und nicht widersprochen haben, auf die Magic News setzen.
 * Wiederholbar: Wer schon drin ist, bleibt drin. Hoechstens `grenze` Aufrufe je Lauf.
 */
export async function abbrecherInMagicNews(
  alle: Abbrecher[],
  abgemeldet: Set<string>,
  grenze = 300,
): Promise<{ eingetragen: number; abgelehnt: number }> {
  const bereits = new Set<string>();
  let eingetragen = 0;
  let abgelehnt = 0;
  for (const a of alle) {
    const adresse = a.email.trim().toLowerCase();
    if (!a.frageAm && !a.angebotAm) continue; // Es ist noch keine Mail hinausgegangen.
    if (abgemeldet.has(adresse) || bereits.has(adresse)) continue;
    bereits.add(adresse);
    if (bereits.size > grenze) break;
    if (await inMagicNews(adresse, a.name)) eingetragen++;
    else abgelehnt++;
  }
  return { eingetragen, abgelehnt };
}
