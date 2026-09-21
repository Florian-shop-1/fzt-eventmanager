/**
 * Wohin mit den Gästen, die ausserhalb der spielbaren Zone sitzen?
 *
 * An schwach verkauften Abenden verteilt sich das Publikum über den
 * ganzen Saal. Von der Bühne aus sieht das leer aus, und schlimmer: Es
 * ist nicht bespielbar. Es gibt Nummern, bei denen etwas ins Publikum
 * geworfen wird, und wer weit aussen oder weit hinten sitzt, ist dabei
 * nicht erreichbar.
 *
 * Also holt das Showteam diese Gäste beim Einlass nach vorn und schenkt
 * ihnen ein Upgrade. Dieses Modul rechnet aus, wohin.
 *
 * DIE ZONE ist der Bereich, in dem gespielt werden kann: die vorderen
 * Reihen, ohne die äusseren Plätze. Wer in einer dieser Reihen sitzt,
 * bleibt, auch wenn sein Platz weit aussen liegt: Er sitzt gut genug,
 * und ihn umzusetzen naehme jemandem den Platz weg, der ihn nötiger
 * braucht.
 *
 * Umgesetzt wird, wer HINTER der Zone sitzt, und zwar die letzte Reihe
 * zuerst, dann die vorletzte, dann die drittletzte. Niemand wird dabei
 * nach hinten gesetzt: Eine Reihe weiter hinten ist ein Downgrade, auch
 * wenn der Platz mittiger liegt.
 *
 * EINE GRUPPE wird nie auseinandergezogen. Wer zu viert kommt, sitzt
 * auch vorne zu viert nebeneinander. Lieber bleibt eine Gruppe sitzen,
 * als dass sie geteilt wird.
 *
 * Wer gehört zusammen? Ditix verrät es nicht. Das Feld für die
 * Bestellzugehörigkeit kommt leer zurück, an zwölf geprüften
 * Vorstellungen mit echten Verkäufen ausnahmslos, und die Rohdaten aus
 * dem Shop führen nur Stückzahlen, keine Platznummern. Also wird
 * abgeleitet: Nebeneinanderliegende verkaufte Plätze in derselben Reihe
 * sind eine Gruppe. Das kann zu grosszügig sein, wenn zwei Paare zufällig
 * nebeneinander sitzen, kostet dann etwas Platz, trennt aber niemanden.
 *
 * DER MITTELGANG wird zweimal verschieden behandelt, und das ist der
 * Punkt, an dem ich zuerst danebenlag:
 *
 *  - Für Gruppen und Blöcke trennt er. Zwei Plätze links und rechts des
 *    Gangs sind keine zwei Plätze nebeneinander.
 *  - Für den Eindruck trennt er kaum. Von der Bühne aus sieht ein
 *    Publikum, das links und rechts am Gang sitzt, geschlossen aus.
 *
 * Wer ihn auch für den Eindruck als Wand behandelt, setzt die Gäste vom
 * Gang weg nach aussen, statt sie an ihm zu sammeln. Genau das ist
 * passiert.
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
 *
 * Am Saal abgenommen: fünf Reihen tief, je zwei Plätze aussen. Bei
 * sechzehn Plätzen je Reihe bleiben die Plätze 3 bis 14. Wer die Zone
 * ändern will, ändert diese beiden Zahlen.
 *
 * Bewusst eng gewählt. Das Ziel ist ein Block mittig vor der Bühne, nicht
 * ein moeglichst weit verteiltes Publikum. Eine grosszügigere Zone würde
 * zwar mehr Gruppen unterbringen, aber genau den Eindruck zerstören, um
 * den es geht.
 */
const REIHEN_TIEF = 5;
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

/**
 * Der eine Platz, der wirklich frei bleiben muss: Reihe 4, Platz 3
 * (Florian, 21.09.2026).
 *
 * Alle anderen Sperrungen im Ticketshop sind Verkaufssteuerung, keine
 * echten Hindernisse: Am Einlass darf dort jemand sitzen. Dieser eine
 * nicht, er bleibt leer. In allen kommenden Spielplänen gibt es Reihe 4
 * nur einmal (Kat. 1), deshalb genügen Reihe und Platznummer.
 */
