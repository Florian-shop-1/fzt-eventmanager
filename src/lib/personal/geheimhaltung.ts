/**
 * Der Text der Geheimhaltungsvereinbarung.
 *
 * Wortgleich aus der Vorlage NDA_Geheimhaltung_NEU_2026.docx übernommen,
 * die im SharePoint unter 02_show liegt. Bewusst wortgleich: Das ist ein
 * Vertrag mit einer Vertragsstrafe von 50.000 Euro, an dem nichts
 * nebenbei umformuliert wird.
 *
 * Geändert wurde nur, was vorher gar nicht dastand: die Beschriftung der
 * zweiten Unterschriftszeile. In der Vorlage steht unter der ersten
 * "Florian Zimmer", unter der zweiten nichts. Auf einem unterschriebenen
 * Blatt sollte erkennbar sein, wer dort unterschrieben hat.
 */

export interface Vertragspartner {
  name: string;
  geburtsdatum: string;
  strasse: string;
  plz: string;
  ort: string;
}

/** Wer die Vereinbarung anbietet, aus der Vorlage. */
export const ANBIETER = {
  name: "Florian Zimmer",
  strasse: "Eberhardtstr. 73",
  ort: "89073 Ulm",
} as const;

export const PRAEAMBEL = [
  "Der Vertragspartner wird für die Florian Zimmer Theater GmbH tätig, welche das Magietheater unter der Adresse Grethe-Weiser-Str. 2/1, 89231 Neu-Ulm betreibt.",
  "In dem Magietheater werden Zauberkünste mit entsprechenden Zaubertricks von Florian Zimmer sowie gegebenenfalls weiteren Magiern dargeboten. Das geistige Eigentum an den dargebotenen oder zur Schau gestellten Tricks, Tricktechniken und Illusionen liegt bei Florian Zimmer bzw. den jeweiligen auftretenden Künstlern.",
  "In der Zauberkunst ist die Geheimhaltung von Tricktechniken, Erfindungen, Konstruktionen und Abläufen von essenzieller Bedeutung.",
  "Vor diesem Hintergrund schließen die Parteien folgende Geheimhaltungsvereinbarung verbunden mit einer Vertragsstrafe.",
];

export interface Abschnitt {
  nummer: string;
  titel: string;
  absaetze: string[];
  aufzaehlung?: string[];
  /** Text nach der Aufzählung. */
  danach?: string[];
}

export const ABSCHNITTE: Abschnitt[] = [
  {
    nummer: "1.",
    titel: "Begriffsfestlegung",
    absaetze: [
      "„Vertrauliche Informationen“ sind sämtliche Informationen, die durch Florian Zimmer oder dessen Hilfspersonen zur Vorbereitung und Durchführung von Live-Auftritten, Showproduktionen oder Trickentwicklungen verwendet werden oder dem Vertragspartner hierbei in irgendeiner Weise bekannt werden.",
      "Hierunter fallen insbesondere sämtliche Informationen, Daten und Materialien, unabhängig davon, ob diese schriftlich, elektronisch, mündlich oder durch bloße Wahrnehmung bekannt werden, sofern sie als vertraulich gekennzeichnet sind oder nach ihrer Natur bzw. den Umständen als vertraulich anzusehen sind.",
      "Als vertrauliche Informationen gelten insbesondere:",
    ],
    aufzaehlung: [
      "Tricktechniken und Trickmechaniken,",
      "Konstruktionen und technische Abläufe,",
      "Know-how, Hilfsmittel,",
      "Entwicklungs- und Produktionsabläufe,",
      "Illusionen und deren Funktionsweisen,",
      "interne Abläufe und Sicherheitsmechanismen,",
    ],
    danach: [
      "von Florian Zimmer oder anderen im Magietheater auftretenden Magiern bzw. Zauberkünstlern.",
    ],
  },
  {
    nummer: "2.",
    titel: "Behandlung vertraulicher Informationen",
    absaetze: [
      "Der Vertragspartner verpflichtet sich, sämtliche vertraulichen Informationen zeitlich unbegrenzt vertraulich zu behandeln und insbesondere:",
    ],
    aufzaehlung: [
      "nicht an Dritte weiterzugeben,",
      "nicht selbst zu nutzen oder zu verwerten,",
      "nicht zu veröffentlichen oder zugänglich zu machen.",
    ],
    danach: [
      "Eine Offenlegung ist ausschließlich zulässig, soweit eine bindende gesetzliche, gerichtliche oder behördliche Verpflichtung hierzu besteht.",
      "Vor einer solchen Offenlegung hat der Vertragspartner Florian Zimmer unverzüglich schriftlich zu informieren, damit rechtzeitig rechtliche Schritte gegen die Offenlegung eingeleitet werden können.",
      "Wird ein Rechtsmittel eingelegt, bleibt die Geheimhaltungspflicht bestehen, solange dem Rechtsmittel aufschiebende Wirkung zukommt.",
    ],
  },
  {
    nummer: "3.",
    titel: "Vertragsstrafe",
    absaetze: [
      "Für jeden Fall der Zuwiderhandlung gegen die Verpflichtungen aus Ziffer 2 – einschließlich des Versuchs einer solchen Handlung – verpflichtet sich der Vertragspartner zur Zahlung einer Vertragsstrafe in Höhe von 50.000,00 EUR (in Worten: fünfzigtausend Euro).",
      "Bei vorsätzlichen Verstößen wird die Einrede des Fortsetzungszusammenhangs ausgeschlossen.",
      "Die Geltendmachung eines weitergehenden Schadens durch Florian Zimmer bleibt hiervon unberührt.",
    ],
  },
];

/** Ist alles ausgefüllt, was auf dem Blatt stehen muss? */
export function vollstaendig(p: Partial<Vertragspartner>): boolean {
  return Boolean(
    p.name?.trim() && p.geburtsdatum?.trim() && p.strasse?.trim() && p.plz?.trim() && p.ort?.trim(),
  );
}

/** "Musterstraße 1, 89073 Ulm" */
export function anschrift(p: Vertragspartner): string {
  return `${p.strasse}, ${p.plz} ${p.ort}`;
}

/**
 * Der gesamte Vertragstext als eine Zeichenkette.
 *
 * Gebraucht, um einen Fingerabdruck zu bilden. Wer online unterschreibt,
 * unterschreibt eine bestimmte Fassung, und die muss sich später
 * nachweisen lassen. Ohne das liesse sich nach einer Textaenderung nicht
 * mehr sagen, wozu jemand eigentlich sein Zeichen gesetzt hat.
 */
export function ganzerText(): string {
  const teile: string[] = ["Geheimhaltungsvereinbarung / Vertragsstrafe", ...PRAEAMBEL];
  for (const a of ABSCHNITTE) {
    teile.push(a.nummer + " " + a.titel);
    teile.push(...a.absaetze);
    if (a.aufzaehlung) teile.push(...a.aufzaehlung);
    if (a.danach) teile.push(...a.danach);
  }
  return teile.join(TRENNER);
}

/** Zeilenumbruch, hier als Konstante, damit er keinen Rückstrich braucht. */
const TRENNER = String.fromCharCode(10);

/** Datum der Vorlage, aus der dieser Text stammt. */
export const TEXTSTAND_DATUM = "24.05.2026";
