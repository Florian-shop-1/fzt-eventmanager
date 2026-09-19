import { bewirtungenDesJahres, type Bewirtung } from "./db";

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
