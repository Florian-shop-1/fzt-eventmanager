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

const MODELL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function hoerzuEingerichtet(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function system(offen: Kategorie[]): string {
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

  const antwort = await anthropic().messages.create({
    model: MODELL,
    max_tokens: 300,
    system: system(offen),
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: text.trim() }],
  });

  const roh = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const lesung = JSON.parse(roh) as Lesung;
  if (!lesung.erkannt) return null;

  const kategorie = lesung.kategorie as Kategorie;
  if (!offen.includes(kategorie)) return null;

  const ergebnis = lesung.ergebnis.trim();
  if (!ergebnis) return null;

  return { kategorie, ergebnis };
}
