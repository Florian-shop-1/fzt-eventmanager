/**
 * Wohin mit den Gästen aus den hinteren Reihen?
 *
 * An schwach verkauften Abenden sitzen vorne einzelne Grüppchen und
 * hinten eine gut gefüllte Reihe. Von der Bühne aus sieht das leer aus.
 * Also holt das Showteam die hinteren Gäste nach vorn und schenkt ihnen
 * ein Upgrade.
 *
 * Die wichtigste Regel steht über allem: Eine Gruppe wird nie
 * auseinandergezogen. Wer zu viert kommt, sitzt auch vorne zu viert
 * nebeneinander. Lieber bleibt eine Gruppe hinten sitzen, als dass sie
 * geteilt wird.
 *
 * Wer gehört zusammen?
 *
 * Ditix verrät es nicht. Das Feld für die Bestellzugehörigkeit kommt
 * leer zurück, an zwölf geprüften Vorstellungen mit echten Verkäufen
 * ausnahmslos, und die Rohdaten aus dem Shop führen nur Stückzahlen, keine
 * Platznummern. Also wird abgeleitet: Nebeneinanderliegende verkaufte
 * Plätze in derselben Reihe sind eine Gruppe.
 *
 * Diese Annahme kann zu grosszügig sein, wenn zwei Paare zufällig
 * nebeneinander sitzen. Dann wird ein Viererblock gesucht, wo zwei Paare
 * gereicht hätten. Das kostet Platz, trennt aber niemanden. Der Fehler
 * geht damit immer in die ungefährliche Richtung.
 *
 * Wohin die Gruppe kommt, entscheidet der volle Eindruck:
 *
 *  - Der Block schliesst an schon Besetztes an, statt eine neue Insel zu
 *    bilden.
 *  - Er liegt weit vorne.
 *  - Er liegt mittig in seiner Reihe. Dass aussen zwei Plätze frei
 *    bleiben, fällt niemandem auf.
 *  - Er lässt keine einzelne Lücke daneben stehen. Ein einzelner freier
 *    Stuhl mitten im Block sticht mehr ins Auge als eine leere Reihe.
 *
 * Über den Mittelgang hinweg gibt es keine Nachbarschaft, weder für
 * Gruppen noch für Blöcke. Zwei Plätze links und rechts des Gangs sind
 * keine zwei Plätze nebeneinander.
 */

import type { Saalplan, Sitz } from "@/lib/ditix/saalplan";

/** Bereiche, in die niemand gesetzt wird. */
const NICHT_ZIEL = /vip|empore/i;

/**
 * Rollstuhlplätze bleiben unangetastet, in beide Richtungen. Wer dort
 * sitzt, braucht genau diesen Platz, und für alle anderen ist er nicht
 * gedacht.
 */
const ROLLSTUHL = /rollstuhl|rolli/i;

export interface Reihe {
  /** "Kat. 1", "Golden Seats" und so weiter. */
  sektor: string;
  nummer: string;
  /** Lage im Saal, klein heisst vorne. */
  y: number;
  /** Von links nach rechts, so wie man auf den Saal schaut. */
  sitze: Sitz[];
}

/** Ein Stück Reihe: eine Gruppe hinten oder ein Zielblock vorne. */
export interface Bereich {
  reihe: Reihe;
  sitze: Sitz[];
  /** Platznummern, wie man sie ansagt: "Platz 7 bis 8". */
  von: string;
  bis: string;
}

/** Eine Gruppe und ihr neuer Platz. */
export interface Umzug {
  gruppe: Bereich;
  ziel: Bereich;
}

export interface Empfehlung {
  reihen: Reihe[];
  /** Die Reihen, die geräumt werden sollen, von hinten gezählt. */
  quellreihen: Reihe[];
  /** Alle Gruppen in den zu räumenden Reihen. */
  gruppen: Bereich[];
  /** Wer wohin kommt, in der Reihenfolge der Ansage. */
  umzuege: Umzug[];
  /** Gruppen, für die vorne kein Block am Stück frei war. */
  bleiben: Bereich[];
  /** Wie viele Gäste insgesamt umgesetzt werden. */
  gaeste: number;
}

/** Kennung einer Reihe, aus Sektor und Nummer. */
function schluessel(sektor: string, nummer: string): string {
  // Zwei Doppelpunkte trennen. Ein Leerzeichen taugt nicht, denn
  // "Kat. 1" und "Golden Seats" enthalten selbst welche.
  return sektor + "::" + nummer;
}

/**
 * Sortiert die Sitze zu Reihen.
 *
 * Reihen werden nach ihrer Lage im Saal geordnet, nicht nach ihrer
 * Nummer: Jeder Sektor zählt bei eins an, und "Reihe 1" der Empore liegt
 * hinter "Reihe 9" im Parkett.
 */
