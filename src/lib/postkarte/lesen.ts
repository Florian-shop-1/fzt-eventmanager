/**
 * Eine handgeschriebene Gästepostkarte lesen und einschätzen.
 *
 * "Ich habe Tausende handgeschriebene Postkarten von Gästen ... auf der
 * öffentlichen Website möchte ich ausschließlich die außergewöhnlich
 * guten Gästebotschaften präsentieren" (Florian, 27.10.2026).
 *
 * Das Modell macht hier zwei Dinge, die streng auseinandergehalten
 * werden:
 *
 * 1. Es liest ab, was dasteht, und schätzt ein, wie gut sich die Karte
 *    für die Wand eignet.
 * 2. Es sagt, was an Persönlichem darauf steht und ungefähr wo.
 *
 * Entschieden wird daraus nichts von allein. Die Bewertung entscheidet
 * nur, ob eine Karte vorgeschlagen wird; ob sie gezeigt werden darf,
 * entscheidet der Datenschutzschritt und am Ende ein Mensch.
 *
 * Erfunden wird nichts. Ein Zitat ist wörtlich oder es ist keins, und
 * aus einem kritischen Satz wird kein begeisterter gemacht, indem die
 * Kritik wegfällt.
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

const SYSTEM = `Du liest handgeschriebene Postkarten, die Gäste nach einer Show im Florian Zimmer Theater in Neu-Ulm geschrieben haben. Florian Zimmer ist Zauberkünstler, seine Shows heißen ULMFASSBAR, Magic Memories und Flo-Zirkus (für Kinder).

DEINE AUFGABE

1. Transkribiere die Handschrift so genau wie möglich, mit Zeilenumbrüchen. Unleserliche Stellen markierst du mit [...]. Erfinde nie ein Wort, das du nicht lesen kannst.
2. Gib das beste wörtliche Zitat wieder, höchstens 300 Zeichen. Es muss Wort für Wort auf der Karte stehen. Kürze nur am Anfang oder am Ende, nie mittendrin, und nie so, dass sich der Sinn ändert. Steht nichts Zitierfähiges darauf, bleibt das Feld leer.
3. Fasse in einem Satz zusammen, was der Gast sagt.
4. Bewerte die Stimmung: begeistert, positiv, gemischt oder kritisch.
5. Bewerte von 1 bis 10, wie gut sich die Karte für eine öffentliche Gästewand eignet.
6. Nenne die Themen, die vorkommen.
7. Finde alles Personenbezogene und sage, wo es steht.

DIE BEWERTUNG

9 und 10 bekommen nur außergewöhnliche Karten: echte Begeisterung, starke Gefühle, Überraschung, "so etwas habe ich noch nie erlebt", persönliche und berührende Erlebnisse, originelle Formulierungen, etwas, das diesen Abend von anderen Veranstaltungen unterscheidet.

7 und 8: klar positiv, aber austauschbar.
4 bis 6: freundlich und belanglos ("war schön", "hat uns gefallen").
1 bis 3: neutral, kritisch, unleserlich oder ohne Aussage.

Sei streng. Eine 9 ist eine Karte, die einen Fremden neugierig macht. Von hundert Karten verdienen wenige eine 9 oder 10. Kritik wird nicht weggerundet: Eine Karte mit einem kritischen Satz bekommt höchstens eine 5, auch wenn der Rest begeistert klingt, und du schreibst die Kritik in die Zusammenfassung.

PERSONENBEZOGENES

Namen, Unterschriften, Postanschriften, Telefonnummern, E-Mail-Adressen, Kfz-Kennzeichen, Geburtstage mit Namen. Für jede Fundstelle gibst du an, was es ist, den gelesenen Text und die ungefähre Lage im Bild als Rechteck in Prozent der Bildbreite und -höhe (x, y = linke obere Ecke, b = Breite, h = Höhe). Lieber ein etwas zu großes Rechteck als ein zu kleines.

Ein Vorname allein unter einem Gruß ("Danke, Lisa") ist Personenbezug. Der Name der Show ist keiner.

Ist das Bild keine Gästepostkarte, setze karte_ok auf false.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "karte_ok",
    "transkript",
    "zitat",
    "zusammenfassung",
    "stimmung",
    "bewertung",
    "begruendung",
    "themen",
    "show",
    "personenbezug",
    "hinweis",
  ],
  properties: {
    karte_ok: { type: "boolean" },
    transkript: { type: "string" },
    zitat: { type: "string" },
    zusammenfassung: { type: "string" },
    stimmung: { type: "string", enum: ["begeistert", "positiv", "gemischt", "kritisch"] },
    /*
      Ohne minimum/maximum: Das Modell weist ein Schema mit Grenzen an
      einer Zahl ab ("For 'integer' type, properties maximum, minimum
      are not supported", 27.10.2026). Die Grenzen stehen deshalb im
      Systemtext und werden beim Einlesen noch einmal gekappt.
    */
    bewertung: { type: "integer" },
    /** Ein Satz, warum diese Zahl. Steht im Eventmanager neben der Karte. */
    begruendung: { type: "string" },
    themen: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "emotional",
          "ulmfassbar",
          "magic-memories",
          "flo-zirkus",
          "familie",
          "kinder",
          "erlebnis",
          "aussergewoehnlich",
          "essen",
          "firmenfeier",
          "geschenk",
        ],
      },
    },
    /** Welche Show gemeint ist, falls erkennbar. Sonst leer. */
    show: { type: "string" },
    personenbezug: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["art", "text", "x", "y", "b", "h"],
        properties: {
          art: {
            type: "string",
            enum: ["name", "unterschrift", "adresse", "telefon", "email", "sonstiges"],
          },
          text: { type: "string" },
          /* Prozent der Bildbreite und -höhe, siehe oben: ohne Grenzen im Schema. */
          x: { type: "number" },
          y: { type: "number" },
          b: { type: "number" },
          h: { type: "number" },
        },
      },
    },
    hinweis: { type: "string" },
  },
} as const;

