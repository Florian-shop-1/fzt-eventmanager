/**
 * Schlemmerblock-Anfragen über WhatsApp, halb automatisch.
 *
 * Jede dritte Nachricht im Posteingang dreht sich um den Schlemmerblock
 * (15 von 50 zwischen dem 14.09. und dem 23.10.2026). Bisher hat ein
 * Mensch jedes Mal dasselbe getan: Anfrage lesen, Blöcke zählen, im
 * Backend einen freien Code suchen, ihn abtippen, die Antwort schreiben.
 *
 * Das nimmt diese Datei ab, aber nur bis zum letzten Schritt: Sie legt
 * die fertige Antwort samt gezogenem Code bereit, abgeschickt wird sie
 * von Hand. "bitte bau mal die version, dass wir drübergucken"
 * (Florian, 23.10.2026). Was automatisch hinausgeht, verschenkt im
 * Zweifel Freikarten, und das soll erst laufen, wenn wir zwei Wochen
 * lang gesehen haben, wie gut die Erkennung trifft.
 *
 * Die Regeln, nach denen hier entschieden wird, stammen von Florian
 * (23.10.2026):
 *
 *  - Ein Block, ein Code. Mehrere Blöcke sind in Ordnung.
 *  - Ab vier Blöcken übernimmt ein Mensch, ohne Vorschlag.
 *  - Der Block muss gültig sein. Steht der Jahrgang nicht in der
 *    Nachricht, wird zuerst danach gefragt, im Zweifel mit Foto. Erst
 *    danach gibt es einen Code.
 *  - Der Gutschein aus dem Buch fürs Essen gilt bei uns nicht mehr.
 */

import { flotixCodeZiehen } from "@/lib/flotix/tuer";

/** Ab hier übernimmt ein Mensch. */
export const VIELE_BLOECKE = 4;

/**
 * Bis wann ein Jahrgang gilt (Florian, 24.10.2026).
 *
 * Der Block 2025/2026 gilt bis zum 1. Dezember 2026, der Block
 * 2026/2027 bis zum 1. Dezember 2027. Die Regel ist also immer
 * dieselbe: erster Dezember des späteren Jahres. Genau diese spätere
 * Jahreszahl liest jahrgangLesen aus "2025,26" oder "2026/27" heraus.
 */
export function gueltigBis(jahrgang: number): string {
  return `${jahrgang}-12-01`;
}

/**
 * Bis wann ein gezogener Code gelten soll, als Zeitpunkt für FloTix.
 *
 * "wir könnten doch in den code dann gleich das ablaufdatum mit rein
 * machen, dass diese auch nicht gebunkert werden können" (Florian,
 * 27.10.2026). Genau so: Der Code läuft mit dem Block ab, aus dem er
 * stammt. Wer ihn ein Jahr liegen lässt, hätte den Abriss dazu ohnehin
 * nicht mehr, und eine Freikarte ohne Abriss gibt es nicht.
 *
 * Der 1. Dezember zählt noch mit, der Code endet also in der Nacht
 * darauf. Im Dezember gilt in Deutschland immer MEZ, deshalb 23 Uhr UTC.
 */
export function gueltigBisZeitpunkt(jahrgang: number): string {
  return new Date(Date.UTC(jahrgang, 11, 1, 23, 0, 0)).toISOString();
}

/**
 * Der späteste Block, der heute überhaupt im Umlauf sein kann.
 *
 * Steht der Jahrgang nicht in der Nachricht, wird trotzdem ein Datum
 * eingetragen, sonst gilt der Code ewig. Genommen wird das großzügigste,
 * das heute noch plausibel ist: Vor dem 1. Dezember sind das die Blöcke
 * bis zum nächsten Jahr, danach die bis zum Jahr darauf.
 */
export function jahrgangImUmlauf(heute = new Date()): number {
  const tag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(heute);
  const jahr = Number(tag.slice(0, 4));
  return tag > gueltigBis(jahr) ? jahr + 2 : jahr + 1;
}

