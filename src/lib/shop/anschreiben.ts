/**
 * Der Wortlaut des Begleitschreibens zum Gutschein.
 *
 * Nicht erfunden, sondern aus den bestehenden Google-Dokumenten
 * übernommen, die zu jeder Bestellung erzeugt wurden. Der Text ist von
 * Florian und soll genau so bleiben, deshalb steht er an einer Stelle
 * und nicht mitten in der Seitengestaltung.
 *
 * Auch der Briefbogen ist der echte: public/bilder/briefbogen.jpg ist die
 * Hintergrundgrafik aus demselben Dokument, unterschrift.png die
 * Unterschrift darunter.
 */

export const ABSENDERZEILE =
  "Florian Zimmer Theater GmbH · Grethe-Weiser-Str. 2/1 · 89231 Neu-Ulm";

export const KONTAKTZEILE = "tickets@florianzimmer.com · 0731 7906 110";

export const ANSCHREIBEN_UEBERSCHRIFT = "Deine Post voller Magie ist da ✦";

/** Die Anrede. Ohne Namen wird sie allgemein. */
export function anrede(name: string): string {
  const sauber = name.trim();
  return sauber ? `Liebe/r ${sauber},` : "Liebe Gäste,";
}

/** Der Fließtext, Absatz für Absatz. */
export const ANSCHREIBEN_ABSAETZE = [
  "wie schön, dass du dir ein Stück Magie nach Hause geholt hast. Vielen Dank für deine " +
    "Bestellung und dein Vertrauen.",
  "In diesem Umschlag findest du den Anfang eines ganz besonderen Erlebnisses.",
  "Unser Theater ist für mich der magischste Ort Deutschlands. Nicht nur wegen der " +
    "Illusionen auf der Bühne, sondern vor allem wegen der Momente, die wir dort gemeinsam " +
    "erleben: staunen, lachen, genießen und für ein paar Stunden alles um uns herum vergessen.",
  "Ich freue mich darauf, dich bald persönlich im Home of Magic willkommen zu heißen und " +
    "gemeinsam mit dir einen Abend zu erleben, der hoffentlich noch lange in Erinnerung bleibt.",
];

/**
 * Der Satz zum Einlösen. Er unterscheidet sich danach, ob ein Gutschein
 * oder eine bereits gebuchte Karte im Umschlag liegt.
 */
export function einloesesatz(istGutschein: boolean): string {
  return istGutschein
    ? "Deinen Gutschein kannst du unkompliziert online auf www.florianzimmertheater.de bei " +
        "der Terminauswahl einlösen, gib dazu einfach den Gutscheincode im Bestellprozess ein."
    : "Deine Karten gelten für den aufgedruckten Termin. Solltest du etwas ändern wollen, " +
        "melde dich einfach bei uns.";
}

/**
 * Der Satz zur Gültigkeit.
 *
 * Zwei Regeln von Florian (20.10.2026): Ein Ablaufdatum steht nur dann
 * da, wenn für diesen Gutschein wirklich eines hinterlegt ist. Gerechnet
 * wird nichts, und "unbegrenzt gültig" steht nirgends, denn das wäre eine
 * Zusage, die wir so nicht geben wollen.
 *
 * Dazu in jedem Fall der Satz, der unsere Kulanz sagt: Wir lösen auch
 * abgelaufene Gutscheine ein. Das ist im Haus seit jeher so und soll auch
 * dastehen, statt dass jemand seinen Gutschein für wertlos hält.
 */
export function gueltigkeitssatz(gueltigBis: string | null): string {
  const kulanz = "Auch abgelaufene Gutscheine lösen wir gern ein.";
  const datum = (gueltigBis ?? "").trim();
  if (!datum) return kulanz;
  return `Dein Gutschein ist gültig bis ${datumLang(datum)}. ${kulanz}`;
}

/** TT.MM.JJJJ, egal ob ISO oder schon deutsch hereinkommt. */
function datumLang(wert: string): string {
  const iso = wert.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().join(".");
  return wert;
}

export const GRUSSFORMEL = "Bis ganz bald im Home of Magic";
export const UNTERSCHRIFT_ROLLE = "Gastgeber & Magier";
