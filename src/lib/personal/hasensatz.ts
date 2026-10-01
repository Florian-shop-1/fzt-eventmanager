/**
 * Was der Hase sagt, wenn ein Arbeitsvertrag bereitliegt.
 *
 * Zwei Standardsätze, je nachdem, ob jemand mehr verdient als vorher.
 * Florian kann beim Anlegen einen eigenen schreiben; dann gilt seiner
 * (Florian, 01.10.2026: "Botschaft vom Hasi individualisieren").
 *
 * Der Hase ist im Eventmanager die gute Nachricht in Person. Was er
 * sagt, soll deshalb nach Freude klingen und nicht nach Verwaltung.
 */

export const HASE_VERTRAG = "Yeah, dein Arbeitsvertrag liegt zur Unterschrift bereit!";

export const HASE_ERHOEHUNG =
  "Du hast eine Gehaltserhöhung bekommen! Dein neuer Vertrag liegt zur Unterschrift bereit.";

export function hasensatz(o: { erhoehung: boolean; eigener?: string | null }): string {
  const eigen = (o.eigener ?? "").trim();
  if (eigen) return eigen;
  return o.erhoehung ? HASE_ERHOEHUNG : HASE_VERTRAG;
}
