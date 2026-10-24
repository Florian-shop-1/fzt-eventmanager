/**
 * Den Jahrgang vom Foto des Schlemmerblocks ablesen.
 *
 * "du siehst am cover ob er 2025/2026 oder 2026/2027 ist" (Florian,
 * 24.10.2026). Auf dem Umschlag steht die Saison groß und schräg in der
 * Ecke, das liest sich auch auf einem schiefen Handyfoto. Genau deshalb
 * fragen wir nach dem Umschlag und nicht nach der Gutscheinseite.
 *
 * Gelesen wird mit demselben Modell, das die Belege liest. Es bekommt
 * das Bild und gibt eine Jahreszahl zurück oder nichts. Erfunden wird
 * nichts: Wer zweifelt, gibt null zurück, und dann fragt ein Mensch
 * nach. Ein falsch gelesener Jahrgang hieße, eine Freikarte auf einen
 * abgelaufenen Block herauszugeben.
 */

import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/lib/db/client";

const MODELL = "claude-opus-5";
const GRAPH = "https://graph.facebook.com/v25.0";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Die Bilddatei einer eingegangenen WhatsApp-Nachricht. */
export async function whatsappBild(
  nachrichtId: string,
): Promise<{ daten: Buffer; art: string } | null> {
  const [z] = (await db()`
    select typ, medien_url, medien_art, roh from wa_nachricht where id = ${nachrichtId}::uuid
  `) as Array<Record<string, unknown>>;
  if (!z || !["image", "sticker"].includes(String(z.typ))) return null;

  // Schon einmal geholt und bei uns abgelegt: von dort.
  if (z.medien_url) {
    const antwort = await fetch(String(z.medien_url), { signal: AbortSignal.timeout(20000) });
    if (antwort.ok) {
      return {
        daten: Buffer.from(await antwort.arrayBuffer()),
        art: String(z.medien_art ?? "image/jpeg"),
      };
    }
  }

  const roh = (z.roh ?? {}) as Record<string, unknown>;
  const teil = (roh[String(roh.type ?? "")] ?? {}) as Record<string, unknown>;
  const medienId = typeof teil.id === "string" ? teil.id : "";
  const token = process.env.WHATSAPP_ZUGANGSTOKEN;
  if (!medienId || !token) return null;

  const auskunft = await fetch(`${GRAPH}/${encodeURIComponent(medienId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!auskunft.ok) return null;
  const d = (await auskunft.json()) as { url?: string; mime_type?: string };
  if (!d.url) return null;

  const datei = await fetch(d.url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!datei.ok) return null;
  return {
    daten: Buffer.from(await datei.arrayBuffer()),
    art: d.mime_type ?? String(z.medien_art ?? "image/jpeg"),
  };
}

const SYSTEM = `Du siehst das Foto eines Gastes des Florian Zimmer Theaters in Neu-Ulm.

Gesucht ist der Jahrgang seines Schlemmerblocks. Das ist ein Gutscheinbuch, auf dessen Umschlag die Saison steht, meist als "2025/2026" oder "2026/2027", oft schräg in einer Ecke und manchmal auf dem Kopf.

Gib das SPAETERE der beiden Jahre zurueck, bei "2025/2026" also 2026. Steht nur eine einzelne Jahreszahl da, nimm diese.

Erfinde nichts. Wenn du die Zahl nicht sicher lesen kannst, wenn das Bild etwas anderes zeigt oder wenn mehrere Buecher darauf sind, setze gefunden auf false. Ein falsch gelesener Jahrgang kostet uns eine Freikarte.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["gefunden", "jahr", "was_steht_da"],
  properties: {
    gefunden: { type: "boolean" },
    jahr: { type: ["integer", "null"] },
    /** Was auf dem Umschlag zu lesen war, für das Protokoll. */
    was_steht_da: { type: "string" },
  },
} as const;

export interface Blocklesung {
  jahrgang: number | null;
  gelesen: string;
}

/** Liest den Jahrgang vom Bild. Null heißt: nicht sicher, bitte nachfragen. */
export async function jahrgangAusBild(bild: { daten: Buffer; art: string }): Promise<Blocklesung> {
  if (!process.env.ANTHROPIC_API_KEY) return { jahrgang: null, gelesen: "" };

  const erlaubt = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const art = erlaubt.includes(bild.art) ? bild.art : "image/jpeg";

  try {
    const antwort = await anthropic().messages.create({
      model: MODELL,
      max_tokens: 300,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: art as "image/jpeg", data: bild.daten.toString("base64") },
            },
            { type: "text", text: "Welcher Jahrgang steht auf diesem Schlemmerblock?" },
          ],
        },
      ],
    });
    const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const d = JSON.parse(text) as { gefunden: boolean; jahr: number | null; was_steht_da: string };
    const jahr = d.gefunden && typeof d.jahr === "number" ? d.jahr : null;
    // Nur plausible Jahrgänge. Alles andere ist ein Lesefehler.
    const plausibel = jahr && jahr >= 2024 && jahr <= 2030 ? jahr : null;
    return { jahrgang: plausibel, gelesen: String(d.was_steht_da ?? "") };
  } catch (f) {
    console.warn("[schlemmerblock] Foto nicht gelesen:", f);
    return { jahrgang: null, gelesen: "" };
  }
}
