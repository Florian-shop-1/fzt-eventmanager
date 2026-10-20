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
 * Die Gültigkeit, und was ist, wenn sie vorbei ist.
 *
 * Zwei Dinge müssen zusammenpassen (Florian, 20.10.2026). Buchhalterisch
 * laufen Gutscheine ab, und das soll auch so bleiben. Menschlich lösen
 * wir einen abgelaufenen trotzdem ein, aus Nettigkeit.
 *
 * Deshalb steht hier keine Zusage, sondern eine Einladung: Melde dich.
 * Wer anruft oder schreibt, bekommt seinen Abend; wer nichts tut, hat
 * keinen Anspruch darauf. "Unbegrenzt gültig" darf nirgends stehen, und
 * ein Ablaufdatum wird nie selbst ausgerechnet, sondern nur gezeigt,
 * wenn für diesen Gutschein wirklich eines hinterlegt ist.
 */
export function gueltigkeitssatz(gueltigBis: string | null): string {
  const datum = (gueltigBis ?? "").trim();
  return datum
    ? `Gültig bis ${datumLang(datum)}. Danach melde dich einfach kurz bei uns, ` +
        `per Mail an ${MAIL} oder unter ${TELEFON}, wir finden eine Lösung.`
    : `Sollte dein Gutschein einmal abgelaufen sein, melde dich einfach kurz bei uns, ` +
        `per Mail an ${MAIL} oder unter ${TELEFON}, wir finden eine Lösung.`;
}

/** Dieselbe Aussage in einer Zeile, für den Aufdruck auf dem Gutschein. */
export function gueltigkeitszeile(gueltigBis: string | null): string {
  const datum = (gueltigBis ?? "").trim();
  return datum
    ? `Gültig bis ${datumLang(datum)}. Danach melde dich kurz bei uns, wir finden eine Lösung.`
    : "Abgelaufen? Melde dich kurz bei uns, wir finden eine Lösung.";
}

export const MAIL = "tickets@florianzimmer.com";
export const TELEFON = "0731 7906 110";

/** TT.MM.JJJJ, egal ob ISO oder schon deutsch hereinkommt. */
function datumLang(wert: string): string {
  const iso = wert.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().join(".");
  return wert;
}

export const GRUSSFORMEL = "Bis ganz bald im Home of Magic";
export const UNTERSCHRIFT_ROLLE = "Gastgeber & Magier";
