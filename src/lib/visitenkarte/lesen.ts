/**
 * Eine Visitenkarte ablesen.
 *
 * Anders als die Glücks-Moji-Karten ist eine Visitenkarte gedruckt, und
 * gedruckt heißt gut lesbar. Deshalb braucht es hier keinen zweiten
 * Durchgang über Nacht: Ein Blick des Modells genügt, und der Mensch
 * schaut nur noch darüber.
 *
 * Erfunden wird nichts. Was nicht auf der Karte steht, bleibt leer, und
 * wer bei der E-Mail-Adresse zweifelt, sagt es: Eine falsch gelesene
 * Adresse heißt, dass jemand unsere Magic News nie bekommt und wir es
 * nicht einmal merken.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODELL = "claude-opus-5";

export function lesenEingerichtet(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `Du liest Visitenkarten ab, die Florian Zimmer vom Florian Zimmer Theater in Neu-Ulm persönlich überreicht bekommen hat.

Gib genau wieder, was auf der Karte steht. Erfinde nichts und ergänze nichts.

- E-Mail: in Kleinbuchstaben, ohne Leerzeichen. Achte auf verwechselbare Zeichen (l/1/I, O/0, rn/m, Punkt/Bindestrich/Unterstrich) und auf die Endung der Domain.
- Vorname und Nachname getrennt. Titel wie "Dr." oder "Prof." gehören nicht in den Namen, sondern in die Position.
- Firma: der Name des Unternehmens, ohne Rechtsform-Zusätze wegzulassen. Steht keine Firma drauf, bleibt das Feld leer.
- Position: die Funktion, zum Beispiel "Geschäftsführer" oder "Leiterin Marketing", dazu akademische Titel.
- Telefon: die Nummer, die am ehesten die direkte ist. Mobil schlägt Zentrale. Schreibweise so wie gedruckt.
- Webseite: ohne "https://" und ohne abschließenden Schrägstrich.
- Adresse: Straße, PLZ und Ort in einer Zeile, falls vorhanden.

Sicherheit "sicher" heißt: Du würdest darauf wetten, dass jedes Zeichen der E-Mail-Adresse stimmt. Bei jedem Zweifel "unsicher".

Ist das Bild keine Visitenkarte oder unlesbar, setze karte_ok auf false und schreibe in den Hinweis, was zu sehen ist.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "karte_ok",
    "vorname",
    "nachname",
    "firma",
    "position",
    "email",
    "telefon",
    "webseite",
    "adresse",
    "sicherheit",
    "hinweis",
  ],
  properties: {
    karte_ok: { type: "boolean" },
    vorname: { type: "string" },
    nachname: { type: "string" },
    firma: { type: "string" },
    position: { type: "string" },
    email: { type: "string" },
    telefon: { type: "string" },
    webseite: { type: "string" },
    adresse: { type: "string" },
    sicherheit: { type: "string", enum: ["sicher", "unsicher"] },
    /** Was auffällt: zwei Adressen, eine zweite Person, nichts zu lesen. */
    hinweis: { type: "string" },
  },
} as const;

export interface Kartendaten {
  karteOk: boolean;
  vorname: string;
  nachname: string;
  firma: string;
  position: string;
  email: string;
  telefon: string;
  webseite: string;
  adresse: string;
  sicherheit: "sicher" | "unsicher";
  hinweis: string;
}

/** Liest die Karte. Wirft, wenn das Modell nicht erreichbar ist. */
export async function visitenkarteLesen(bildBase64: string, art = "image/jpeg"): Promise<Kartendaten> {
  const antwort = await anthropic().messages.create({
    model: MODELL,
    max_tokens: 700,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: art as "image/jpeg", data: bildBase64 },
          },
          { type: "text", text: "Lies diese Visitenkarte ab." },
        ],
      },
    ],
  });

  const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const d = JSON.parse(text) as Record<string, unknown>;
  const s = (k: string) => String(d[k] ?? "").trim();

  return {
    karteOk: d.karte_ok === true,
    vorname: s("vorname"),
    nachname: s("nachname"),
    firma: s("firma"),
    position: s("position"),
    email: s("email").toLowerCase().replace(/\s+/g, ""),
    telefon: s("telefon"),
    webseite: s("webseite").replace(/^https?:\/\//i, "").replace(/\/$/, ""),
    adresse: s("adresse"),
    sicherheit: d.sicherheit === "sicher" ? "sicher" : "unsicher",
    hinweis: s("hinweis"),
  };
}