/**
 * Muss nach dem Jahrgang gefragt werden?
 *
 * "beim schlemmerblock /whats app brauchst du nicht nach dem jahrgang
 * fragen. erst nach dem 1.12. machen wir das" (Florian, 29.10.2026).
 *
 * Bis zum 1. Dezember gelten beide Blöcke, die im Umlauf sind: Der alte
 * läuft genau an diesem Tag ab, der neue erst ein Jahr später. Die
 * Frage hätte also keine Folge, sie kostet nur einen Gang hin und her,
 * bevor der Gast seinen Code hat. Ab dem 2. Dezember ist sie wieder
 * nötig, denn dann ist der alte Block ungültig und eine Freikarte
 * darauf wäre verschenkt.
 */
export function jahrgangNachfragen(heute = new Date()): boolean {
  const tag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(heute);
  return tag > gueltigBis(Number(tag.slice(0, 4)));
}

/** Der Block in der Schreibweise des Hauses: "2025/2026". */
export function blockName(jahrgang: number): string {
  return `${jahrgang - 1}/${jahrgang}`;
}

/** Gilt ein Block dieses Jahrgangs heute noch? */
export function jahrgangGueltig(jahrgang: number, heute = new Date()): boolean {
  const tag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(heute);
  return tag <= gueltigBis(jahrgang);
}

/**
 * Wo der Schlemmerblock überhaupt gilt.
 *
 * Nur bei ULMFASSBAR, Magic Memories und Flo-Zirkus, nicht an
 * Feiertagen, nicht vom 24. bis 31. Dezember und nicht bei Sonderveranstaltungen (Florian, 24.10.2026, ergaenzt 30.10.2026).
 * Beim Einlösen prüft FloTix dasselbe noch einmal, siehe dort
 * src/codes.ts: Diese Liste hier dient nur der Auskunft.
 */
export const GILT_BEI = "ULMFASSBAR, Magic Memories und Flo-Zirkus";
export const GILT_NICHT_BEI =
  "an Feiertagen, nicht vom 24. bis 31. Dezember und nicht bei Sonderveranstaltungen";

export interface SchlemmerBefund {
  /** Geht es überhaupt um den Schlemmerblock? */
  trifft: boolean;
  /** Wie viele Blöcke genannt sind. Null heißt: steht nicht da. */
  bloecke: number | null;
  /** Der genannte Jahrgang, falls einer dasteht. */
  jahrgang: number | null;
  /**
   * Warum ein Mensch das selbst machen soll.
   *
   * Leer heißt: Der Vorschlag darf gebaut werden. Sonst steht hier der
   * Grund, und zwar in ganzen Worten, damit er im Posteingang steht.
   */
  fuerMenschen: string;
}

/*
  Woran eine Schlemmerblock-Anfrage zu erkennen ist.

  "Gutschein" allein reicht ausdrücklich NICHT: Wer nach seinem
  Geschenkgutschein von uns fragt, darf keine Freikarte bekommen. Deshalb
  zählt nur das Buch selbst, in den Schreibweisen, die wirklich
  ankommen: Schlemmerblock, Gutscheinbuch, Gutscheinheft, Freizeitblock,
  Kundenkarte.
*/
/*
  Die Mehrzahl zaehlt mit.

  "4 Tickets mit zwei Schlemmerblöcken" (Markus, 25.10.2026) ging hier
  durchs Netz: Das Muster kannte nur den Block, nicht die Blöcke. Die
  Nachricht landete beim alten Baustein mit dem Platzhalter, und der
  fertige Entwurf mit Code entstand nie. Gezählt wurde die Mehrzahl
  schon immer richtig, siehe bloeckeZaehlen; nur hereingelassen wurde
  sie nicht.
*/
const ERKENNT =
  /schlemmer\s*bl(?:o|ö)ck\w*|gutschein(?:buch|b(?:ü|u)cher|heft\w*)|freizeit\s?block\w*|kundenkarte\w*/i;

/** Zahlwörter, wie sie in den Nachrichten stehen. */
const ZAHLWORT: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6,
};