export function reihenBilden(plan: Saalplan): Reihe[] {
  const nach = new Map<string, Reihe>();
  for (const s of plan.sitze) {
    const k = schluessel(s.sektor, s.reihe);
    let r = nach.get(k);
    if (!r) {
      r = { sektor: s.sektor, nummer: s.reihe, y: 0, sitze: [] };
      nach.set(k, r);
    }
    r.sitze.push(s);
  }

  const reihen = [...nach.values()];
  for (const r of reihen) {
    r.sitze.sort((a, b) => a.x - b.x);
    r.y = r.sitze.reduce((summe, s) => summe + s.y, 0) / r.sitze.length;
  }
  return reihen.sort((a, b) => a.y - b.y);
}

/**
 * Der übliche Abstand zweier Nachbarplätze in einer Reihe.
 *
 * Gebraucht, um den Mittelgang zu erkennen: Dort ist der Abstand
 * deutlich grösser, und über ihn hinweg sitzt niemand nebeneinander.
 * Genommen wird der mittlere Abstand, denn Gänge sind die Ausnahme.
 */
function sitzabstand(reihe: Reihe): number {
  const abstaende: number[] = [];
  for (let i = 1; i < reihe.sitze.length; i++) {
    abstaende.push(Math.abs(reihe.sitze[i].x - reihe.sitze[i - 1].x));
  }
  if (abstaende.length === 0) return 1;
  abstaende.sort((a, b) => a - b);
  return abstaende[Math.floor(abstaende.length / 2)];
}

/** Sitzen die beiden nebeneinander, ohne Gang dazwischen? */
function nebeneinander(a: Sitz, b: Sitz, abstand: number): boolean {
  return Math.abs(b.x - a.x) <= abstand * 1.4;
}

/** Kommt dieser Platz überhaupt als Ziel in Frage? */
function alsZielMoeglich(s: Sitz): boolean {
  if (NICHT_ZIEL.test(s.sektor) || NICHT_ZIEL.test(s.kategorie)) return false;
  if (ROLLSTUHL.test(s.sektor) || ROLLSTUHL.test(s.kategorie)) return false;
  return s.status === "frei";
}

/** Wird dieser Gast umgesetzt, wenn seine Reihe geräumt wird? */
function umsetzbar(s: Sitz): boolean {
  if (s.status !== "verkauft") return false;
  // Rollstuhlplätze bleiben, wo sie sind.
  if (ROLLSTUHL.test(s.sektor) || ROLLSTUHL.test(s.kategorie)) return false;
  return true;
}

/** Macht aus einer Folge von Sitzen einen benannten Bereich. */
function zuBereich(reihe: Reihe, sitze: Sitz[]): Bereich {
  // Die Platznummern laufen im Saal von rechts nach links. Angesagt wird
  // aber aufsteigend: "Platz 7 bis 8", nicht "Platz 8 bis 7".
  const nummern = sitze.map((s) => s.name).sort((a, b) => Number(a) - Number(b));
  return { reihe, sitze, von: nummern[0], bis: nummern[nummern.length - 1] };
}

/**
 * Die Gruppen einer Reihe.
 *
 * Alles, was nebeneinander verkauft ist, gilt als eine Gruppe. Ein Gang
 * oder ein freier Platz dazwischen trennt.
 */
function gruppenDerReihe(reihe: Reihe): Bereich[] {
  const abstand = sitzabstand(reihe);
  const raus: Bereich[] = [];
  let lauf: Sitz[] = [];

  const abschliessen = () => {
    if (lauf.length > 0) raus.push(zuBereich(reihe, lauf));
    lauf = [];
  };

  reihe.sitze.forEach((s, i) => {
    if (!umsetzbar(s)) {
      abschliessen();
      return;
    }
    const vorher = reihe.sitze[i - 1];
    if (lauf.length > 0 && vorher && !nebeneinander(vorher, s, abstand)) abschliessen();
    lauf.push(s);
  });
  abschliessen();

  return raus;
}

/**
 * Rechnet die Empfehlung für einen Abend aus.
 *
 * @param reihenRaeumen Wie viele Reihen von hinten geräumt werden sollen.
 */