export function mussFreiBleiben(sitz: { reihe: string; name: string }): boolean {
  return sitz.reihe.trim() === "4" && sitz.name.trim() === "3";
}

/** Ein Stück Reihe: eine Gruppe oder ein Zielblock. */
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
  /**
   * Der hintere Teil, wenn die Gruppe als Block auf zwei Reihen sitzt:
   * vorne in "ziel", direkt dahinter in "ziel2".
   */
  ziel2?: Bereich;
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
  /** Mitte des Saals, meist der Mittelgang. */
  mitte: number;
  reihenTief: number;
  aussenFrei: number;
}

export interface Empfehlung {
  reihen: Reihe[];
  zone: Spielzone;
  /** Alle Gruppen, die ausserhalb der Zone sitzen. */
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

/** Bestimmt die spielbare Zone: vordere Reihen, ohne die äusseren Plätze. */
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

  const l = Number.isFinite(links) ? links : 0;
  const r = Number.isFinite(rechts) ? rechts : 0;

  return {
    reihen,
    sitze,
    links: l,
    rechts: r,
    oben: Number.isFinite(oben) ? oben : 0,
    unten: Number.isFinite(unten) ? unten : 0,
    mitte: (l + r) / 2,
    reihenTief: REIHEN_TIEF,
    aussenFrei: AUSSEN_FREI,
  };
}

/**
 * Der übliche Abstand zweier Nachbarplätze in einer Reihe.
 *
 * Gebraucht, um den Mittelgang zu erkennen: Dort ist der Abstand
 * deutlich grösser. Genommen wird der mittlere Abstand, denn Gänge sind
 * die Ausnahme.
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

/** Wird dieser Gast umgesetzt? */
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
 * Die Gruppen einer Reihe, die umgesetzt werden sollen.
 *
 * Alles, was nebeneinander verkauft ist und ausserhalb der Zone sitzt,
 * gilt als eine Gruppe. Ein Gang oder ein freier Platz dazwischen trennt.
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