/**
 * Wie viele Blöcke genannt sind.
 *
 * Gezählt wird nur, was direkt am Buch steht: "2 Schlemmerblöcke",
 * "zwei Gutscheinbücher", "2x den Schlemmerblock". Freie Zahlen im Text
 * bleiben außen vor, denn die meinen fast immer Personen, Plätze,
 * Uhrzeiten oder ein Datum. "Wir sind 6 Personen" darf nicht zu sechs
 * Freikarten werden.
 */
export function bloeckeZaehlen(text: string): number | null {
  const t = text.toLowerCase();
  /*
    Wie das Buch in den Nachrichten heisst, inklusive Mehrzahl:
    Schlemmerblock, Schlemmerbloecke, Gutscheinbuch, Gutscheinbuecher,
    Gutscheinheft, Freizeitblock, Kundenkarte.
  */
  const buch =
    "(?:schlemmer\\s*bl(?:o|\u00f6)ck\\w*|gutschein(?:buch|b(?:\u00fc|u)cher|heft\\w*)|freizeit\\s?block\\w*|kundenkarte\\w*)";
  const zahl = "(\\d{1,2}|" + Object.keys(ZAHLWORT).join("|") + ")";

  for (const muster of [
    // "2 Schlemmerbloecke", "2x den Schlemmerblock", "zwei Gutscheinbuecher"
    new RegExp(`${zahl}\\s*(?:x|mal|st(\u00fc|u)ck)?\\s*(?:den|die|das|mal)?\\s*${buch}`, "i"),
    /*
      "zwei Gutscheine vom Schlemmerblock": Hier steht die Zahl am
      Gutschein, nicht am Buch. Gezaehlt wird trotzdem richtig, weil das
      Buch unmittelbar dahinter steht (22.10.2026).
    */
    new RegExp(`${zahl}\\s*gutschein\\w*\\s*(?:vom|von|aus dem|des|im)\\s*(?:dem\\s*)?${buch}`, "i"),
    // "Gutscheine: 2 Stueck"
    new RegExp(`${buch}[^.!?\\n]{0,24}?${zahl}\\s*st(\u00fc|u)ck`, "i"),
  ]) {
    const treffer = muster.exec(t);
    const roh = treffer?.[1];
    if (!roh) continue;
    const n = /^\d+$/.test(roh) ? Number(roh) : ZAHLWORT[roh];
    if (n && n >= 1 && n <= 20) return n;
  }

  // Mehrzahl ohne Zahl ist eine Aussage, aber keine Menge.
  if (/bl(o|\u00f6)cke|b(\u00fc|u)cher|hefte/i.test(t)) return null;
  // Einzahl ohne Zahl: genau einer.
  return ERKENNT.test(t) ? 1 : null;
}

/**
 * Der Jahrgang des Blocks, falls er dasteht.
 *
 * Nur eine Zahl, die beim Buch steht, zaehlt: "Schlemmerblock 2026",
 * "Gutscheinbuch 2025/26". Eine freie Jahreszahl im Text ist fast immer
 * ein Showtermin, und auf einen Showtermin hin einen Code zu verschenken
 * waere der teuerste Fehler dieser Automatik.
 *
 * Bei einer Saison ("2025,26") zaehlt das spaetere Jahr: Bis dahin gilt
 * der Block.
 */
export function jahrgangLesen(text: string): number | null {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const buch =
    "(?:schlemmer\\s*bl(?:o|\u00f6)ck\\w*|gutschein(?:buch|b(?:\u00fc|u)cher|heft\\w*)|freizeit\\s?block\\w*|kundenkarte\\w*)";

  // "Schlemmerblock 2025,26" oder "Schlemmerblock 2026"
  const nah = new RegExp(`${buch}\\s*(?:von|aus|f(\u00fc|u)r)?\\s*(20\\d{2})(?:\\s*[,/-]\\s*(\\d{2}|20\\d{2}))?`, "i").exec(t);
  if (nah) {
    const erstes = Number(nah[2]);
    const zweites = nah[3] ? (nah[3].length === 2 ? 2000 + Number(nah[3]) : Number(nah[3])) : null;
    return zweites && zweites > erstes ? zweites : erstes;
  }

  // "2026er Block", "Block von 2026"
  const davor = new RegExp(`(20\\d{2})\\s*(?:er)?\\s*${buch}`, "i").exec(t);
  return davor ? Number(davor[1]) : null;
}

