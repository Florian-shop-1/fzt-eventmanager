/**
 * Die Anschrift einer Firma im Netz nachschlagen.
 *
 * "bitte hole die online auch einfach die richtige Adresse. Also wenn du
 * eine Firma hast und das ist plausibel online zu finden, gleich
 * eintragen, dass der Mitarbeiter es nicht machen muss" (Florian,
 * 15.10.2026).
 *
 * Eingetragen wird trotzdem nicht von selbst: Der Vorschlag erscheint im
 * Formular, mit der Quelle daneben, und ein Mensch drückt auf Speichern.
 * Eine geratene Adresse auf einem Angebot fällt dem Kunden auf, und zwar
 * genau dann, wenn es unangenehm ist.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODELL = "claude-opus-5";

export interface Adressvorschlag {
  firma: string;
  strasse: string;
  plz: string;
  ort: string;
  /** Wo das gefunden wurde, als Text für den Mitarbeiter. */
  quelle: string;
}

export function sucheMoeglich(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Sucht die Geschäftsanschrift.
 *
 * Gefunden wird nur, was eindeutig ist. Gibt es mehrere Firmen gleichen
 * Namens oder steht nirgends eine Anschrift, kommt nichts zurück.
 */
export async function adresseSuchen(o: {
  firma: string;
  /** Was sonst noch bekannt ist, etwa die Mailadresse oder der Ort. */
  hinweis?: string;
}): Promise<Adressvorschlag | null> {
  if (!sucheMoeglich() || o.firma.trim().length < 3) return null;

  const antwort = await new Anthropic().messages.create({
    model: MODELL,
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    system:
      "Du suchst die Geschäftsanschrift deutscher Firmen für ein Angebot. "
      + "Antworte am Ende ausschließlich mit einem JSON-Objekt: "
      + '{"firma": "...", "strasse": "...", "plz": "...", "ort": "...", "quelle": "..."} '
      + 'oder {"gefunden": false}. '
      + "Nimm nur eine Anschrift, die eindeutig zu dieser Firma gehört, am besten aus dem "
      + "Impressum der eigenen Website. Rate nicht. Gibt es mehrere Firmen dieses Namens oder "
      + "passt der Hinweis nicht zum Fund, antworte mit gefunden false. "
      + "In quelle gehört die Webadresse, auf der die Anschrift stand.",
    messages: [
      {
        role: "user",
        content: `Firma: ${o.firma}${o.hinweis ? `\nWeitere Angaben: ${o.hinweis}` : ""}`,
      },
    ],
  });

  const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const klammer = text.lastIndexOf("{");
  if (klammer < 0) return null;

  try {
    const roh = JSON.parse(text.slice(klammer, text.lastIndexOf("}") + 1)) as Partial<
      Adressvorschlag & { gefunden: boolean }
    >;
    if (roh.gefunden === false || !roh.strasse || !roh.ort) return null;
    return {
      firma: String(roh.firma ?? o.firma).slice(0, 200),
      strasse: String(roh.strasse).slice(0, 200),
      plz: String(roh.plz ?? "").slice(0, 10),
      ort: String(roh.ort).slice(0, 120),
      quelle: String(roh.quelle ?? "").slice(0, 300),
    };
  } catch {
    return null;
  }
}
