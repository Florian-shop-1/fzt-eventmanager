/**
 * Wohin mit den Gästen aus den hinteren Reihen?
 *
 * An schwach verkauften Abenden sitzen vorne einzelne Grüppchen und
 * hinten eine gut gefüllte Reihe. Von der Bühne aus sieht das leer aus.
 * Also holt das Showteam die hinteren Gäste nach vorn und schenkt ihnen
 * ein Upgrade.
 *
 * Zwei Regeln stehen über allem.
 *
 * ERSTENS wird eine Gruppe nie auseinandergezogen. Wer zu viert kommt,
 * sitzt auch vorne zu viert nebeneinander. Lieber bleibt eine Gruppe
 * hinten sitzen, als dass sie geteilt wird.
 *
 * ZWEITENS wird nur in die spielbare Zone gesetzt. Das ist keine Frage
 * der Optik, sondern der Show: Es gibt Nummern, bei denen etwas ins
 * Publikum geworfen wird, und wer weit aussen oder weit hinten sitzt,
 * ist dabei nicht erreichbar. Ein Saal, der voll aussieht, aber nicht
 * bespielbar ist, hilft niemandem.
 *
 * Wer gehört zusammen?
 *
 * Ditix verrät es nicht. Das Feld für die Bestellzugehörigkeit kommt
 * leer zurück, an zwölf geprüften Vorstellungen mit echten Verkäufen
 * ausnahmslos, und die Rohdaten aus dem Shop führen nur Stückzahlen,
 * keine Platznummern. Also wird abgeleitet: Nebeneinanderliegende
 * verkaufte Plätze in derselben Reihe sind eine Gruppe.
 *
 * Diese Annahme kann zu grosszügig sein, wenn zwei Paare zufällig
 * nebeneinander sitzen. Dann wird ein Viererblock gesucht, wo zwei Paare
 * gereicht hätten. Das kostet Platz, trennt aber niemanden. Der Fehler
 * geht damit immer in die ungefährliche Richtung.
 *
 * Wohin die Gruppe innerhalb der Zone kommt, entscheidet der volle
 * Eindruck:
 *
 *  - Der Block schliesst an schon Besetztes an, statt eine neue Insel zu
 *    bilden.
 *  - Er liegt weit vorne.
 *  - Er liegt mittig in seiner Reihe.
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

/**
 * Die spielbare Zone in Zahlen.
 *
 * REIHEN_TIEF  Wie viele Reihen von der Bühne aus dazugehören.
 * AUSSEN_FREI  Wie viele Plätze an jedem Ende einer Reihe wegfallen.
 *              Dass die aussen frei bleiben, fällt niemandem auf.
 *
 * Die Werte sind am Saal abgenommen: sechs Reihen tief, je zwei Plätze
 * aussen. Bei sechzehn Plätzen je Reihe bleiben damit die Plätze 3 bis
 * 14. Wer die Zone ändern will, ändert diese beiden Zahlen.
 */
const REIHEN_TIEF = 6;
const AUSSEN_FREI = 2;

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

/** Der Bereich, in den umgesetzt werden darf. */
export interface Spielzone {
  reihen: Reihe[];
  /** Kennungen aller Plätze innerhalb der Zone. */
  sitze: Set<number>;
  /** Umriss für die Zeichnung. */
  links: number;
  rechts: number;
  oben: number;
  unten: number;
  reihenTief: number;
  aussenFrei: number;
}

