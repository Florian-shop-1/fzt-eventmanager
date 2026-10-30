/**
 * Die Reihenfolge der Positionen in einem Angebot.
 *
 * "wichtig ist, dass im angebot dann auch immer nach logischem schema
 * ist. also nicht random die sachen reinwürfeln, sondern die
 * sitzplätze stehen immer beieinander. oben immer das gewählte (das
 * nicht optionierte) und dann folgend die anderen optionen wie gehabt
 * in klammer" (Florian, 30.10.2026) und "die tickets müssen IMMER als
 * erstes kommen im Angebot" (Florian, 30.10.2026).
 *
 * Drei Regeln, in dieser Reihenfolge:
 *   1. nach Gruppe, siehe GRUPPENFOLGE im Artikelstamm. Tickets zuerst.
 *   2. innerhalb der Gruppe fest vor optional.
 *   3. sonst bleibt die Reihenfolge, in der die Zeilen entstanden sind.
 *
 * Die Wahlmöglichkeiten werden nicht einsortiert: Jede hängt direkt
 * unter der Zeile, zu der sie gehört, damit die Sitzplätze beieinander
 * bleiben.
 *
 * Angewendet wird das an zwei Stellen: beim Bauen eines Angebots und
 * beim Lesen. Letzteres, damit auch ein Angebot von letzter Woche nach
 * der heutigen Ordnung dasteht, ohne dass jemand es neu bauen muss.
 */

import { artikel, GRUPPENFOLGE } from "@/lib/domain/artikel";

interface Sortierbar {
  artikelNummer: string;
  optional?: boolean;
  istAlternativeZu?: string;
  id?: string;
}

function rang(p: Sortierbar): number {
  try {
    const stelle = GRUPPENFOLGE.indexOf(artikel(p.artikelNummer).gruppe);
    return stelle < 0 ? GRUPPENFOLGE.length : stelle;
  } catch {
    // Frei eingetippte Zeilen kennen wir nicht: Die kommen ans Ende.
    return GRUPPENFOLGE.length;
  }
}

export function nachHausordnung<T extends Sortierbar>(positionen: T[]): T[] {
  const haupt = positionen.filter((p) => !p.istAlternativeZu);
  const weitere = positionen.filter((p) => p.istAlternativeZu);

  const geordnet = haupt
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const gA = rang(a.p);
      const gB = rang(b.p);
      if (gA !== gB) return gA - gB;
      const optA = a.p.optional ? 1 : 0;
      const optB = b.p.optional ? 1 : 0;
      if (optA !== optB) return optA - optB;
      return a.i - b.i;
    })
    .map((x) => x.p);

  /*
    Jede Wahlmöglichkeit direkt hinter ihre Bezugszeile. Eine, deren
    Bezug entfernt wurde, hinge sonst in der Luft und fiele aus dem
    Angebot heraus; die kommt ans Ende.
  */
  const angehaengt = geordnet.flatMap((h) => [
    h,
    ...weitere.filter((a) => a.istAlternativeZu === h.id),
  ]);
  const verwaist = weitere.filter((a) => !angehaengt.includes(a));
  return [...angehaengt, ...verwaist];
}
