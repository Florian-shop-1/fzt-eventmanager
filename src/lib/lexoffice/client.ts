/**
 * Zugang zur Lexware-Office-Schnittstelle (früher lexoffice).
 *
 * Wichtig zum Verständnis:
 *  - Das Tor liegt seit Mai 2025 unter api.lexware.io, die alte Adresse
 *    developers.lexoffice.io wurde abgeschaltet.
 *  - Der Schlüssel wird unter app.lexware.de/addons/public-api erzeugt und
 *    steht in der Umgebungsvariable LEXOFFICE_API_KEY. Niemals in den Code.
 *  - Erlaubt sind zwei Anfragen pro Sekunde. Deshalb drosselt dieser Client
 *    selbst, statt sich auf Glück zu verlassen.
 */

export const LEXWARE_BASIS = "https://api.lexware.io";

/** Mindestabstand zwischen zwei Anfragen in Millisekunden (2 pro Sekunde). */
const MINDESTABSTAND_MS = 550;
let letzteAnfrage = 0;

export class LexofficeFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rumpf?: unknown,
  ) {
    super(message);
    this.name = "LexofficeFehler";
  }
}

function schluessel(): string {
  const k = process.env.LEXOFFICE_API_KEY;
  if (!k) {
    throw new Error(
      "LEXOFFICE_API_KEY ist nicht gesetzt. Schlüssel unter " +
        "https://app.lexware.de/addons/public-api erzeugen und in .env.local eintragen.",
    );
  }
  return k;
}

async function drosseln(): Promise<void> {
  const wartezeit = letzteAnfrage + MINDESTABSTAND_MS - Date.now();
  if (wartezeit > 0) await new Promise((r) => setTimeout(r, wartezeit));
  letzteAnfrage = Date.now();
}

/** Ruft die Schnittstelle auf und wandelt Fehler in verständliche Meldungen. */
export async function lexoffice<T>(
  pfad: string,
  optionen: { methode?: string; rumpf?: unknown; akzeptiere?: string } = {},
): Promise<T> {
  await drosseln();

  const antwort = await fetch(LEXWARE_BASIS + pfad, {
    method: optionen.methode ?? "GET",
    headers: {
      Authorization: `Bearer ${schluessel()}`,
      Accept: optionen.akzeptiere ?? "application/json",
      ...(optionen.rumpf ? { "Content-Type": "application/json" } : {}),
    },
    body: optionen.rumpf ? JSON.stringify(optionen.rumpf) : undefined,
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    let rumpf: unknown;
    try {
      rumpf = await antwort.json();
    } catch {
      rumpf = await antwort.text().catch(() => undefined);
    }
    throw new LexofficeFehler(erklaerung(antwort.status), antwort.status, rumpf);
  }

  if (antwort.status === 204) return undefined as T;
  return (await antwort.json()) as T;
}

/** Übersetzt die häufigsten Fehlerfälle in Klartext. */
function erklaerung(status: number): string {
  switch (status) {
    case 401:
      return "Der API-Schlüssel wird nicht akzeptiert. Ist er richtig eingetragen und noch gültig?";
    case 403:
      return (
        "Der Schlüssel hat für diesen Bereich keine Berechtigung. Bei Angeboten hilft " +
        "meist, unter app.lexware.de/addons/public-api einen neuen Schlüssel zu erzeugen: " +
        "ältere Schlüssel dürfen keine Angebote anlegen."
      );
    case 404:
      return "Der angefragte Eintrag existiert in lexoffice nicht.";
    case 406:
      return "Die Anfrage passt nicht zu dem, was die Schnittstelle erwartet.";
    case 429:
      return "Zu viele Anfragen in kurzer Zeit. Bitte einen Moment warten.";
    default:
      return `Lexware Office hat mit Fehler ${status} geantwortet.`;
  }
}

export interface LexofficeProfil {
  organizationId: string;
  companyName: string;
  created: { userId: string; userName: string; userEmail: string; date: string };
  connectionId: string;
  taxType: string;
  smallBusiness: boolean;
}

/** Kleinster möglicher Aufruf, um Schlüssel und Verbindung zu prüfen. */
export async function holeProfil(): Promise<LexofficeProfil> {
  return lexoffice<LexofficeProfil>("/v1/profile");
}