export function empfehlung(plan: Saalplan, reihenRaeumen = 1): Empfehlung {
  const reihen = reihenBilden(plan);

  // Die Empore zählt nicht mit. Sie wird an schwachen Abenden ohnehin
  // geschlossen, und niemand sitzt dort.
  const parkett = reihen.filter((r) => !NICHT_ZIEL.test(r.sektor));

  // Von hinten so viele Reihen nehmen, wie geräumt werden sollen, aber
  // nur solche, in denen überhaupt jemand sitzt. Eine leere letzte Reihe
  // zu räumen bringt nichts und würde die vorletzte verdecken.
  const vonHinten = [...parkett].reverse().filter((r) => r.sitze.some(umsetzbar));
  const quellreihen = vonHinten.slice(0, Math.max(1, reihenRaeumen));
  const quellen = new Set(quellreihen.map((r) => schluessel(r.sektor, r.nummer)));

  const gruppen = quellreihen.flatMap(gruppenDerReihe);

  // Ziel ist alles, was vor der vordersten geräumten Reihe liegt.
  const grenze = quellreihen.reduce((y, r) => Math.min(y, r.y), Infinity);
  const zielreihen = parkett.filter(
    (r) => r.y < grenze && !quellen.has(schluessel(r.sektor, r.nummer)),
  );

  // Grosse Gruppen zuerst. Für sie gibt es die wenigsten Möglichkeiten,
  // und wer sie zuletzt platziert, findet keinen Block mehr am Stück.
  const reihenfolge = [...gruppen].sort((a, b) => b.sitze.length - a.sitze.length);

  const belegt = new Set<number>();
  const umzuege: Umzug[] = [];
  const bleiben: Bereich[] = [];

  for (const gruppe of reihenfolge) {
    const ziel = bestenBlockSuchen(zielreihen, gruppe.sitze.length, belegt);
    if (!ziel) {
      bleiben.push(gruppe);
      continue;
    }
    for (const s of ziel.sitze) belegt.add(s.id);
    umzuege.push({ gruppe, ziel });
  }

  // Für die Ansage wieder von vorne nach hinten sortieren, damit der
  // Mitarbeiter die Liste von oben nach unten abarbeiten kann.
  umzuege.sort((a, b) => {
    const dy = a.ziel.reihe.y - b.ziel.reihe.y;
    return dy !== 0 ? dy : a.ziel.sitze[0].x - b.ziel.sitze[0].x;
  });

  return {
    reihen,
    quellreihen,
    gruppen,
    umzuege,
    bleiben,
    gaeste: umzuege.reduce((n, u) => n + u.gruppe.sitze.length, 0),
  };
}

/**
 * Sucht den besten freien Block einer bestimmten Grösse.
 *
 * Durchsucht werden alle Fenster passender Länge in allen Zielreihen.
 * Bewertet wird jedes Fenster als Ganzes, denn eine Gruppe zieht als
 * Ganzes um.
 */
function bestenBlockSuchen(
  zielreihen: Reihe[],
  groesse: number,
  belegt: Set<number>,
): Bereich | null {
  let bester: Bereich | null = null;
  let bestePunkte = -Infinity;

  zielreihen.forEach((reihe, reihenIndex) => {
    const abstand = sitzabstand(reihe);
    const frei = (s: Sitz) => alsZielMoeglich(s) && !belegt.has(s.id);
    const besetzt = (s: Sitz | undefined) =>
      Boolean(s) && (s!.status === "verkauft" || belegt.has(s!.id));

    for (let start = 0; start + groesse <= reihe.sitze.length; start++) {
      const fenster = reihe.sitze.slice(start, start + groesse);

      // Alle Plätze frei und lückenlos nebeneinander, kein Gang dazwischen.
      if (!fenster.every(frei)) continue;
      let zusammenhaengend = true;
      for (let i = 1; i < fenster.length; i++) {
        if (!nebeneinander(fenster[i - 1], fenster[i], abstand)) zusammenhaengend = false;
      }
      if (!zusammenhaengend) continue;

      const links = reihe.sitze[start - 1];
      const rechts = reihe.sitze[start + groesse];
      const linksDran = links && nebeneinander(links, fenster[0], abstand);
      const rechtsDran = rechts && nebeneinander(fenster[fenster.length - 1], rechts, abstand);

      // Anschluss an schon Besetztes.
      let anschluss = 0;
      if (linksDran && besetzt(links)) anschluss++;
      if (rechtsDran && besetzt(rechts)) anschluss++;

      // Weiter vorne ist besser.
      const vorne = zielreihen.length > 1 ? 1 - reihenIndex / (zielreihen.length - 1) : 1;

      // Mittig in der eigenen Reihe ist besser.
      const ersterX = reihe.sitze[0].x;
      const letzterX = reihe.sitze[reihe.sitze.length - 1].x;
      const breite = Math.abs(letzterX - ersterX) || 1;
      const mitteBlock = (fenster[0].x + fenster[fenster.length - 1].x) / 2;
      const mittig =
        1 - Math.min(1, (Math.abs(mitteBlock - (ersterX + letzterX) / 2) * 2) / breite);

      // Bleibt daneben genau ein freier Stuhl zwischen zwei Besetzten
      // stehen, ist das der hässlichste Fall im ganzen Saal.
      let luecken = 0;
      if (linksDran && !besetzt(links)) {
        const davor = reihe.sitze[start - 2];
        if (!davor || !nebeneinander(davor, links, abstand) || besetzt(davor)) luecken++;
      }
      if (rechtsDran && !besetzt(rechts)) {
        const danach = reihe.sitze[start + groesse + 1];
        if (!danach || !nebeneinander(rechts, danach, abstand) || besetzt(danach)) luecken++;
      }

      const punkte = anschluss * 5 + vorne * 3 + mittig * 2 - luecken * 2.5;

      if (punkte > bestePunkte) {
        bestePunkte = punkte;
        bester = zuBereich(reihe, fenster);
      }
    }
  });

  return bester;
}