export function schlemmerErkennen(text: string, heute = new Date()): SchlemmerBefund {
  const sauber = (text ?? "").trim();
  if (!ERKENNT.test(sauber)) {
    return { trifft: false, bloecke: null, jahrgang: null, fuerMenschen: "" };
  }

  const bloecke = bloeckeZaehlen(sauber);
  const jahrgang = jahrgangLesen(sauber);

  /*
    Eine Störung ist keine Anfrage.

    "Leider funktioniert der 2. Gutscheincode nicht" (21.10.2026) sieht
    fuer die Erkennung aus wie eine Bestellung und ist das Gegenteil.
    Dasselbe gilt fuer Fragen zum Essensgutschein aus dem Buch.
  */
  if (/funktioniert (der |ein )?(code )?nicht|geht nicht|klappt nicht|fehler|abgelehnt/i.test(sauber)) {
    return { trifft: true, bloecke, jahrgang, fuerMenschen: "Da stimmt etwas mit einem Code nicht." };
  }
  if (/essen|men(ü|ue)|speise/i.test(sauber) && /gutschein/i.test(sauber)) {
    return {
      trifft: true,
      bloecke,
      jahrgang,
      fuerMenschen:
        "Hier geht es um das Essen aus dem Buch. Das A-la-carte-Angebot aus dem Block 2025/2026 " +
        "gibt es nicht mehr; stattdessen lässt sich zu jedem Showticket das 4-Gang-Menü für 69 Euro dazubuchen.",
    };
  }
  if (bloecke !== null && bloecke >= VIELE_BLOECKE) {
    return { trifft: true, bloecke, jahrgang, fuerMenschen: `${bloecke} Blöcke auf einmal.` };
  }
  /*
    Ein abgelaufener Block ist eine Absage, und die schreibt ein
    Mensch. Die Kulanz bei abgelaufenen Gutscheinen gilt für unsere
    eigenen, nicht für das Buch eines Partners.
  */
  if (jahrgang !== null && !jahrgangGueltig(jahrgang, heute)) {
    return {
      trifft: true,
      bloecke,
      jahrgang,
      fuerMenschen: `Der Block ${jahrgang - 1}/${jahrgang} galt nur bis zum 1. Dezember ${jahrgang}.`,
    };
  }

  return { trifft: true, bloecke, jahrgang, fuerMenschen: "" };
}

/**
 * Freie Codes holen. Der Weg dorthin steht in flotix/tuer.ts.
 *
 * Zwei Dinge gehen mit hinaus, und beide stehen danach in FloTix:
 *
 * Der Vermerk, an WEN der Code ging, und zwar mit der Kennung, unter
 * der der Mensch bei uns schreibt. Bis zum 27.10.2026 stand dort nur
 * sein WhatsApp-Name, und damit ließ sich später nicht beantworten, ob
 * diese Nummer schon versorgt war.
 *
 * Und das Ablaufdatum: Der Code gilt so lange wie der Block, aus dem er
 * stammt, höchstens.
 */
export async function codesZiehen(
  anzahl: number,
  an: string,
  zusatz: { name?: string | null; jahrgang?: number | null } = {},
): Promise<{ codes: string[]; rest: number; gueltigBis: string | null }> {
  const jahrgang = zusatz.jahrgang ?? null;
  const name = (zusatz.name ?? "").trim();
  const notiz = [
    `WhatsApp ${an}`,
    name && name !== an ? `(${name})` : "",
    jahrgang ? `Block ${blockName(jahrgang)}` : "Block unbekannt",
  ].filter(Boolean).join(" ");

  return flotixCodeZiehen(anzahl, an, {
    notiz: notiz.slice(0, 200),
    gueltigBis: gueltigBisZeitpunkt(jahrgang ?? jahrgangImUmlauf()),
  });
}

