/**
 * Erste Lesung einer Karte mit Azure AI Vision (Read), kostenlos im Tarif F0:
 * 5.000 Aufrufe im Monat, höchstens 20 pro Minute.
 *
 * Azure erkennt Buchstaben, versteht aber die Karte nicht. Welche Handschrift
 * zu welchem Feld gehört, ergibt sich hier aus den gedruckten Beschriftungen
 * unter den weißen Balken: "Vorname" und "Nachname" unter dem ersten,
 * "E-Mail" und "Telefonnummer" unter dem zweiten. Die Handschrift steht
 * jeweils direkt darüber, links das eine Feld, rechts das andere.
 *
 * Weil das Foto schräg oder gedreht sein kann, wird alles in ein
 * Koordinatensystem der Karte umgerechnet: Nullpunkt ist "Vorname", die
 * x-Achse zeigt zu "Nachname".
 *
 * Findet sich eine Beschriftung nicht, gilt die Lesung als unklar, und Claude
 * übernimmt. Lieber einmal zu oft als einmal falsch.
 */

const API = "computervision/imageanalysis:analyze?features=read&api-version=2024-02-01";

interface Punkt {
  x: number;
  y: number;
}
interface Wort {
  text: string;
  confidence: number;
  boundingPolygon: Punkt[];
}
interface Zeile {
  text: string;
  words: Wort[];
}

export function azureEingerichtet(): boolean {
  return Boolean(process.env.AZURE_VISION_ENDPOINT && process.env.AZURE_VISION_KEY);
}

/** Azure hat die Anfrage gar nicht erst angenommen, meist wegen der 20 pro Minute. */
export class AzureAusgelastet extends Error {}

async function lesen(bild: Buffer): Promise<Zeile[]> {
  const basis = (process.env.AZURE_VISION_ENDPOINT ?? "").replace(/\/+$/, "");
  const antwort = await fetch(`${basis}/${API}`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_VISION_KEY ?? "",
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(bild),
    signal: AbortSignal.timeout(30000),
  });
  if (antwort.status === 429) throw new AzureAusgelastet("Azure ist gerade ausgelastet (mehr als 20 Karten pro Minute).");
  if (!antwort.ok) {
    const roh = (await antwort.text()).slice(0, 300);
    if (antwort.status === 401) throw new Error("Azure lehnt den Schlüssel ab. Stimmt AZURE_VISION_KEY bei Vercel?");
    throw new Error(`Azure konnte das Foto nicht lesen (${antwort.status}). ${roh}`);
  }
  const daten = (await antwort.json()) as { readResult?: { blocks?: Array<{ lines?: Zeile[] }> } };
  return (daten.readResult?.blocks ?? []).flatMap((b) => b.lines ?? []);
}

function mitte(p: Punkt[]): Punkt {
  return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length };
}

export interface Feldlesung {
  text: string;
  /** Kleinste Sicherheit der Wörter im Feld, 0 bis 1. 0, wenn leer. */
  sicherheit: number;
}

export interface AzureLesung {
  gefunden: boolean;
  /** Warum die Zuordnung nicht geklappt hat. */
  problem?: string;
  vorname: Feldlesung;
  nachname: Feldlesung;
  email: Feldlesung;
  telefon: Feldlesung;
}

const LEER: Feldlesung = { text: "", sicherheit: 0 };

const GEDRUCKT = /^(vorname|nachname|e-?mail|telefon(nummer)?|bitte|glücks|moji)$/i;

function feld(woerter: Array<Wort & { X: number }>, trenner = " "): Feldlesung {
  if (woerter.length === 0) return LEER;
  const sortiert = [...woerter].sort((a, b) => a.X - b.X);
  return {
    text: sortiert.map((w) => w.text).join(trenner).trim(),
    sicherheit: Math.min(...sortiert.map((w) => w.confidence)),
  };
}

/** Ordnet die gelesenen Wörter den vier Feldern zu. */
export function zuordnen(zeilen: Zeile[]): AzureLesung {
  const woerter = zeilen.flatMap((z) => z.words);
  const suche = (muster: RegExp) => woerter.find((w) => muster.test(w.text.trim()));
  const vor = suche(/^vorname$/i);
  const nach = suche(/^nachname$/i);
  const mail = suche(/^e-?mail$/i);
  const tel = suche(/^telefon(nummer)?$/i);

  const leer = (problem: string): AzureLesung => ({
    gefunden: false, problem, vorname: LEER, nachname: LEER, email: LEER, telefon: LEER,
  });
  if (!vor || !nach || !mail) return leer("Beschriftungen der Karte nicht gefunden");

  const O = mitte(vor.boundingPolygon);
  const N = mitte(nach.boundingPolygon);
  const laenge = Math.hypot(N.x - O.x, N.y - O.y);
  if (laenge < 10) return leer("Karte zu klein im Bild");
  const u = { x: (N.x - O.x) / laenge, y: (N.y - O.y) / laenge };
  const v = { x: -u.y, y: u.x };
  const inKarte = (p: Punkt) => ({
    X: (p.x - O.x) * u.x + (p.y - O.y) * u.y,
    Y: (p.x - O.x) * v.x + (p.y - O.y) * v.y,
  });

  const E = inKarte(mitte(mail.boundingPolygon));
  const h = E.Y;
  if (h < laenge * 0.1) return leer("Aufbau der Karte nicht erkannt");
  const trennX = tel ? (inKarte(mitte(tel.boundingPolygon)).X + E.X) / 2 : laenge / 2;
  const trennName = laenge / 2;

  const inBalken = (Y: number, unterkante: number) => Y > unterkante - 0.9 * h && Y < unterkante + 0.02 * h;

  const handschrift = woerter
    .filter((w) => !GEDRUCKT.test(w.text.trim()))
    .map((w) => ({ ...w, ...inKarte(mitte(w.boundingPolygon)) }));

  const oben = handschrift.filter((w) => inBalken(w.Y, 0));
  const unten = handschrift.filter((w) => inBalken(w.Y, h));

  // Im E-Mail-Balken: Was nach Telefonnummer aussieht, ist die Telefonnummer.
  // Steht rechts etwas ohne Ziffernfolge, gehört es noch zur Adresse.
  const istNummer = (t: string) => /^[+\d][\d\s/()-]*$/.test(t) && t.replace(/\D/g, "").length >= 3;
  const nummer = unten.filter((w) => w.X > trennX && istNummer(w.text));
  const adresse = unten.filter((w) => !nummer.includes(w));

  return {
    gefunden: true,
    vorname: feld(oben.filter((w) => w.X < trennName)),
    nachname: feld(oben.filter((w) => w.X >= trennName)),
    email: feld(adresse, ""),
    telefon: feld(nummer, ""),
  };
}

export async function azureLesen(bild: Buffer): Promise<AzureLesung> {
  return zuordnen(await lesen(bild));
}
