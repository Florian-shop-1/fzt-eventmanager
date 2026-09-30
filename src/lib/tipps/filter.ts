/**
 * Der Tipp-Typ und die Suche, ohne Datenbank-Abhängigkeit: Diese Datei
 * wird auch von der Oberfläche im Browser gebraucht (siehe
 * components/TippsListe.tsx), db.ts dagegen nur auf dem Server.
 */

export interface Tipp {
  id: string;
  titel: string;
  beschreibung: string;
  schlagworte: string;
  videoUrl: string;
  videoTyp: string;
  erstelltVon: string;
  erstelltAm: string;
  /** video, datei oder notiz. */
  art?: "video" | "datei" | "notiz";
  /** Text einer Notiz, oder eine Ergänzung zu Video und Datei. */
  notiz?: string;
  /** Der Dateiname, damit man sieht, was einen erwartet. */
  dateiName?: string;
  /** Gehört zu einer mehrteiligen Anleitung, sonst null. */
  reiheId?: string | null;
  /** Die Stelle in der Reihe, beginnend bei 1. */
  schritt?: number;
}

/**
 * Suche im Browser statt in SQL: Die Sammlung bleibt klein, und so findet
 * "Akku laden" auch ein Video, in dessen Titel "Akku" gar nicht vorkommt,
 * solange es in den Schlagworten steht. Jedes Wort der Suche muss
 * irgendwo in Titel, Beschreibung oder Schlagworten vorkommen.
 */
export function tippsFiltern(tipps: Tipp[], suche: string): Tipp[] {
  const woerter = suche.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return tipps;
  return tipps.filter((t) => {
    const text = `${t.titel} ${t.beschreibung} ${t.schlagworte} ${t.notiz ?? ""}`.toLowerCase();
    return woerter.every((w) => text.includes(w));
  });
}
