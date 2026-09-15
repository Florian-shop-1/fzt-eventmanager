/**
 * Wohin nach dem Anmelden.
 *
 * Wer aus einer Mail auf einen Link wie /whatsapp?mit=... tippt und gerade
 * nicht angemeldet ist, landete früher nach dem Anmelden auf der Übersicht
 * und musste den Posteingang selbst wieder suchen. Jetzt reist das Ziel über
 * die Anmeldung mit.
 *
 * Nur Pfade innerhalb des Eventmanagers. Ein Ziel wie "//fremde-seite.de"
 * oder "https://..." würde die Anmeldeseite zum Sprungbrett für Betrug
 * machen und wird verworfen.
 */
export function sicheresZiel(wert: unknown): string {
  const ziel = typeof wert === "string" ? wert.trim() : "";
  if (!ziel.startsWith("/") || ziel.startsWith("//") || ziel.startsWith("/\\")) return "/";
  if (ziel.startsWith("/anmelden") || ziel.length > 500) return "/";
  return ziel;
}

/** Die Anmeldeadresse, die das Ziel mitnimmt. */
export function anmeldenMitZiel(pfadMitSuche: string): string {
  const ziel = sicheresZiel(pfadMitSuche);
  return ziel === "/" ? "/anmelden" : `/anmelden?weiter=${encodeURIComponent(ziel)}`;
}
