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
 * Postfächer, hinter denen keine Firma steht.
 *
 * Bei allen anderen Endungen gehört die Domain der Firma selbst, und
 * dort steht im Impressum die Anschrift: "du kannst über die E-Mail ja
 * auch schnell schlussfolgern, welche Firma es genau ist" (Florian,
 * 16.10.2026).
 */
const FREIE_POSTFAECHER = new Set([
  "gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net", "gmx.at", "t-online.de",
  "outlook.de", "outlook.com", "hotmail.de", "hotmail.com", "live.de", "yahoo.de", "yahoo.com",
  "icloud.com", "me.com", "aol.com", "freenet.de", "posteo.de", "mail.de", "arcor.de",
  "protonmail.com", "proton.me",
]);

/** Die Firmendomain aus einer Mailadresse, sonst null. */
export function firmendomain(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return null;
  return FREIE_POSTFAECHER.has(domain) ? null : domain;
}

/**
 * Sucht die Geschäftsanschrift.
 *
 * Gefunden wird nur, was eindeutig ist. Gibt es mehrere Firmen gleichen
 * Namens oder steht nirgends eine Anschrift, kommt nichts zurück.
 */
export async function adresseSuchen(o: {
  firma: string;
  /** Die Mailadresse des Kunden. Ihre Domain führt meist direkt zur Firma. */
  email?: string;
  /** Was sonst noch bekannt ist, etwa der Ort. */
  hinweis?: string;
}): Promise<Adressvorschlag | null> {
  const domain = o.email ? firmendomain(o.email) : null;
  if (!sucheMoeglich()) return null;
  // Ohne Firmennamen und ohne eigene Domain gibt es nichts zu suchen.
  if (o.firma.trim().length < 3 && !domain) return null;

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
      + "In quelle gehört die Webadresse, auf der die Anschrift stand. "
      + "Steht eine Domain dabei, fang dort an: Die Mailadresse des Kunden gehört zu seiner "
      + "Firma, und auf dieser Website steht das Impressum. Weicht der Firmenname dort leicht ab "
      + "(Rechtsform, Schreibweise), ist das in Ordnung; nimm dann die Schreibweise aus dem "
      + "Impressum.",
    messages: [
      {
        role: "user",
        content: [
          o.firma ? `Firma: ${o.firma}` : "Firmenname unbekannt",
          domain ? `Eigene Domain aus der Mailadresse: ${domain}` : "",
          o.email && !domain ? `Mailadresse (freies Postfach): ${o.email}` : "",
          o.hinweis ? `Weitere Angaben: ${o.hinweis}` : "",
        ]
          .filter(Boolean)
          .join(String.fromCharCode(10)),
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
