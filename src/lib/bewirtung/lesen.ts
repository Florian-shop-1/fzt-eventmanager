/**
 * Liest einen Beleg mit Claude aus: Restaurant (Bewirtung) oder Einkauf.
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

export const KATEGORIEN = [
  "Bühne und Technik",
  "Deko und Ausstattung",
  "Büro und Material",
  "Werkzeug und Baumarkt",
  "Lebensmittel und Getränke",
  "Reinigung und Hygiene",
  "Fahrzeug und Tanken",
  "Reise und Parken",
  "Porto und Versand",
  "Sonstiges",
] as const;

const SYSTEM = `Du liest Kassenbons und Rechnungen deutscher Geschäfte für die Buchhaltung des Florian Zimmer Theaters (Zaubertheater mit Restaurant in Neu-Ulm) ab.

Gib genau wieder, was auf dem Beleg steht. Erfinde nichts. Wenn etwas nicht auf dem Beleg steht oder nicht lesbar ist, lass es leer bzw. setze 0.

- art: "bewirtung", wenn es ein Restaurant, Café oder eine Bar ist und dort gegessen oder getrunken wurde. Sonst "einkauf" (Baumarkt, Supermarkt, Büro, Tankstelle, Elektronik, Drogerie ...).
- restaurant: Name des Geschäfts bzw. Lokals, wie gedruckt.
- anschrift: Straße, PLZ und Ort des Geschäfts in einer Zeile.
- zweck: bei Einkäufen kurz auf Deutsch, was gekauft wurde (zum Beispiel "Farbe, Pinsel, Schrauben"). Höchstens zehn Wörter. Bei Bewirtungen leer.
- kategorie: bei Einkäufen die passendste aus: ${KATEGORIEN.join(", ")}. Bei Bewirtungen leer.
- datum: Datum des Belegs als JJJJ-MM-TT. uhrzeit als HH:MM, wenn vorhanden.
- brutto: Rechnungsbetrag in Euro inklusive Mehrwertsteuer, OHNE Trinkgeld. Das ist meist "Summe", "Gesamt" oder "Total".
- mwst7 und mwst19: die ausgewiesenen Steuerbeträge in Euro (nicht die Nettobeträge). Im Restaurant: Speisen seit 2026 mit 7 %, Getränke mit 19 %. Nur übernehmen, was auf dem Beleg steht.
- trinkgeld: nur bei Bewirtungen und nur, wenn ein Trinkgeld auf dem Beleg gedruckt oder handschriftlich vermerkt ist, sonst 0.
- zahlart: so genau wie auf dem Beleg, zum Beispiel "EC-Karte", "Girocard", "Visa", "Mastercard", "Bar", "PayPal". Leer, wenn nicht erkennbar.
- zahlweg: "karte" bei jeder Kartenzahlung (EC, Girocard, Kredit, kontaktlos, Apple Pay), "bar" bei Barzahlung (erkennbar an "Bar", "Gegeben", "Rückgeld"), "unbekannt", wenn der Beleg es nicht zeigt.
- tse_vorhanden: true, wenn Angaben der technischen Sicherheitseinrichtung (TSE, Signatur, Transaktionsnummer, Seriennummer der Kasse) aufgedruckt sind.
- maschinell: true, wenn der Beleg maschinell erstellt ist (Kassenbon, Rechnungsdrucker), false bei einer handschriftlichen Quittung.
- beleg_ok: false, wenn das Bild kein Kassenbeleg und keine Rechnung ist oder so unscharf, dass die Beträge nicht sicher lesbar sind.
- hinweis: kurz auf Deutsch, was unsicher oder auffällig war. Leer, wenn alles klar ist.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "beleg_ok",
    "art",
    "zweck",
    "kategorie",
    "zahlweg",
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
    art: { type: "string", enum: ["bewirtung", "einkauf"] },
    zweck: { type: "string" },
    kategorie: { type: "string", enum: [...KATEGORIEN, ""] },
    zahlweg: { type: "string", enum: ["karte", "bar", "unbekannt"] },
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
  art: "bewirtung" | "einkauf";
  zweck: string;
  kategorie: string;
  zahlweg: "karte" | "bar" | "unbekannt";
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
