/**
 * Das Begleitschreiben zum Zauberstab.
 *
 * Es liegt dem Päckchen bei, das an die Teilnehmer des Eurowings-
 * Gewinnspiels geht. Gedacht ist es wie das Schreiben bei den Gutscheinen:
 * kein Werbezettel, sondern ein paar Zeilen von Florian (Florian,
 * 30.09.2026).
 *
 * Zwei Dinge sollen darin vorkommen, weil sie der Anlass sind: die Freude
 * darüber, wenn jemand Ulm und die Show besucht, und die Einladung, sich
 * wegen Hotelangeboten oder Fragen einfach zu melden. Wer mit dem Flugzeug
 * kommt, plant eine Reise und nicht nur einen Theaterabend.
 */

export const ZAUBERSTAB_UEBERSCHRIFT = "Deine Magie für zu Hause ✦";

export function zauberstabAnrede(name: string): string {
  const sauber = name.trim();
  return sauber ? `Liebe/r ${sauber},` : "Liebe Gäste,";
}

export const ZAUBERSTAB_ABSAETZE = [
  "schön, dass du beim Gewinnspiel mitgemacht hast. Hier ist deine magische Überraschung: " +
    "ein erscheinender Zauberstab. Er gehört jetzt dir, ganz gleich, wie die Verlosung ausgeht.",
  "Wie er funktioniert, verrate ich dir nicht ganz. Nur so viel: Er erscheint aus dem Nichts, " +
    "wenn man ihn richtig hält. Ein paar Minuten üben vor dem Spiegel, und du hast deinen " +
    "ersten eigenen Zaubertrick.",
  "Über eines würde ich mich besonders freuen: wenn du uns in Ulm besuchst. Unser Theater ist " +
    "für mich der magischste Ort Deutschlands, und eine Show aus nächster Nähe ist etwas " +
    "anderes als alles, was man im Fernsehen sieht.",
  "Wenn du dafür eine Übernachtung brauchst: Melde dich einfach bei uns. Wir haben Hotels in " +
    "der Nachbarschaft, mit denen wir zusammenarbeiten, und helfen gern bei der Planung. " +
    "Dasselbe gilt für jede andere Frage, schreib uns oder ruf an.",
];

export const ZAUBERSTAB_GRUSS = "Bis ganz bald im Home of Magic";