/** Rechnet die Empfehlung für einen Abend aus. */
export function empfehlung(plan: Saalplan): Empfehlung {
  const reihen = reihenBilden(plan);

  // Die Empore zählt nicht mit. Sie wird an schwachen Abenden ohnehin
  // geschlossen, und niemand sitzt dort.
  const parkett = reihen.filter((r) => !NICHT_ZIEL.test(r.sektor));
  const zone = spielzone(parkett);

  /*
    Quelle sind nur die Reihen hinter der Zone.

    Wer in einer Zonenreihe sitzt, sitzt gut, auch wenn sein Platz weit
    aussen liegt. Ihn umzusetzen waere kein Gewinn, sondern nur Unruhe
    beim Einlass, und es nimmt jemandem den Platz weg, der ihn noetiger
    braucht.
  */
  const hinterDerZone = parkett.filter((r) => !zone.reihen.includes(r));
  const gruppen = hinterDerZone.flatMap(gruppenDerReihe);

  /*
    Die letzte Reihe zuerst, dann die vorletzte, dann die drittletzte.

    Wer am weitesten hinten sitzt, hat das Upgrade am nötigsten. Reicht
    der Platz in der Zone nicht für alle, sollen die davon haben, die
    sonst am schlechtesten sitzen. Innerhalb einer Reihe die grösseren
    Gruppen zuerst, denn für sie gibt es die wenigsten Blöcke am Stück.
  */
  const reihenfolge = [...gruppen].sort((a, b) => {
    const dy = b.reihe.y - a.reihe.y;
    return dy !== 0 ? dy : b.sitze.length - a.sitze.length;
  });

  const belegt = new Set<number>();
  const umzuege: Umzug[] = [];
  const bleiben: Bereich[] = [];

  /*
    Zweite Stufe: über den Rand der Zone hinaus.

    Florian, 19.09.2026: Eine Gruppe mit sieben Leuten blieb in Reihe 9
    sitzen, obwohl Reihe 5 von Platz 2 bis 8 frei war. Nur Platz 2 lag
    ausserhalb der Zone. Eine Gruppe hinten ist schlimmer als ein Gast
    knapp neben dem gestrichelten Kasten. Deshalb: Findet sich in der Zone
    nichts, dürfen die äusseren Plätze der Zonenreihen mitgenutzt werden,
    solange mindestens die Hälfte des Blocks in der Zone liegt. Jeder Platz
    ausserhalb kostet Punkte, damit der Block so weit innen wie möglich liegt.
  */
  const breit = breiteZone(zone);

  for (const gruppe of reihenfolge) {
    const ziel =
      bestenBlockSuchen(zone, gruppe.sitze.length, belegt, gruppe.reihe.y) ??
      bestenBlockSuchen(breit, gruppe.sitze.length, belegt, gruppe.reihe.y, zone.sitze);
    if (ziel) {
      for (const s of ziel.sitze) belegt.add(s.id);
      umzuege.push({ gruppe, ziel });
      continue;
    }
    /*
      Dritte Stufe: als Block auf zwei Reihen.

      Florian, 19.09.2026: "Du kannst aus einer Reihe auch einen Block
      machen, dann sitzen sie genau hintereinander." Sieben Leute passen
      nicht am Stück in eine Reihe, aber vier vorne und drei direkt
      dahinter. Getrennt ist dabei niemand, sie sitzen zusammen, nur in
      zwei Reihen statt in einer.
    */
    const block =
      blockAufZweiReihen(zone, gruppe.sitze.length, belegt, gruppe.reihe.y) ??
      blockAufZweiReihen(breit, gruppe.sitze.length, belegt, gruppe.reihe.y, zone.sitze);
    if (block) {
      for (const s of [...block.vorne.sitze, ...block.hinten.sitze]) belegt.add(s.id);
      umzuege.push({ gruppe, ziel: block.vorne, ziel2: block.hinten });
      continue;
    }
    bleiben.push(gruppe);
  }

  // Für die Ansage von vorne nach hinten sortieren, damit der Mitarbeiter
  // die Liste von oben nach unten abarbeiten kann.
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
    gruppen,
    umzuege,
    bleiben,
    gaeste: umzuege.reduce((n, u) => n + u.gruppe.sitze.length, 0),
    freiInZone,
  };
}

/**
 * Eine Gruppe als Block auf zwei aufeinanderfolgenden Reihen: vorne die
 * grössere Hälfte, direkt dahinter der Rest, Platz für Platz genau
 * hintereinander. Erst ab drei Personen, ein Paar sitzt nebeneinander.
 */
