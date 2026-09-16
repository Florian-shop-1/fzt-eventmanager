/**
 * Kontakte aus dem Scanner in Brevo eintragen.
 *
 * Nutzt denselben Schlüssel wie der Mailversand (BREVO_API_KEY). Die Listen
 * werden auf der Scanner-Seite aus den vorhandenen Brevo-Listen gewählt.
 *
 * Die Namen der Felder heißen in Brevo je nach Konto VORNAME/NACHNAME oder
 * FIRSTNAME/LASTNAME. Deshalb wird nachgesehen, welche es gibt. Die
 * Telefonnummer landet nur in einem eigenen Feld (TELEFON o. ä.), nie im
 * Brevo-Feld SMS: Das würde sie für SMS-Werbung vormerken, und dafür gibt
 * es auf der Karte keine Einwilligung.
 *
 * Wer sich bei Brevo abgemeldet hat, bleibt abgemeldet: Das Eintragen ändert
 * den Abmeldestatus nicht.
 */

const BREVO = "https://api.brevo.com/v3";

function kopf(): Record<string, string> {
  const key = process.env.BREVO_API_KEY?.trim();
  if (!key) throw new Error("BREVO_API_KEY fehlt bei Vercel.");
  return { "api-key": key, "Content-Type": "application/json", accept: "application/json" };
}

export interface BrevoListe {
  id: number;
  name: string;
  anzahl: number;
}

export async function brevoListen(): Promise<BrevoListe[]> {
  const listen: BrevoListe[] = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const r = await fetch(`${BREVO}/contacts/lists?limit=50&offset=${offset}`, {
      headers: kopf(), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Brevo-Listen nicht lesbar (${r.status}).`);
    const d = (await r.json()) as { lists?: Array<{ id: number; name: string; uniqueSubscribers?: number; totalSubscribers?: number }> };
    const seite = d.lists ?? [];
    listen.push(...seite.map((l) => ({ id: l.id, name: l.name, anzahl: l.uniqueSubscribers ?? l.totalSubscribers ?? 0 })));
    if (seite.length < 50) break;
  }
  return listen.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

let felder: { vorname: string | null; nachname: string | null; telefon: string | null } | null = null;

async function feldnamen() {
  if (felder) return felder;
  const r = await fetch(`${BREVO}/contacts/attributes`, { headers: kopf(), cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Brevo-Felder nicht lesbar (${r.status}).`);
  const d = (await r.json()) as { attributes?: Array<{ name: string; category: string }> };
  const namen = new Set((d.attributes ?? []).filter((a) => a.category === "normal").map((a) => a.name.toUpperCase()));
  const erstes = (...k: string[]) => k.find((n) => namen.has(n)) ?? null;
  felder = {
    vorname: erstes("VORNAME", "FIRSTNAME", "PRENOM"),
    nachname: erstes("NACHNAME", "LASTNAME", "NAME", "NOM"),
    telefon: erstes("TELEFON", "TELEFONNUMMER", "TELEFONNR", "PHONE", "MOBIL"),
  };
  return felder;
}

export interface Kontakt {
  email: string;
  vorname: string;
  nachname: string;
  telefon: string;
}

/** Trägt den Kontakt ein oder ergänzt ihn um die Listen. Wirft mit verständlicher Meldung. */
export async function kontaktEintragen(k: Kontakt, listen: number[]): Promise<void> {
  const f = await feldnamen();
  const attributes: Record<string, string> = {};
  if (f.vorname && k.vorname) attributes[f.vorname] = k.vorname;
  if (f.nachname && k.nachname) attributes[f.nachname] = k.nachname;
  if (f.telefon && k.telefon) attributes[f.telefon] = k.telefon;

  const r = await fetch(`${BREVO}/contacts`, {
    method: "POST",
    headers: kopf(),
    body: JSON.stringify({ email: k.email, attributes, listIds: listen, updateEnabled: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (r.ok) return;
  const roh = await r.text();
  let text = roh.slice(0, 200);
  try {
    text = (JSON.parse(roh) as { message?: string }).message ?? text;
  } catch {
    // bleibt Rohtext
  }
  if (r.status === 401) throw new Error("Brevo lehnt den Schlüssel ab.");
  throw new Error(`Brevo hat den Kontakt nicht angenommen (${r.status}): ${text}`);
}
