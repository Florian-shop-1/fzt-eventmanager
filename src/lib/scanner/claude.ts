/**
 * Zweite Lesung mit Claude, für alle Karten, bei denen Azure nicht eindeutig war.
 *
 * Läuft als Batch über Nacht: halber Preis, Ergebnis meist nach Minuten,
 * spätestens nach 24 Stunden. Florian braucht die Ergebnisse erst am
 * nächsten Tag.
 *
 * Claude liest die Karte unabhängig von Azure. Stimmen beide überein oder
 * ist Claude sicher und Azure hatte nichts Brauchbares, geht die Karte
 * ohne Menschen an Brevo. Sonst prüft jemand im Foyer.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODELL = "claude-opus-5";
/** Preise in US-Dollar je Million Tokens für claude-opus-5, im Batch halbiert. */
const PREIS_EIN = 5 / 2;
const PREIS_AUS = 25 / 2;

export function claudeEingerichtet(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `Du liest handschriftlich ausgefüllte Gewinnspielkarten ("Glücks-Moji") des Florian Zimmer Theaters in Neu-Ulm ab.

Aufbau der runden Karte: Oben gedruckt "GLÜCKS - MOJI" und drei Preise. Darunter zwei weiße Balken zum Ausfüllen:
- Erster Balken: links der Vorname, rechts der Nachname (gedruckte Beschriftung "Vorname" und "Nachname" jeweils darunter).
- Zweiter Balken: links die E-Mail-Adresse, rechts die Telefonnummer (Beschriftung "E-Mail" und "Telefonnummer" darunter).
Manche schreiben über die Balkengrenzen hinaus, vertauschen die Seiten oder schreiben nur den Vornamen.

Deine Aufgabe: Gib genau wieder, was geschrieben steht. Erfinde nichts.
- E-Mail: in Kleinbuchstaben, ohne Leerzeichen. Achte besonders auf leicht verwechselbare Zeichen (l/1/i, o/0, rn/m, u/v, n/h, a/o, e/c, Punkt/Unterstrich/Bindestrich) und auf die Domain. Eine Domain darfst du nur dann zu einem bekannten Anbieter (gmx.de, web.de, gmail.com, t-online.de ...) korrigieren, wenn die Handschrift das klar hergibt. Wenn du bei auch nur einem Zeichen zweifelst, setze die Sicherheit auf "unsicher" und nenne die plausiblen Alternativen.
- Namen: so, wie sie geschrieben sind, mit Umlauten. Übliche Schreibweisen deutscher Vornamen helfen beim Entziffern.
- Telefon: nur die Ziffern und ein führendes +, so wie geschrieben.
- Leeres Feld: leerer Text und Sicherheit "leer".
- Ist das Bild keine ausgefüllte Glücks-Moji-Karte oder komplett unleserlich, setze karte_ok auf false.
"sicher" heißt: Du würdest darauf wetten, dass jedes Zeichen stimmt.`;

const FELD = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sicherheit"],
  properties: {
    text: { type: "string" },
    sicherheit: { type: "string", enum: ["sicher", "unsicher", "leer"] },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["karte_ok", "vorname", "nachname", "email", "telefon", "email_alternativen", "hinweis"],
  properties: {
    karte_ok: { type: "boolean" },
    vorname: FELD,
    nachname: FELD,
    email: FELD,
    telefon: FELD,
    email_alternativen: { type: "array", items: { type: "string" } },
    hinweis: { type: "string", description: "Kurz auf Deutsch, was unklar war. Leer, wenn alles eindeutig ist." },
  },
} as const;

export interface ClaudeFeld {
  text: string;
  sicherheit: "sicher" | "unsicher" | "leer";
}
export interface ClaudeLesung {
  karte_ok: boolean;
  vorname: ClaudeFeld;
  nachname: ClaudeFeld;
  email: ClaudeFeld;
  telefon: ClaudeFeld;
  email_alternativen: string[];
  hinweis: string;
}

/** Schickt Karten als einen Batch. Gibt die Batch-Kennung zurück. */
export async function batchAbschicken(karten: Array<{ id: string; fotoBase64: string }>): Promise<string> {
  const batch = await anthropic().messages.batches.create({
    requests: karten.map((k) => ({
      custom_id: k.id,
      params: {
        model: MODELL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: k.fotoBase64 } },
              { type: "text", text: "Lies diese Karte ab." },
            ],
          },
        ],
      },
    })),
  });
  return batch.id;
}

export type BatchErgebnis =
  | { id: string; ok: true; lesung: ClaudeLesung; kostenCent: number }
  | { id: string; ok: false; fehler: string; nochmal: boolean };

/** Holt die Ergebnisse, sobald der Batch fertig ist. Null, solange er noch läuft. */
export async function batchAbholen(batchId: string): Promise<BatchErgebnis[] | null> {
  const stand = await anthropic().messages.batches.retrieve(batchId);
  if (stand.processing_status !== "ended") return null;

  const ergebnisse: BatchErgebnis[] = [];
  for await (const r of await anthropic().messages.batches.results(batchId)) {
    const id = r.custom_id;
    if (r.result.type !== "succeeded") {
      const nochmal = r.result.type === "expired" || r.result.type === "canceled" ||
        (r.result.type === "errored" && r.result.error.error.type !== "invalid_request_error");
      ergebnisse.push({ id, ok: false, fehler: `Claude: ${r.result.type}`, nochmal });
      continue;
    }
    const m = r.result.message;
    const kostenCent = ((m.usage.input_tokens * PREIS_EIN + m.usage.output_tokens * PREIS_AUS) / 1_000_000) * 100;
    if (m.stop_reason === "refusal" || m.stop_reason === "max_tokens") {
      ergebnisse.push({ id, ok: false, fehler: `Claude hat nicht fertig gelesen (${m.stop_reason}).`, nochmal: false });
      continue;
    }
    const text = m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      ergebnisse.push({ id, ok: true, lesung: JSON.parse(text) as ClaudeLesung, kostenCent });
    } catch {
      ergebnisse.push({ id, ok: false, fehler: "Claude hat keine lesbare Antwort geliefert.", nochmal: false });
    }
  }
  return ergebnisse;
}