function blockAufZweiReihen(
  zone: Spielzone,
  groesse: number,
  belegt: Set<number>,
  hoechstensBis: number,
  kern?: Set<number>,
): { vorne: Bereich; hinten: Bereich } | null {
  if (groesse < 3) return null;
  const nVorne = Math.ceil(groesse / 2);
  const nHinten = groesse - nVorne;
  const frei = (s: Sitz) => alsZielMoeglich(s, zone) && !belegt.has(s.id);
  const istBelegt = (s: Sitz) => s.status === "verkauft" || belegt.has(s.id);

  let bester: { vorne: Bereich; hinten: Bereich } | null = null;
  let bestePunkte = -Infinity;

  for (let i = 0; i + 1 < zone.reihen.length; i++) {
    const r1 = zone.reihen[i];
    const r2 = zone.reihen[i + 1];
    // Auch der hintere Teil darf nicht hinter der alten Reihe liegen.
    if (r2.y > hoechstensBis + 0.5) continue;
    const abstand = sitzabstand(r1);
    const innen1 = r1.sitze.filter((s) => zone.sitze.has(s.id));
    const innen2 = r2.sitze.filter((s) => zone.sitze.has(s.id));

    const amStueck = (f: Sitz[]) => f.every((s, k) => k === 0 || nebeneinander(f[k - 1], s, abstand));

    for (let a = 0; a + nVorne <= innen1.length; a++) {
      const vorne = innen1.slice(a, a + nVorne);
      if (!vorne.every(frei) || !amStueck(vorne)) continue;

      // Der hintere Teil sitzt genau hinter einem Teil des vorderen.
      for (let b = 0; b + nHinten <= innen2.length; b++) {
        const hinten = innen2.slice(b, b + nHinten);
        if (!hinten.every(frei) || !amStueck(hinten)) continue;
        const genauDahinter = hinten.every((h) => vorne.some((v) => Math.abs(v.x - h.x) <= abstand * 0.6));
        if (!genauDahinter) continue;

        const alle = [...vorne, ...hinten];
        const draussen = kern ? alle.filter((s) => !kern.has(s.id)).length : 0;
        if (draussen * 2 > alle.length) continue;

        // Vorne, mittig, nah an anderen, wenig ausserhalb.
        const mitteX = alle.reduce((n, s) => n + s.x, 0) / alle.length;
        const halbeBreite = Math.max(1, (zone.rechts - zone.links) / 2);
        const mittig = 1 - Math.min(1, Math.abs(mitteX - zone.mitte) / halbeBreite);
        const vorneWert = zone.reihen.length > 1 ? 1 - i / (zone.reihen.length - 1) : 1;
        let nachbarn = 0;
        for (const [reihe, teil] of [[r1, vorne], [r2, hinten]] as const) {
          const i0 = reihe.sitze.indexOf(teil[0]);
          const i1 = reihe.sitze.indexOf(teil[teil.length - 1]);
          for (const n of [reihe.sitze[i0 - 1], reihe.sitze[i1 + 1]]) if (n && istBelegt(n)) nachbarn++;
        }
        const punkte = vorneWert * 6 + mittig * 4 + nachbarn * 2 - draussen * 3;
        if (punkte > bestePunkte) {
          bestePunkte = punkte;
          bester = { vorne: zuBereich(r1, vorne), hinten: zuBereich(r2, hinten) };
        }
      }
    }
  }
  return bester;
}

/** Die Zonenreihen in voller Breite, für die zweite Stufe der Suche. */
function breiteZone(zone: Spielzone): Spielzone {
  const sitze = new Set<number>();
  for (const r of zone.reihen) {
    for (const s of r.sitze) {
      if (ROLLSTUHL.test(s.sektor) || ROLLSTUHL.test(s.kategorie)) continue;
      sitze.add(s.id);
    }
  }
  return { ...zone, sitze };
}

/**
 * Sucht den besten freien Block einer bestimmten Grösse in der Zone.
 *
 * Mit "kern" wird in einer breiteren Zone gesucht: Mindestens die Hälfte
 * des Blocks muss dann im Kern liegen, und jeder Platz ausserhalb kostet.
 *
 * Bewertet wird jedes Fenster als Ganzes, denn eine Gruppe zieht als
 * Ganzes um.
 */
