/**
 * Die Kreditkartenabrechnung als PDF einlesen.
 *
 * Die Kartenumsätze gibt die Bank über FinTS nicht heraus (gemessen am
 * 29.09.2026), sie kommen einmal im Monat von Hand herein. Als CSV ist
 * das ein gelöstes Problem, nur liegt im OnlineBanking die Abrechnung
 * als PDF viel näher, und Werner soll nicht suchen müssen: Beides geht
 * (Florian, 30.09.2026).
 *
 * Gelesen wird mit demselben Modell, das die Belege liest. Es bekommt
 * das PDF als Dokument und gibt die Buchungen als Liste zurück. Erfunden
 * wird nichts: Was nicht dasteht, bleibt leer.
 *
 * Eingelesen wird nur, gebucht nichts: Die Umsätze landen im selben
 * Abgleich wie die vom Konto, und ein Mensch hakt sie ab.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RoherUmsatz } from "./bankimport";

const MODELL = "claude-opus-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `Du liest die Kreditkartenabrechnung einer deutschen Bank für die Buchhaltung des Florian Zimmer Theaters ab.

Gib jede einzelne Buchung wieder, die auf der Abrechnung steht. Erfinde nichts und lass nichts weg.

- datum: das Buchungsdatum als JJJJ-MM-TT. Steht auf der Abrechnung nur Tag und Monat, nimm das Jahr aus dem Abrechnungszeitraum. Gibt es Belegdatum und Buchungsdatum, nimm das Buchungsdatum.
- betrag: der Betrag in Euro. Eine Belastung (Einkauf, Abbuchung) ist NEGATIV, eine Gutschrift oder Rückerstattung ist POSITIV. Steht die Buchung in einer Fremdwährung, nimm den belasteten Euro-Betrag.
- empfaenger: der Name des Geschäfts oder Dienstleisters, so wie er dasteht, ohne Ortszusatz und ohne Kartennummer.
- zweck: der ganze übrige Text der Zeile, etwa Ort, Land, Fremdwährungsbetrag oder Referenz. Leer, wenn es nichts weiter gibt.

Nicht als Buchung zählen: der Saldovortrag, die Zwischensumme, die Gesamtsumme, der Rechnungsbetrag und der Lastschrifteinzug des Gesamtbetrags vom Girokonto. Diese Zeilen sind keine Ausgaben, sondern die Abrechnung selbst; kämen sie mit, stünde jeder Betrag doppelt in den Büchern.

- auszug_ok: false, wenn das Dokument keine Kartenabrechnung ist oder sich die Beträge nicht sicher lesen lassen.
- karte: die letzten vier Stellen der Kartennummer, wenn sie dasteht, sonst leer.
- hinweis: kurz auf Deutsch, was unsicher oder auffällig war. Leer, wenn alles klar ist.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["auszug_ok", "karte", "hinweis", "buchungen"],
  properties: {
    auszug_ok: { type: "boolean" },
    karte: { type: "string" },
    hinweis: { type: "string" },
    buchungen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["datum", "betrag", "empfaenger", "zweck"],
        properties: {
          datum: { type: "string" },
          betrag: { type: "number" },
          empfaenger: { type: "string" },
          zweck: { type: "string" },
        },
      },
    },
  },
} as const;

interface Lesung {
  auszug_ok: boolean;
  karte: string;
  hinweis: string;
  buchungen: Array<{ datum: string; betrag: number; empfaenger: string; zweck: string }>;
}

export interface Auszugslesung {
  umsaetze: RoherUmsatz[];
  karte: string;
  hinweis: string;
}

export function auszugsleserEingerichtet(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Das PDF einer Kartenabrechnung in Umsätze übersetzen.
 *
 * Wirft, wenn das Dokument keine Abrechnung ist. Lieber eine klare
 * Absage als eine Handvoll erfundener Buchungen in den Büchern.
 */
export async function kartenauszugLesen(pdfBase64: string): Promise<Auszugslesung> {
  const antwort = await anthropic().messages.create({
    model: MODELL,
    /*
      Reichlich Platz: Eine Monatsabrechnung hat schnell achtzig Zeilen,
      und eine abgeschnittene Antwort waere schlimmer als gar keine. Sie
      saehe vollstaendig aus und waere es nicht.
    */
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: "Bitte lies alle Buchungen dieser Kartenabrechnung ab." },
        ],
      },
    ],
  });

  const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const l = JSON.parse(text) as Lesung;

  if (!l.auszug_ok) {
    throw new Error(
      l.hinweis
        ? `Das sieht nicht nach einer Kartenabrechnung aus: ${l.hinweis}`
        : "Das sieht nicht nach einer Kartenabrechnung aus.",
    );
  }

  const umsaetze: RoherUmsatz[] = [];
  for (const z of l.buchungen) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(z.datum)) continue;
    if (!Number.isFinite(z.betrag) || z.betrag === 0) continue;
    umsaetze.push({
      buchungstag: z.datum,
      betragCent: Math.round(z.betrag * 100),
      waehrung: "EUR",
      gegenname: (z.empfaenger ?? "").slice(0, 120),
      verwendungszweck: (z.zweck ?? "").slice(0, 300),
    });
  }

  return { umsaetze, karte: (l.karte ?? "").replace(/\D/g, "").slice(-4), hinweis: l.hinweis ?? "" };
}
