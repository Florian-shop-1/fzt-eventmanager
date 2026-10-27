import type { Plan } from "@/lib/seating/types";

/**
 * Wo welche Gruppe sitzt, als einfache Zuordnung Gruppenkennung zu Platz.
 *
 * Gebraucht dort, wo etwas am Gast hängt und nicht am Tisch: der rote Allergiekasten auf Funktionsheet und
 * Küchenblatt nennt so gleich den Tisch, an dem die Angabe gilt (Florian, 27.10.2026).
 *
 * Zusammengelegte Bestellungen stehen doppelt drin: einmal unter der gemeinsamen Gruppe, wie der Plan sie kennt, und
 * einmal unter jeder einzelnen Bestellung, wie die Allergieliste sie kennt. Ohne das stünde bei größeren Runden, die
 * man zusammengelegt hat, kein Tisch.
 */
export function sitzplaetzeAusPlan(
  plan: Plan | null,
  zusammenlegungen: Array<{ id: string; gruppenIds: string[] }> = [],
): Record<string, string> {
  const plaetze: Record<string, string> = {};
  if (!plan) return plaetze;

  const merken = (gruppeId: string, platz: string) => {
    plaetze[gruppeId] = platz;
    const z = zusammenlegungen.find((x) => `zusammen-${x.id}` === gruppeId);
    if (z) for (const teil of z.gruppenIds) plaetze[teil] = platz;
  };

  for (const z of plan.logen) merken(z.gruppeId, z.logenNummern.map((n) => `Loge ${n}`).join(" + "));
  for (const g of plan.galerie) merken(g.gruppeId, g.tischBeschreibung);
  return plaetze;
}
