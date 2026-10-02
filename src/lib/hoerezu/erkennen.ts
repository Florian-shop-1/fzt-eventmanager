/**
 * Filtert aus einer live transkribierten Zuschauerantwort das Stichwort
 * heraus, das der Bühnentechniker backstage auf Papier schreibt.
 *
 * Läuft synchron, nicht als Batch: Der Techniker wartet während der Show
 * auf das Wort. Ein Aufruf kostet wenige Zehntel Cent, deshalb das
 * schnelle Haiku-Modell statt Opus.
 */

import Anthropic from "@anthropic-ai/sdk";
import { KATEGORIEN, type Kategorie } from "./kategorien";

/*
  Das Stichwort haengt an der Frage, nicht am Satzbau.

  "im prinzip immer gucken ob inspiriert, Abenteuer, groß bin, magischster
  erwähnt wurde und dann das passende wort dazu" (Florian, 01.10.2026).
  Die Frage stellt der Zauberer laut, und zwar jedes Mal anders: mal "wer
  hat dich inspiriert", mal "wer hat mich inspiriert", mal "das groesste
  Abenteuer", mal "was wolltest du werden, wenn du gross bist". Was immer
  gleich bleibt, ist das eine Wort darin. Danach wird hier gesucht, bevor
  das Modell ueberhaupt gefragt wird.
*/
const SIGNALE: Array<{ kategorie: Kategorie; muster: RegExp }> = [
  { kategorie: "inspiriert", muster: /inspirier|inspiration|vorbild/i },
  { kategorie: "abenteuer", muster: /abenteuer|aufregendst|verr(ü|ue)cktest/i },
  {
    kategorie: "beruf",
    muster:
      /gro(ß|ss)\s+(bin|bist|war|wird|werde|werden)|werden\s+woll|woll(te|test|ten|en)\b[^.?!]{0,40}\bwerden|berufswunsch|urspr(ü|ue)nglich\s+werden/i,
  },
  { kategorie: "magischster_moment", muster: /magischst|magische[rn]?\s+moment|zauberhaftest/i },
];

/** Welche Fragen im Text anklingen. Leer heisst: keine erkannt. */
export function erkannteFragen(text: string): Kategorie[] {
  return SIGNALE.filter((s) => s.muster.test(text)).map((s) => s.kategorie);
}

