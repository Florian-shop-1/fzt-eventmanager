import { bewirtungenDesJahres, fotoLesen, type Bewirtung } from "./db";
import type { Gesellschaft } from "./gesellschaft";

/** "2026-09" in Jahr und Monat, oder null. */
export function monatLesen(m: string | undefined): { jahr: number; monat: number } | null {
  const t = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  if (!t) return null;
  const monat = Number(t[2]);
  return monat >= 1 && monat <= 12 ? { jahr: Number(t[1]), monat } : null;
}

/** Festgeschriebene und stornierte Belege eines Monats, nach Nummer. */
export async function belegeDesMonats(jahr: number, monat: number): Promise<Bewirtung[]> {
  const mm = String(monat).padStart(2, "0");
  return (await bewirtungenDesJahres(jahr))
    .filter((b) => b.status !== "entwurf" && b.datum?.startsWith(`${jahr}-${mm}`))
    .sort((a, b) => (a.nummer ?? "").localeCompare(b.nummer ?? ""));
}

/** Die Belege eines Monats, die zu einer einzigen Firma gehören. */
export async function belegeDerFirma(
  jahr: number,
  monat: number,
  g: Gesellschaft,
): Promise<Bewirtung[]> {
  return (await belegeDesMonats(jahr, monat)).filter((b) => b.gesellschaft === g);
}

/**
 * Die Fotos zu einer Belegliste.
 *
 * Nacheinander, nicht alle auf einmal: Ein Monat kann viele Belege
 * haben, und jedes Foto ist ein paar hundert Kilobyte. Alles gleichzeitig
 * zu laden brachte den Speicher der Serverfunktion in Bedrängnis.
 */
export async function fotosZu(
  belege: Bewirtung[],
): Promise<Map<string, { bytes: Buffer; typ: string }>> {
  const fotos = new Map<string, { bytes: Buffer; typ: string }>();
  for (const b of belege) {
    const f = await fotoLesen(b.id).catch(() => null);
    if (f) fotos.set(b.id, f);
  }
  return fotos;
}