export interface Empfehlung {
  reihen: Reihe[];
  zone: Spielzone;
  /** Die Reihen, die geräumt werden sollen, von hinten gezählt. */
  quellreihen: Reihe[];
  /** Alle Gruppen in den zu räumenden Reihen. */
  gruppen: Bereich[];
  /** Wer wohin kommt, in der Reihenfolge der Ansage. */
  umzuege: Umzug[];
  /** Gruppen, für die in der Zone kein Block am Stück frei war. */
  bleiben: Bereich[];
  /** Wie viele Gäste insgesamt umgesetzt werden. */
  gaeste: number;
  /** Freie Plätze in der Zone, nach dem Umsetzen. */
  freiInZone: number;
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
 * Bestimmt die spielbare Zone.
 *
 * Die vorderen Reihen, und in ihnen alles ausser den äusseren Plätzen.
 * Rollstuhlplätze gehören nie dazu, auch wenn sie geometrisch drin
 * lägen.
 */
export function spielzone(parkett: Reihe[]): Spielzone {
  const reihen = parkett.slice(0, REIHEN_TIEF);
  const sitze = new Set<number>();
  let links = Infinity;
  let rechts = -Infinity;
  let oben = Infinity;
  let unten = -Infinity;

  for (const r of reihen) {
    const innen = r.sitze.slice(AUSSEN_FREI, Math.max(AUSSEN_FREI, r.sitze.length - AUSSEN_FREI));
    for (const s of innen) {
      if (ROLLSTUHL.test(s.sektor) || ROLLSTUHL.test(s.kategorie)) continue;
      sitze.add(s.id);
      links = Math.min(links, s.x);
      rechts = Math.max(rechts, s.x);
      oben = Math.min(oben, s.y);
      unten = Math.max(unten, s.y);
    }
  }

  return {
    reihen,
    sitze,
    links: Number.isFinite(links) ? links : 0,
    rechts: Number.isFinite(rechts) ? rechts : 0,
    oben: Number.isFinite(oben) ? oben : 0,
    unten: Number.isFinite(unten) ? unten : 0,
    reihenTief: REIHEN_TIEF,
    aussenFrei: AUSSEN_FREI,
  };
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

/** Kommt dieser Platz als Ziel in Frage? */
function alsZielMoeglich(s: Sitz, zone: Spielzone): boolean {
  if (!zone.sitze.has(s.id)) return false;
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
  const zone = spielzone(parkett);

  // Von hinten so viele Reihen nehmen, wie geräumt werden sollen, aber
  // nur solche, in denen überhaupt jemand sitzt. Eine leere letzte Reihe
  // zu räumen bringt nichts und würde die vorletzte verdecken.
  const vonHinten = [...parkett].reverse().filter((r) => r.sitze.some(umsetzbar));
  const quellreihen = vonHinten.slice(0, Math.max(1, reihenRaeumen));
  const quellen = new Set(quellreihen.map((r) => schluessel(r.sektor, r.nummer)));

  const gruppen = quellreihen.flatMap(gruppenDerReihe);

  // Ziel ist die Zone, soweit sie vor den geräumten Reihen liegt.
  const grenze = quellreihen.reduce((y, r) => Math.min(y, r.y), Infinity);
  const zielreihen = zone.reihen.filter(
    (r) => r.y < grenze && !quellen.has(schluessel(r.sektor, r.nummer)),
  );

  // Grosse Gruppen zuerst. Für sie gibt es die wenigsten Möglichkeiten,
  // und wer sie zuletzt platziert, findet keinen Block mehr am Stück.
  const reihenfolge = [...gruppen].sort((a, b) => b.sitze.length - a.sitze.length);

  const belegt = new Set<number>();
  const umzuege: Umzug[] = [];
  const bleiben: Bereich[] = [];

  for (const gruppe of reihenfolge) {
    const ziel = bestenBlockSuchen(zielreihen, gruppe.sitze.length, belegt, zone, zone.reihen);
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

  let freiInZone = 0;
  for (const r of zone.reihen) {
    for (const s of r.sitze) {
      if (alsZielMoeglich(s, zone) && !belegt.has(s.id)) freiInZone++;
    }
  }

  return {
    reihen,
    zone,
    quellreihen,
    gruppen,
    umzuege,
    bleiben,
    gaeste: umzuege.reduce((n, u) => n + u.gruppe.sitze.length, 0),
    freiInZone,
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
  zone: Spielzone,
  alleZonenreihen: Reihe[],
): Bereich | null {
  let bester: Bereich | null = null;
  let bestePunkte = -Infinity;

  const istBelegt = (s: Sitz) => s.status === "verkauft" || belegt.has(s.id);
  const reiheBelegt = (r: Reihe | undefined) =>
    Boolean(r) && r!.sitze.some((s) => zone.sitze.has(s.id) && istBelegt(s));

  // Bis wohin reicht der besetzte Bereich nach hinten? Eine Reihe dahinter
  // anzufangen, waehrend davor noch Platz ist, reisst den Block
  // auseinander.
  let letzteBelegte = -1;
  alleZonenreihen.forEach((r, i) => {
    if (reiheBelegt(r)) letzteBelegte = i;
  });

  zielreihen.forEach((reihe, reihenIndex) => {
    const abstand = sitzabstand(reihe);
    const frei = (s: Sitz) => alsZielMoeglich(s, zone) && !belegt.has(s.id);
    const besetzt = (s: Sitz | undefined) =>
      Boolean(s) && (s!.status === "verkauft" || belegt.has(s!.id));

    // Nur die Plätze innerhalb der Zone kommen in Frage. Die äusseren
    // fallen damit von vornherein weg, auch als Nachbarn eines Fensters.
    const innen = reihe.sitze.filter((s) => zone.sitze.has(s.id));

    for (let start = 0; start + groesse <= innen.length; start++) {
      const fenster = innen.slice(start, start + groesse);

      if (!fenster.every(frei)) continue;
      let zusammenhaengend = true;
      for (let i = 1; i < fenster.length; i++) {
        if (!nebeneinander(fenster[i - 1], fenster[i], abstand)) zusammenhaengend = false;
      }
      if (!zusammenhaengend) continue;

      // Nachbarn dürfen auch ausserhalb der Zone liegen: Ob dort jemand
      // sitzt, entscheidet mit darüber, ob ein Block geschlossen wirkt.
      const iErster = reihe.sitze.indexOf(fenster[0]);
      const iLetzter = reihe.sitze.indexOf(fenster[fenster.length - 1]);
      const links = reihe.sitze[iErster - 1];
      const rechts = reihe.sitze[iLetzter + 1];
      const linksDran = links && nebeneinander(links, fenster[0], abstand);
      const rechtsDran = rechts && nebeneinander(fenster[fenster.length - 1], rechts, abstand);

      let anschluss = 0;
      if (linksDran && besetzt(links)) anschluss++;
      if (rechtsDran && besetzt(rechts)) anschluss++;

      // Weiter vorne ist besser.
      const vorne = zielreihen.length > 1 ? 1 - reihenIndex / (zielreihen.length - 1) : 1;

      // Mittig in der Zone ist besser.
      const breite = Math.abs(zone.rechts - zone.links) || 1;
      const mitteBlock = (fenster[0].x + fenster[fenster.length - 1].x) / 2;
      const mittig =
        1 - Math.min(1, (Math.abs(mitteBlock - (zone.links + zone.rechts) / 2) * 2) / breite);

      // Bleibt daneben genau ein freier Stuhl zwischen zwei Besetzten
      // stehen, ist das der hässlichste Fall im ganzen Saal.
      let luecken = 0;
      if (linksDran && !besetzt(links)) {
        const davor = reihe.sitze[iErster - 2];
        if (!davor || !nebeneinander(davor, links, abstand) || besetzt(davor)) luecken++;
      }
      if (rechtsDran && !besetzt(rechts)) {
        const danach = reihe.sitze[iLetzter + 2];
        if (!danach || !nebeneinander(rechts, danach, abstand) || besetzt(danach)) luecken++;
      }

      /*
        Senkrechter Anschluss: Sitzt in der Reihe davor oder dahinter
        jemand auf denselben Plaetzen, waechst ein Block in die Tiefe
        statt nur in die Breite. Das ist der staerkste Hebel dafuer, dass
        das Publikum als geschlossene Masse dasitzt.
      */
      const zonenIndex = alleZonenreihen.indexOf(reihe);
      const davor = alleZonenreihen[zonenIndex - 1];
      const dahinter = alleZonenreihen[zonenIndex + 1];
      let senkrechteNachbarn = 0;
      for (const f of fenster) {
        for (const nachbarreihe of [davor, dahinter]) {
          if (!nachbarreihe) continue;
          const gegenueber = nachbarreihe.sitze.find(
            (q) => Math.abs(q.x - f.x) <= abstand * 0.6,
          );
          if (gegenueber && istBelegt(gegenueber)) senkrechteNachbarn++;
        }
      }
      const senkrecht = senkrechteNachbarn / (fenster.length * 2);

      /*
        Keine Reihe auslassen.

        Eine leere Reihe mitten im Block faellt von der Buehne aus mehr
        auf als eine leere Reihe dahinter. Deshalb zwei Regeln: Eine
        Luecke zu schliessen bringt Punkte, und eine Reihe hinter dem
        besetzten Bereich anzufangen, waehrend davor noch Platz ist,
        kostet welche.
      */
      const reiheLeer = !reiheBelegt(reihe);
      const luecke = reiheLeer && zonenIndex < letzteBelegte ? 1 : 0;
      const uebersprungen = reiheLeer && zonenIndex > letzteBelegte + 1 ? 1 : 0;

      const punkte =
        anschluss * 5 +
        senkrecht * 4 +
        luecke * 4 -
        uebersprungen * 6 +
        vorne * 2 +
        mittig * 2 -
        luecken * 2.5;

      if (punkte > bestePunkte) {
        bestePunkte = punkte;
        bester = zuBereich(reihe, fenster);
      }
    }
  });

  return bester;
}