const MODELL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function hoerzuEingerichtet(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function system(offen: Kategorie[], signale: Kategorie[], schonDa: string[]): string {
  return `Du hörst live mit, wie ein Zuschauer bei einer Zaubershow im Florian Zimmer Theater auf eine von vier möglichen Fragen antwortet. Aus seiner Antwort filterst du das entscheidende Stichwort heraus. Ein Bühnentechniker liest dieses Stichwort direkt vom Bildschirm ab und schreibt es auf Papier, deshalb muss es kurz, konkret und ohne Zusätze sein.

So läuft es immer ab: Zuerst stellt der Zauberer die Frage, oft mehrmals und in verschiedenen Worten. Danach antwortet der Zuschauer, manchmal undeutlich, und der Zauberer wiederholt die Antwort laut für den Saal. Dich interessiert nur die Antwort, nie die Frage.

KONKRET UND KURZ, das ist die wichtigste Regel. Zwei, höchstens drei Wörter, und zwar die konkrete Sache, nicht die Gattung:
- "Wir waren im Legoland, Achterbahn fahren" → ACHTERBAHN oder LEGOLAND, nicht FREIZEITPARK
- "meine Reise nach Hawaii" → HAWAII, nicht REISE
- "eine Safari in Kenia" → SAFARI
- "als ich meine Frau kennengelernt habe, damals in Italien" → FRAU KENNENLERNEN oder FRAU, nicht KENNENLERNEN MEINER EHEFRAU IN ITALIEN
- "die Geburt meiner Tochter" → GEBURT TOCHTER
- "mein Fallschirmsprung über den Alpen" → FALLSCHIRMSPRUNG

Die vier möglichen Fragen und ihre Kategorien:
- inspiriert: "Wer hat dich am meisten inspiriert?" Gesucht wird eine Person. Beispiele: "meine Eltern" → ELTERN. "meine Oma" → OMA. "Michael Jackson" → MICHAEL JACKSON.
- abenteuer: "Was war dein aufregendstes Abenteuer?" Gesucht wird die konkrete Sache oder der Ort. Beispiele: "Fallschirmspringen" → FALLSCHIRMSPRINGEN. "unsere Reise nach Australien" → AUSTRALIEN. "Bungee Jumping in Neuseeland" → BUNGEE JUMPING.
- magischster_moment: "Was war dein magischster Moment?" Beispiele: "meine Hochzeit" → HOCHZEIT. "als mein Sohn geboren wurde" → GEBURT SOHN. "als ich meinen Mann kennengelernt habe" → MANN KENNENLERNEN.
- beruf: "Was wolltest du werden, wenn du groß bist?" NUR hier gilt: immer die männliche Grundform, ohne "ich wollte", "werden", "früher". Beispiele: Tierärztin → TIERARZT. Prinzessin → PRINZ. Ärztin → ARZT. Lehrerin → LEHRER. Pilotin → PILOT. Polizistin → POLIZIST. Feuerwehrfrau → FEUERWEHRMANN. Sängerin → SÄNGER. Schauspielerin → SCHAUSPIELER. In allen anderen Kategorien wird NICHT umgeformt: Bei inspiriert bleibt OMA eine Oma und MUTTER eine Mutter.

Füllwörter wie "also", "ähm", "eigentlich", "ich glaube", "irgendwie" ignorierst du. Beispiel: "Also ähm, ich glaube, ich wollte eigentlich immer Tierärztin werden." → TIERARZT.

Wiederholt der Zauberer die Antwort, zählt sie genauso:
- "Du wolltest Sänger werden, sehr schön." → SÄNGER
- "Das Legoland, Achterbahn fahren, das stell ich mir aufregend vor." → ACHTERBAHN
- "Deine Oma hat dich am meisten inspiriert." → OMA

Eine Antwort ohne ganzen Satz zählt auch: "Sänger." → SÄNGER.

Noch offen sind nur diese Kategorien, alle anderen wurden in dieser Show schon beantwortet: ${offen.join(", ")}.${
    schonDa.length > 0
      ? `

Diese Stichwörter stehen schon auf der Tafel und dürfen NIE ein zweites Mal kommen, auch nicht in anderer Schreibweise oder für eine andere Kategorie: ${schonDa.join(", ")}. Taucht im Text nur eines davon auf, ist das die alte Antwort und keine neue: setze dann erkannt auf false.`
      : ""
  }

Das Fragewort verrät die Kategorie: "inspiriert" oder "Vorbild" bedeutet inspiriert, "Abenteuer" oder "aufregendstes" bedeutet abenteuer, "wenn du groß bist" oder "werden wolltest" bedeutet beruf, "magischster" bedeutet magischster_moment. Ob die Frage in der Ich-Form, der Du-Form oder über einen Dritten gestellt wird, ist gleichgültig.${
    signale.length > 0
      ? ` In diesem Text klingt eindeutig diese Frage an: ${signale.join(", ")}. Nimm diese Kategorie, wenn sie noch offen ist, und suche das passende Wort dazu.`
      : " In diesem Text ist kein Fragewort zu erkennen. Dann entscheidet allein der Inhalt der Antwort."
  }

Steht im Text bisher nur die Frage und noch keine Antwort, setze erkannt auf false. Sobald eine Antwort erkennbar ist, gib sie zurück, auch wenn der Satz noch nicht zu Ende ist: Der Techniker wartet. Erfinde nichts. Gib das Stichwort in GROSSBUCHSTABEN zurück, zwei bis drei Wörter, ohne Anführungszeichen und ohne Punkt.`;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["erkannt", "kategorie", "ergebnis"],
  properties: {
    erkannt: { type: "boolean" },
    kategorie: { type: "string", enum: [...KATEGORIEN, ""] },
    ergebnis: { type: "string" },
  },
} as const;

interface Lesung {
  erkannt: boolean;
  kategorie: string;
  ergebnis: string;
}

export interface Stichwort {
  kategorie: Kategorie;
  ergebnis: string;
}

/**
 * Wertet ein Stück Transkript aus. Gibt null zurück, wenn nichts
 * Eindeutiges erkannt wurde oder keine Kategorie mehr offen ist, statt
 * etwas zu erfinden.
 */
export async function stichwortErkennen(
  text: string,
  offen: Kategorie[],
  schonDa: string[] = [],
): Promise<Stichwort | null> {
  if (!text.trim() || offen.length === 0) return null;

  const signale = erkannteFragen(text).filter((k) => offen.includes(k));

  const antwort = await anthropic().messages.create({
    model: MODELL,
    // Kurz halten: Es kommt ohnehin nur ein Stichwort zurueck, und jedes
    // Token kostet Zeit, auf die der Techniker wartet.
    max_tokens: 120,
    system: system(offen, signale, schonDa),
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: text.trim() }],
  });

  const roh = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const lesung = JSON.parse(roh) as Lesung;
  if (!lesung.erkannt) return null;

  let kategorie = lesung.kategorie as Kategorie;

  /*
    Steht die Frage im Text, gilt die Frage.

    Das Modell schaut auf die Antwort, und "meine Oma" klingt nach
    inspiriert, auch wenn gerade nach dem magischsten Moment gefragt war.
    Ist genau ein Fragewort gefallen, zaehlt es mehr als die Vermutung
    (Florian, 01.10.2026).
  */
  if (signale.length === 1 && kategorie !== signale[0]) kategorie = signale[0];
  if (!offen.includes(kategorie)) return null;

  const ergebnis = lesung.ergebnis.trim();
  if (!ergebnis) return null;

  /*
    Was schon auf der Tafel steht, kommt nicht noch einmal.

    Der Zauberer wiederholt die Antwort oft mehrmals, und das Modell
    liefert sie dann brav erneut (Florian, 02.10.2026).
  */
  const schlicht = (w: string) => w.toUpperCase().replace(/[^A-ZÄÖÜß ]/g, "").trim();
  if (schonDa.some((w) => schlicht(w) === schlicht(ergebnis))) return null;

  return { kategorie, ergebnis };
}