function bestenBlockSuchen(
  zone: Spielzone,
  groesse: number,
  belegt: Set<number>,
  hoechstensBis: number,
  kern?: Set<number>,
): Bereich | null {
  let bester: Bereich | null = null;
  let bestePunkte = -Infinity;

  const istBelegt = (s: Sitz) => s.status === "verkauft" || belegt.has(s.id);
  const reiheBelegt = (r: Reihe | undefined) =>
    Boolean(r) && r!.sitze.some((s) => zone.sitze.has(s.id) && istBelegt(s));

  // Bis wohin reicht der besetzte Bereich nach hinten? Eine Reihe
  // dahinter anzufangen, während davor noch Platz ist, reisst den Block
  // auseinander.
  let letzteBelegte = -1;
  zone.reihen.forEach((r, i) => {
    if (reiheBelegt(r)) letzteBelegte = i;
  });

  zone.reihen.forEach((reihe, reihenIndex) => {
    /*
      Niemals nach hinten setzen.

      Eine Reihe weiter hinten ist ein Downgrade, auch wenn der Platz
      mittiger liegt. Wer vorne aussen sitzt, kann deshalb nur innerhalb
      seiner eigenen Reihe nach innen rutschen oder bleibt, wo er ist.
      Ein halber Millimeter Spielraum, weil die Reihen ihre Lage aus dem
      Mittelwert ihrer Sitze beziehen.
    */
    if (reihe.y > hoechstensBis + 0.5) return;

    const abstand = sitzabstand(reihe);
    const frei = (s: Sitz) => alsZielMoeglich(s, zone) && !belegt.has(s.id);
    const innen = reihe.sitze.filter((s) => zone.sitze.has(s.id));

    for (let start = 0; start + groesse <= innen.length; start++) {
      const fenster = innen.slice(start, start + groesse);

      if (!fenster.every(frei)) continue;
      let zusammenhaengend = true;
      for (let i = 1; i < fenster.length; i++) {
        if (!nebeneinander(fenster[i - 1], fenster[i], abstand)) zusammenhaengend = false;
      }
      if (!zusammenhaengend) continue;

      const draussen = kern ? fenster.filter((s) => !kern.has(s.id)).length : 0;
      if (draussen * 2 > fenster.length) continue;

      const iErster = reihe.sitze.indexOf(fenster[0]);
      const iLetzter = reihe.sitze.indexOf(fenster[fenster.length - 1]);
      const links = reihe.sitze[iErster - 1];
      const rechts = reihe.sitze[iLetzter + 1];
      const linksDran = links && nebeneinander(links, fenster[0], abstand);
      const rechtsDran = rechts && nebeneinander(fenster[fenster.length - 1], rechts, abstand);

      // Unmittelbarer Anschluss, ohne Gang dazwischen.
      let anschluss = 0;
      if (linksDran && istBelegt(links)) anschluss++;
      if (rechtsDran && istBelegt(rechts)) anschluss++;

      /*
        Anschluss über den Mittelgang hinweg.

        Zählt genauso viel wie ein echter Nachbar. Von der Bühne aus
        wirkt ein Publikum, das links und rechts am Gang sitzt,
        geschlossen: Der Gang ist keine Lücke, er ist ein Weg.

        Zählte er weniger, wanderten die Gäste vom Gang weg nach aussen,
        weil dort der einzige lückenlose Nachbar sitzt. Genau das war der
        Fehler, der im Saalplan aufgefallen ist.
      */
      let ueberGang = 0;
      if (links && !linksDran && istBelegt(links)) ueberGang++;
      if (rechts && !rechtsDran && istBelegt(rechts)) ueberGang++;

      /*
        Senkrechter Anschluss: Sitzt in der Reihe davor oder dahinter
        jemand auf denselben Plätzen, wächst der Block in die Tiefe statt
        nur in die Breite.
      */
      const davor = zone.reihen[reihenIndex - 1];
      const dahinter = zone.reihen[reihenIndex + 1];
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

      // Weiter vorne ist besser.
      const vorne = zone.reihen.length > 1 ? 1 - reihenIndex / (zone.reihen.length - 1) : 1;

      /*
        Mittig im Saal ist besser, und zwar deutlich.

        Gemessen wird nicht der Block für sich, sondern die Reihe, wie sie
        nach dem Setzen dasteht: der Schwerpunkt aller besetzten Plätze
        dieser Reihe. Das ist der Unterschied zwischen "der Block liegt
        mittig" und "die Reihe sieht mittig aus", und nur das zweite ist
        das Ziel.

        Ein Beispiel aus einem echten Abend. Sechs Plätze in derselben
        Reihe, einmal so und einmal so:

            ..DDEEFF....     Schwerpunkt links vom Gang
            .DDEEFF.....     Schwerpunkt auf dem Gang

        Für den Block allein gerechnet sind beide gleich gut. Von der
        Bühne aus ist es das zweite, das voll aussieht.
      */
      const halbeBreite = Math.max(1, (zone.rechts - zone.links) / 2);
      let summeX = 0;
      let anzahl = 0;
      for (const q of innen) {
        if (istBelegt(q) || fenster.includes(q)) {
          summeX += q.x;
          anzahl++;
        }
      }
      const schwerpunkt = anzahl > 0 ? summeX / anzahl : zone.mitte;
      const mittig = 1 - Math.min(1, Math.abs(schwerpunkt - zone.mitte) / halbeBreite);

      /*
        Keine Reihe auslassen, und das wiegt schwerer als alles andere.

        Eine leere Reihe mitten im besetzten Bereich ist von der Bühne aus
        ein Streifen quer durch das Publikum. Ein voll besetzter erster
        Rang hilft nichts, wenn dahinter eine Reihe klafft. Deshalb hat
        das Schliessen einer solchen Lücke Vorrang vor der Nähe zur Bühne.
      */
      const reiheLeer = !reiheBelegt(reihe);
      const luecke = reiheLeer && reihenIndex < letzteBelegte ? 1 : 0;
      const uebersprungen = reiheLeer && reihenIndex > letzteBelegte + 1 ? 1 : 0;

      // Ein einzelner freier Stuhl zwischen zwei Besetzten ist der
      // hässlichste Fall im ganzen Saal.
      let luecken = 0;
      if (linksDran && !istBelegt(links)) {
        const davorSitz = reihe.sitze[iErster - 2];
        if (!davorSitz || !nebeneinander(davorSitz, links, abstand) || istBelegt(davorSitz)) {
          luecken++;
        }
      }
      if (rechtsDran && !istBelegt(rechts)) {
        const danach = reihe.sitze[iLetzter + 2];
        if (!danach || !nebeneinander(rechts, danach, abstand) || istBelegt(danach)) luecken++;
      }

      const punkte =
        anschluss * 5 +
        ueberGang * 5 +
        senkrecht * 4 +
        mittig * 4 +
        luecke * 14 -
        uebersprungen * 10 +
        vorne * 6 -
        luecken * 2.5 -
        draussen * 3;

      if (punkte > bestePunkte) {
        bestePunkte = punkte;
        bester = zuBereich(reihe, fenster);
      }
    }
  });

  return bester;
}

