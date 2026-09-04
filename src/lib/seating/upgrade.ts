/**
 * Wohin mit den Gästen aus den hinteren Reihen?
 *
 * An schwach verkauften Abenden sitzen vorne einzelne Grüppchen und
 * hinten eine gut gefüllte Reihe. Von der Bühne aus sieht das leer aus.
 * Also holt das Showteam die hinteren Gäste nach vorn und schenkt ihnen
 * ein Upgrade.
 *
 * Dieses Modul rechnet aus, wohin.
 *
 * Gesetzt wird Platz für Platz, nicht blockweise. Das klingt umständlich,
 * ist aber der Kern der Sache: Jeder vergebene Platz verändert die Lage
 * für den nächsten. Wer ganze freie Strecken bewertet, landet mit allen
 * Gästen am Rand einer langen leeren Reihe, weil die Strecke dort am
 * längsten ist. Wer Platz für Platz setzt und nach jedem Schritt neu
 * schaut, lässt einen Block von innen nach außen wachsen. Genau das
 * ergibt den vollen Eindruck.
 *
 * Was einen guten Platz ausmacht:
 *
 *  - Er schließt an einen schon besetzten an. Ein Block wächst, statt
 *    dass eine neue Insel entsteht.
 *  - Er liegt weit vorne.
 *  - Er liegt mittig in seiner Reihe. Dass außen zwei Plätze frei
 *    bleiben, fällt niemandem auf.
 *  - Er lässt keine einzelne Lücke zurück. Ein einzelner freier Stuhl
 *    mitten im Block sticht mehr ins Auge als eine leere Reihe dahinter.
 *
 * Über den Mittelgang hinweg gibt es keine Nachbarschaft. Zwei Plätze
 * links und rechts des Gangs sind keine zwei Plätze nebeneinander.
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
  /** Lage im Saal, klein heißt vorne. */
  y: number;
  /** Von links nach rechts, so wie man auf den Saal schaut. */
  sitze: Sitz[];
}

export interface Bereich {
  reihe: Reihe;
  sitze: Sitz[];
  /** Platznummern, wie man sie ansagt: "Platz 7 bis 8". */
  von: string;
  bis: string;
}

export interface Empfehlung {
  reihen: Reihe[];
  /** Die Reihen, die geräumt werden sollen, von hinten gezählt. */
  quellreihen: Reihe[];
  /** Die Gäste, die umgesetzt werden. */
  umzusetzen: Sitz[];
  /** Die Ziele, in der Reihenfolge, in der sie vergeben werden sollen. */
  ziele: Bereich[];
  /** Plätze, die nicht mehr untergebracht werden konnten. */
  fehlend: number;
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
 * deutlich größer, und über ihn hinweg sitzt niemand nebeneinander.
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

  const umzusetzen = quellreihen.flatMap((r) => r.sitze.filter(umsetzbar));

  // Ziel ist alles, was vor der vordersten geräumten Reihe liegt.
  const grenze = quellreihen.reduce((y, r) => Math.min(y, r.y), Infinity);
  const zielreihen = parkett.filter(
    (r) => r.y < grenze && !quellen.has(schluessel(r.sektor, r.nummer)),
  );

  const gewaehlt = setzen(zielreihen, umzusetzen.length);

  return {
    reihen,
    quellreihen,
    umzusetzen,
    ziele: zuBereichen(gewaehlt, zielreihen),
    fehlend: Math.max(0, umzusetzen.length - gewaehlt.size),
  };
}

/**
 * Vergibt die Plätze, einen nach dem anderen.
 *
 * Nach jedem Platz wird neu bewertet. Der eben vergebene zählt ab dann
 * als besetzt, und der nächste schließt an ihn an. So wächst ein Block,
 * statt dass überall einzelne Gäste sitzen.
 */
