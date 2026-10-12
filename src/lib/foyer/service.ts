/**
 * Der Servicegedanke, den das Foyer zu Schichtbeginn zu sehen bekommt.
 *
 * Grundlage ist Kevins Nachricht vom 12.10.2026: "Unser Theater lebt von
 * den Gästen und vor allem von deren Empfehlung für uns. (...) Jede
 * schlechte Bewertung tut uns richtig weh. Jede hervorragende ist
 * dagegen Gold wert. (...) wenn es um 4 Euro, oder auch 9 Euro
 * geht, im Zweifel IMMER auf den Gast einlassen."
 *
 * Der Kern steht jedes Mal da, denn genau der soll sitzen. Das Beispiel
 * darunter wechselt täglich: Ein Text, der sich nie ändert, wird nach
 * der dritten Schicht nicht mehr gelesen, und dann ist der Kern auch
 * weg.
 */

export const SERVICE_KERN =
  "Im Zweifel immer auf den Gast einlassen. Eine Diskussion um fünf Euro "
  + "kostet uns mehr, als sie je einbringt.";

const BEISPIELE: string[] = [
  "Ein Gast sagt, ihm sei ein Freigetränk zugesagt worden, und du weißt nichts davon? "
    + "Sag ruhig, dass du es nicht weißt und nachfragen wirst. Wenn Florian und Kevin gerade "
    + "nicht erreichbar sind, gibst du es trotzdem aus. Ein Nein darf dabei nie herauskommen.",
  "Die Kinder kommen mit selbst gemaltem Geld und wollen dafür Popcorn? "
    + "Dann bekommen sie Popcorn. Genau solche Momente erzählen sie zu Hause weiter.",
  "Jeder Gast, der über Google oder Facebook zu uns findet, kostet uns mindestens zehn Euro, "
    + "eher mehr. Bei vier oder neun Euro lohnt sich keine Diskussion.",
  "Eine schlechte Bewertung tut uns richtig weh, eine hervorragende ist Gold wert. "
    + "Beides entsteht an deinem Tresen, nicht auf der Bühne.",
  "Du darfst immer sagen, dass du etwas nicht weißt und es prüfen wirst. "
    + "Was du nicht sagen sollst, ist: Das geht nicht.",
  "Wir leben von Empfehlungen. Zum Abend gehört nicht nur die Show, sondern auch, "
    + "wie zugewandt wir mit den Leuten umgehen.",
];

export interface Servicegruss {
  kern: string;
  beispiel: string;
}

/**
 * Welcher Gedanke heute dran ist.
 *
 * Nach dem Tag, nicht nach dem Zufall: Wer zweimal am selben Abend
 * stempelt, soll nicht zwei verschiedene Texte sehen und sich fragen,
 * was davon jetzt gilt.
 */
export function servicegruss(datum = new Date()): Servicegruss {
  const tag = Math.floor(
    Date.parse(datum.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })) / 86400000,
  );
  return { kern: SERVICE_KERN, beispiel: BEISPIELE[tag % BEISPIELE.length] };
}
