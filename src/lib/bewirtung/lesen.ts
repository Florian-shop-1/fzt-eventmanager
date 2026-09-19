/**
 * Liest einen Restaurantbeleg mit Claude aus.
 *
 * Anders als beim Emoji-Scanner sofort und nicht als Nachtlauf: Florian
 * sitzt noch am Tisch und will den Beleg gleich fertig machen. Ein Beleg
 * kostet grob einen bis zwei Cent.
 *
 * Claude schlägt nur vor. Florian sieht Foto und Zahlen nebeneinander und
 * bestätigt, erst dann wird festgeschrieben.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODELL = "claude-opus-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `Du liest Restaurantbelege (Kassenbons, Rechnungen aus deutschen Restaurants, Cafés und Bars) für die Buchhaltung ab.

Gib genau wieder, was auf dem Beleg steht. Erfinde nichts. Wenn etwas nicht auf dem Beleg steht oder nicht lesbar ist, lass es leer bzw. setze 0.

- restaurant: Name des Lokals, wie gedruckt.
- anschrift: Straße, PLZ und Ort des Lokals in einer Zeile.
- datum: Datum der Bewirtung als JJJJ-MM-TT. uhrzeit als HH:MM, wenn vorhanden.
- brutto: Rechnungsbetrag in Euro inklusive Mehrwertsteuer, OHNE Trinkgeld. Das ist meist "Summe", "Gesamt" oder "Total".
- mwst7 und mwst19: die ausgewiesenen Steuerbeträge in Euro (nicht die Nettobeträge). Speisen im Restaurant werden seit 2026 wieder mit 7 % besteuert, Getränke mit 19 %. Nur übernehmen, was auf dem Beleg steht.
- trinkgeld: nur, wenn ein Trinkgeld auf dem Beleg gedruckt oder handschriftlich vermerkt ist, sonst 0.
- zahlart: "bar", "EC-Karte", "Kreditkarte" usw., wenn erkennbar.
- tse_vorhanden: true, wenn Angaben der technischen Sicherheitseinrichtung (TSE, Signatur, Transaktionsnummer, Seriennummer der Kasse) aufgedruckt sind.
- maschinell: true, wenn der Beleg maschinell erstellt ist (Kassenbon, Rechnungsdrucker), false bei einer handschriftlichen Quittung.
- beleg_ok: false, wenn das Bild kein Restaurantbeleg ist oder so unscharf, dass die Beträge nicht sicher lesbar sind.
- hinweis: kurz auf Deutsch, was unsicher oder auffällig war. Leer, wenn alles klar ist.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "beleg_ok",
    "restaurant",
    "anschrift",
    "datum",
    "uhrzeit",
    "brutto",
    "mwst7",
    "mwst19",
    "trinkgeld",
    "zahlart",
    "tse_vorhanden",
    "maschinell",
    "hinweis",
  ],
  properties: {
    beleg_ok: { type: "boolean" },
    restaurant: { type: "string" },
    anschrift: { type: "string" },
    datum: { type: "string" },
    uhrzeit: { type: "string" },
    brutto: { type: "number" },
    mwst7: { type: "number" },
    mwst19: { type: "number" },
    trinkgeld: { type: "number" },
    zahlart: { type: "string" },
    tse_vorhanden: { type: "boolean" },
    maschinell: { type: "boolean" },
    hinweis: { type: "string" },
  },
} as const;

export interface BelegLesung {
  beleg_ok: boolean;
  restaurant: string;
  anschrift: string;
  datum: string;
  uhrzeit: string;
  brutto: number;
  mwst7: number;
  mwst19: number;
  trinkgeld: number;
  zahlart: string;
  tse_vorhanden: boolean;
  maschinell: boolean;
  hinweis: string;
}

export function leserEingerichtet(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function belegLesen(fotoBase64: string, typ = "image/jpeg"): Promise<BelegLesung> {
  const antwort = await anthropic().messages.create({
    model: MODELL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: typ as "image/jpeg", data: fotoBase64 } },
          { type: "text", text: "Bitte lies diesen Beleg ab." },
        ],
      },
    ],
  });
  const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as BelegLesung;
}