function anrede(vorname: string): string {
  return vorname ? `Hallo ${vorname},` : "Hallo,";
}

/**
 * Die Rückfrage nach dem Jahrgang.
 *
 * Ohne gültigen Block keine Freikarte, und ob er gültig ist, wissen wir
 * erst, wenn wir den Jahrgang kennen. "könnten sie ein foto schicken im
 * zweifel und du guckst es an" (Florian, 23.10.2026).
 *
 * Gefragt wird nach dem UMSCHLAG, nicht nach der Gutscheinseite: Auf dem
 * Cover steht der Jahrgang groß, und das liest sich auch auf einem
 * unscharfen Handyfoto noch (Florian, 24.10.2026). Die Gutscheinseite
 * nehmen wir natürlich trotzdem, wenn sie kommt.
 */
export function nachfrageText(vorname: string): string {
  return (
    `${anrede(vorname)}\n\n` +
    "schön, dass du deinen Schlemmerblock bei uns einlösen möchtest. Eine Frage noch, dann " +
    "schicke ich dir gleich den Code: Ist dein Block von 2025/2026 oder von 2026/2027?\n\n" +
    "Wenn du nicht sicher bist: Fotografier einfach den Umschlag von deinem Block und schick " +
    "das Bild hier herein. Auf dem Cover steht das Jahr groß drauf, das sehe ich dann sofort."
  );
}

/** Die Antwort mit Code oder Codes. */
export function antwortText(o: { vorname: string; codes: string[]; jahrgang?: number | null }): string {
  const mehrere = o.codes.length > 1;
  /*
    Die Freikarte gibt es nur zusammen mit einer regulär gekauften
    Karte, und bei zwei verschiedenen Preisen ist die günstigere die
    freie (Florian, 24.10.2026). FloTix rechnet beim Einlösen genauso.
  */
  const codeZeile = mehrere
    ? `Deine Codes: ${o.codes.join(", ")}. Jeder Code macht zu einer gekauften Karte eine zweite frei.`
    : `Dein Code: ${o.codes[0]}. Damit bekommst du zu einer regulär gekauften Karte eine zweite derselben Kategorie gratis.`;

  return (
    `${anrede(o.vorname)}\n\n` +
    `schön, dass du deinen Schlemmerblock bei uns einlösen möchtest. ${codeZeile}\n\n` +
    "So geht es: Such dir im Shop deine Plätze aus und gib den Code im letzten Schritt vor dem " +
    `Bezahlen ein${mehrere ? ", einen nach dem anderen" : ""}. Die Karte wird dann automatisch ` +
    "abgezogen.\n\n" +
    `WICHTIG: Bring bitte den Abriss aus dem Schlemmerblock am Showtag mit${mehrere ? ", für jeden Code einen" : ""}. ` +
    "Wir sammeln ihn beim Einlass ein. Ohne Abriss kommst du mit der freien Karte leider nicht " +
    "in die Show, das müssen wir streng nehmen.\n\n" +
    `Gut zu wissen: Der Block gilt bei ${GILT_BEI}, nicht ${GILT_NICHT_BEI}. Einlösen lässt er sich einmal${o.jahrgang ? `, und zwar bis zum 1. Dezember ${o.jahrgang}, so lange wie dein Block` : ", so lange wie dein Block gilt"}.\n\n` +
    "Und wenn ihr den Abend rund machen wollt: Zu jeder Karte lässt sich unser 4-Gang-Menü für " +
    "69 Euro dazubuchen, der Welcome Drink ist dabei. Das gilt auch für die freie Karte. " +
    /*
      "menüs können sie sich dazu buchen, ala carte bieten wir nicht mehr
      an" (Florian, 29.10.2026). Das gehört in den Text, sonst kommt als
      Nächstes die Frage nach der Speisekarte.
    */
    "Eine Speisekarte haben wir nicht mehr, es gibt nur dieses Menü und nur für Showgäste. Dafür " +
    "sitzt ihr vorher in Ruhe beisammen, ohne Restaurantwechsel."
  );
}