/**
 * Platzvorschläge für die Gästeliste (migrations/038_gaesteliste.sql).
 *
 * Gäste von der Gästeliste haben kein Ticket und keinen Platz. Sie werden
 * vor Ort gesetzt, und zwar nach den Upgrades in das, was in der
 * spielbaren Zone dann noch frei ist. Dieselben Regeln wie für die
 * Upgrades: am Stück, nah an den anderen, mittig und vorne.
 *
 * Die größten Gruppen zuerst, denn für sie gibt es die wenigsten Blöcke.
 * Findet sich keiner, bleibt der Vorschlag leer, und das Showteam setzt
 * sie vor Ort, wo es passt.
 */
export function gaestePlaetze(
  rat: Empfehlung,
  gaeste: Array<{ id: string; anzahl: number }>,
): Map<string, Bereich | null> {
  const belegt = new Set<number>();
  for (const u of rat.umzuege) for (const s of [...u.ziel.sitze, ...(u.ziel2?.sitze ?? [])]) belegt.add(s.id);

  /*
    Zweite Wahl: das ganze Parkett. Ist in der Zone kein Block am Stück frei,
    ist ein Platz weiter hinten oder aussen immer noch besser als keiner.
    Gleiche Bewertung, also möglichst vorne, mittig und nah an den anderen.
  */
  const parkett = rat.reihen.filter((r) => !NICHT_ZIEL.test(r.sektor));
  const weit: Spielzone = {
    ...rat.zone,
    reihen: parkett,
    sitze: new Set(parkett.flatMap((r) => r.sitze.map((s) => s.id))),
  };

  const ergebnis = new Map<string, Bereich | null>();
  for (const g of [...gaeste].sort((a, b) => b.anzahl - a.anzahl)) {
    const ziel =
      bestenBlockSuchen(rat.zone, g.anzahl, belegt, Number.POSITIVE_INFINITY) ??
      bestenBlockSuchen(breiteZone(rat.zone), g.anzahl, belegt, Number.POSITIVE_INFINITY, rat.zone.sitze) ??
      bestenBlockSuchen(weit, g.anzahl, belegt, Number.POSITIVE_INFINITY);
    if (ziel) for (const s of ziel.sitze) belegt.add(s.id);
    ergebnis.set(g.id, ziel);
  }
  return ergebnis;
}
