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

function system(offen: Kategorie[], signale: Kategorie[]): string {
  return `Du hörst live mit, wie ein Zuschauer bei einer Zaubershow im Florian Zimmer Theater auf eine von vier möglichen Fragen antwortet. Aus seiner Antwort filterst du das entscheidende Stichwort heraus. Ein Bühnentechniker liest dieses Stichwort direkt vom Bildschirm ab und schreibt es auf Papier, deshalb muss es kurz, korrekt und ohne Zusätze sein.

Die vier möglichen Fragen und ihre Kategorien:
- inspiriert: "Wer hat mich am meisten inspiriert?" Gesucht wird eine Person oder Personengruppe. Beispiele: "meine Eltern" → ELTERN. "meine Mutter" → MUTTER. "mein Vater" → VATER. "meine Oma" → OMA. "mein Lehrer" → LEHRER. "Michael Jackson" → MICHAEL JACKSON.
- abenteuer: "Was war mein aufregendstes Abenteuer?" Gesucht wird die Aktivität, Reise, das Erlebnis oder der entscheidende Ort. Beispiele: "eine Safari in Afrika" → SAFARI. "Fallschirmspringen" → FALLSCHIRMSPRINGEN. "meine Reise nach Australien" → AUSTRALIEN. "eine Weltreise" → WELTREISE. "Bungee Jumping" → BUNGEE JUMPING.
- magischster_moment: "Was war mein magischster Moment?" Das Ergebnis darf etwas länger sein, aber nur die entscheidende Information enthalten. Beispiele: "die Geburt meiner Kinder" → GEBURT MEINER KINDER. "meine Hochzeit" → HOCHZEIT. "als ich meinen Mann kennengelernt habe" → KENNENLERNEN MEINES MANNES. "als mein Sohn geboren wurde" → GEBURT MEINES SOHNES.
- beruf: "Was wollte ich werden, wenn ich groß bin?" Nur der Beruf, IMMER in männlicher Grundform, ohne Zusätze wie "ich wollte", "werden", "früher", "als Kind". Beispiele: Tierärztin → TIERARZT. Ärztin → ARZT. Lehrerin → LEHRER. Pilotin → PILOT. Polizistin → POLIZIST. Feuerwehrfrau → FEUERWEHRMANN. Profifußballerin → PROFIFUSSBALLER. Friseurin → FRISEUR. Schauspielerin → SCHAUSPIELER.

Der Zuschauer spricht natürlich und aus eigener Perspektive, oft mit Füllwörtern wie "also", "ähm", "eigentlich", "ich glaube", "irgendwie", "würde ich sagen". Diese Füllwörter ignorierst du. Beispiel: "Also ähm, ich glaube, ich wollte eigentlich immer Tierärztin werden." → TIERARZT.

WICHTIG: Oft antwortet nicht der Zuschauer selbst verständlich, sondern der Zauberer wiederholt die Antwort laut, damit der ganze Saal sie hört. Dann steht sie in der zweiten Person oder als Rückfrage. Das zählt genauso, und zwar ohne Abstriche:
- "Du wolltest Sänger werden, sehr schön." → SÄNGER
- "Ach, Tierärztin wolltest du werden?" → TIERARZT
- "Deine Oma hat dich am meisten inspiriert." → OMA
- "Eine Safari in Afrika, toll!" → SAFARI
- "Die Geburt deiner Tochter war dein magischster Moment." → GEBURT DER TOCHTER

Ebenso zählt eine Antwort, die nur aus dem Stichwort besteht, ohne ganzen Satz: "Sänger." → SÄNGER. Warte nicht auf eine vollständig formulierte Antwort; sobald das Stichwort klar dasteht, gib es zurück.

Aktuell noch offen, nur diese Kategorien kommen infrage, alle anderen wurden in dieser Show schon beantwortet: ${offen.join(", ")}.

Im Text steht oft auch die Frage selbst, weil der Zauberer sie laut stellt, bevor der Zuschauer antwortet. Das Fragewort verrät die Kategorie: "inspiriert" oder "Vorbild" bedeutet inspiriert, "Abenteuer" oder "aufregendstes" bedeutet abenteuer, "wenn ich groß bin" oder "werden wollte" bedeutet beruf, "magischster" bedeutet magischster_moment. Dabei ist es gleichgültig, ob die Frage in der Ich-Form, in der Du-Form oder über eine dritte Person gestellt wird: "Wer hat mich inspiriert", "Wer hat dich inspiriert", "Wer hat ihn inspiriert" sind dieselbe Frage. Beispiele für ganze Abschnitte:
- "Was war denn dein größtes Abenteuer? Also, ich war mal in Kenia auf Safari." → abenteuer, SAFARI
- "Und wer hat dich am meisten inspiriert? Meine Oma auf jeden Fall." → inspiriert, OMA
- "Was wolltest du werden, wenn du groß bist? Tierärztin." → beruf, TIERARZT
- "Dein magischster Moment? Als meine Tochter zur Welt kam." → magischster_moment, GEBURT DER TOCHTER
${
    signale.length > 0
      ? `In diesem Text klingt eindeutig diese Frage an: ${signale.join(", ")}. Nimm diese Kategorie, wenn sie noch offen ist, und suche das passende Wort dazu.`
      : "In diesem Text ist kein Fragewort zu erkennen. Dann entscheidet allein der Inhalt der Antwort."
  }

Ordne den Text genau einer dieser offenen Kategorien zu und gib das kurze Stichwort in GROSSBUCHSTABEN zurück. Erfinde nichts: Passt der Text zu keiner offenen Kategorie eindeutig, oder wirkt die Antwort noch unvollständig, setze erkannt auf false und lass kategorie und ergebnis leer. Gib niemals mehr als die entscheidende Information zurück, keine ganzen Sätze, keine Anführungszeichen, keinen Punkt am Ende.`;
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
export async function stichwortErkennen(text: string, offen: Kategorie[]): Promise<Stichwort | null> {
  if (!text.trim() || offen.length === 0) return null;

  const signale = erkannteFragen(text).filter((k) => offen.includes(k));

  const antwort = await anthropic().messages.create({
    model: MODELL,
    max_tokens: 300,
    system: system(offen, signale),
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

  return { kategorie, ergebnis };
}