export interface Fundstelle {
  art: "name" | "unterschrift" | "adresse" | "telefon" | "email" | "sonstiges";
  text: string;
  x: number;
  y: number;
  b: number;
  h: number;
}

export interface Kartenbefund {
  karteOk: boolean;
  transkript: string;
  zitat: string;
  zusammenfassung: string;
  stimmung: "begeistert" | "positiv" | "gemischt" | "kritisch";
  bewertung: number;
  begruendung: string;
  themen: string[];
  show: string;
  personenbezug: Fundstelle[];
  hinweis: string;
  roh: unknown;
}

/** Liest die Karte. Wirft, wenn das Modell nicht erreichbar ist. */
export async function postkarteLesen(bildBase64: string, art = "image/jpeg"): Promise<Kartenbefund> {
  const antwort = await anthropic().messages.create({
    model: MODELL,
    max_tokens: 2000,
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
          { type: "text", text: "Lies diese Gästepostkarte." },
        ],
      },
    ],
  });

  const text = antwort.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const d = JSON.parse(text) as Record<string, unknown>;
  const s = (k: string) => String(d[k] ?? "").trim();

  const stimmung = s("stimmung");
  return {
    karteOk: d.karte_ok === true,
    transkript: s("transkript"),
    zitat: s("zitat"),
    zusammenfassung: s("zusammenfassung"),
    stimmung: (["begeistert", "positiv", "gemischt", "kritisch"].includes(stimmung)
      ? stimmung
      : "positiv") as Kartenbefund["stimmung"],
    bewertung: Math.max(1, Math.min(10, Math.round(Number(d.bewertung ?? 0)) || 1)),
    begruendung: s("begruendung"),
    themen: Array.isArray(d.themen) ? d.themen.map(String) : [],
    show: s("show"),
    /*
      Die Rechtecke kommen in Prozent und werden hier gekappt. Ein
      Balken, der über den Rand hinausragt, ist harmlos; einer mit
      negativer Breite verschwindet, und dann stünde der Name wieder da.
    */
    personenbezug: (Array.isArray(d.personenbezug) ? (d.personenbezug as Fundstelle[]) : []).map(
      (f) => ({
        ...f,
        x: Math.max(0, Math.min(100, Number(f.x) || 0)),
        y: Math.max(0, Math.min(100, Number(f.y) || 0)),
        b: Math.max(1, Math.min(100, Number(f.b) || 0)),
        h: Math.max(1, Math.min(100, Number(f.h) || 0)),
      }),
    ),
    hinweis: s("hinweis"),
    roh: d,
  };
}

/**
 * Der Fingerabdruck einer Karte, für die Dublettenerkennung.
 *
 * Zwei Scans derselben Karte lesen sich fast gleich, aber eben nur fast:
 * ein Komma anders, ein Wort unleserlich. Deshalb wird kleingeschrieben,
 * alles außer Buchstaben fällt weg, und verglichen wird der Anfang.
 */
export function fingerabdruck(transkript: string): string {
  return transkript
    .toLowerCase()
    .replace(/[^a-zäöüß]+/g, "")
    .slice(0, 120);
}