function setzen(zielreihen: Reihe[], anzahl: number): Set<number> {
  const gewaehlt = new Set<number>();
  if (anzahl <= 0) return gewaehlt;

  const abstand = new Map<Reihe, number>();
  for (const r of zielreihen) abstand.set(r, sitzabstand(r));

  const besetzt = (s: Sitz) => s.status === "verkauft" || gewaehlt.has(s.id);

  for (let vergeben = 0; vergeben < anzahl; vergeben++) {
    let bester: Sitz | null = null;
    let bestePunkte = -Infinity;
    let besteReihe: Reihe | null = null;

    zielreihen.forEach((reihe, reihenIndex) => {
      const luecke = abstand.get(reihe)!;
      reihe.sitze.forEach((sitz, i) => {
        if (!alsZielMoeglich(sitz) || gewaehlt.has(sitz.id)) return;

        const links = reihe.sitze[i - 1];
        const rechts = reihe.sitze[i + 1];
        const linksNachbar = links && nebeneinander(links, sitz, luecke);
        const rechtsNachbar = rechts && nebeneinander(sitz, rechts, luecke);

        // Anschluss an schon Besetztes.
        let anschluss = 0;
        if (linksNachbar && besetzt(links)) anschluss++;
        if (rechtsNachbar && besetzt(rechts)) anschluss++;

        // Weiter vorne ist besser.
        const vorne =
          zielreihen.length > 1 ? 1 - reihenIndex / (zielreihen.length - 1) : 1;

        // Mittig in der eigenen Reihe ist besser.
        const ersterX = reihe.sitze[0].x;
        const letzterX = reihe.sitze[reihe.sitze.length - 1].x;
        const breite = Math.abs(letzterX - ersterX) || 1;
        const mittig =
          1 - Math.min(1, (Math.abs(sitz.x - (ersterX + letzterX) / 2) * 2) / breite);

        // Bliebe daneben ein einzelner freier Stuhl zwischen zwei
        // besetzten stehen, ist das der haesslichste Fall im ganzen Saal.
        let luecken = 0;
        if (linksNachbar && !besetzt(links)) {
          const davor = reihe.sitze[i - 2];
          if (!davor || !nebeneinander(davor, links, luecke) || besetzt(davor)) luecken++;
        }
        if (rechtsNachbar && !besetzt(rechts)) {
          const danach = reihe.sitze[i + 2];
          if (!danach || !nebeneinander(rechts, danach, luecke) || besetzt(danach)) luecken++;
        }

        const punkte = anschluss * 5 + vorne * 3 + mittig * 2 - luecken * 2.5;

        if (punkte > bestePunkte) {
          bestePunkte = punkte;
          bester = sitz;
          besteReihe = reihe;
        }
      });
    });

    if (!bester || !besteReihe) break;
    gewaehlt.add((bester as Sitz).id);
  }

  return gewaehlt;
}

/**
 * Fasst die vergebenen Plätze zu zusammenhängenden Bereichen zusammen.
 *
 * Angesagt wird am Einlass nicht "Platz 7, Platz 8", sondern "Platz 7
 * bis 8". Sortiert wird von vorne nach hinten und innerhalb der Reihe
 * von links nach rechts, damit der Mitarbeiter die Liste von oben nach
 * unten abarbeiten kann.
 */
function zuBereichen(gewaehlt: Set<number>, zielreihen: Reihe[]): Bereich[] {
  const raus: Bereich[] = [];

  for (const reihe of zielreihen) {
    const luecke = sitzabstand(reihe);
    let lauf: Sitz[] = [];

    const abschliessen = () => {
      if (lauf.length === 0) return;
      const nummern = lauf.map((s) => s.name).sort((a, b) => Number(a) - Number(b));
      raus.push({
        reihe,
        sitze: lauf,
        von: nummern[0],
        bis: nummern[nummern.length - 1],
      });
      lauf = [];
    };

    reihe.sitze.forEach((sitz, i) => {
      if (!gewaehlt.has(sitz.id)) {
        abschliessen();
        return;
      }
      const vorher = reihe.sitze[i - 1];
      if (lauf.length > 0 && vorher && !nebeneinander(vorher, sitz, luecke)) abschliessen();
      lauf.push(sitz);
    });
    abschliessen();
  }

  return raus;
}
