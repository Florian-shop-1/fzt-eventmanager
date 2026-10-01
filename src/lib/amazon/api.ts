/**
 * Die Amazon-Business-Schnittstelle.
 *
 * Ein privates Amazon-Konto haengt keine Rechnung an die Bestellmail; wer
 * sie braucht, loggt sich ein und laedt sie herunter. Ein
 * Amazon-Business-Konto hat dafuer eine Schnittstelle, und die besteht
 * aus zwei Teilen (geprueft an der Dokumentation am 01.10.2026):
 *
 *  - Reconciliation-API: welche Rechnungen es gibt, mit Nummer, Datum,
 *    Betrag und Steuer.
 *    GET  /reconciliation/2021-01-08/transactions
 *    POST /reconciliation/2021-01-08/invoices
 *  - Document-API: das Rechnungs-PDF selbst, ueber einen Bericht, den man
 *    anfordert und dann abholt.
 *    POST /reports/2021-09-30/reports
 *    GET  /reports/2021-09-30/reports/{reportId}
 *    GET  /reports/2021-09-30/documents/{reportDocumentId}
 *
 * Gelesen wird nur. Es wird nichts bestellt, nichts storniert, nichts
 * zurueckgeschickt: Die Schnittstelle dient hier allein dazu, Rechnungen
 * zu holen.
 *
 * Die Zugangsdaten stehen als Umgebungsvariablen bei Vercel und nirgends
 * sonst. Sie gehoeren nicht in die Datenbank, nicht ins Frontend und
 * nicht in eine Fehlermeldung.
 */

import { gunzipSync, inflateRawSync } from "node:zlib";

/** Die Marktplaetze, die wir brauchen. Amazon.de ist der Normalfall. */
export const MARKTPLATZ_DE = "A1PA6795UKMFR9";

const BASIS: Record<string, string> = {
  eu: "https://eu.business-api.amazon.com",
  na: "https://na.business-api.amazon.com",
  fe: "https://fe.business-api.amazon.com",
};

function basis(): string {
  const region = (process.env.AMAZON_BUSINESS_REGION ?? "eu").toLowerCase();
  return BASIS[region] ?? BASIS.eu;
}

export interface AmazonZugang {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marktplatz: string;
}

/**
 * Sind die Zugangsdaten da?
 *
 * Gibt nur zurueck, ob etwas fehlt, und nennt den Namen der Variablen,
 * niemals ihren Inhalt.
 */
export function amazonEingerichtet(): { bereit: boolean; fehlt: string[] } {
  const fehlt = [
    ["AMAZON_BUSINESS_CLIENT_ID", process.env.AMAZON_BUSINESS_CLIENT_ID],
    ["AMAZON_BUSINESS_CLIENT_SECRET", process.env.AMAZON_BUSINESS_CLIENT_SECRET],
    ["AMAZON_BUSINESS_REFRESH_TOKEN", process.env.AMAZON_BUSINESS_REFRESH_TOKEN],
  ]
    .filter(([, wert]) => !String(wert ?? "").trim())
    .map(([name]) => String(name));
  return { bereit: fehlt.length === 0, fehlt };
}

function zugang(): AmazonZugang {
  const z = {
    clientId: process.env.AMAZON_BUSINESS_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.AMAZON_BUSINESS_CLIENT_SECRET?.trim() ?? "",
    refreshToken: process.env.AMAZON_BUSINESS_REFRESH_TOKEN?.trim() ?? "",
    marktplatz: process.env.AMAZON_BUSINESS_MARKTPLATZ?.trim() || MARKTPLATZ_DE,
  };
  const { bereit, fehlt } = amazonEingerichtet();
  if (!bereit) throw new Error(`Amazon Business ist nicht eingerichtet, es fehlt: ${fehlt.join(", ")}.`);
  return z;
}

/*
  Das Zugangstoken gilt eine Stunde.

  Fuer jeden Aufruf ein neues zu holen waere Verschwendung und faellt bei
  Amazon irgendwann als Fehlverhalten auf. Es bleibt deshalb im Speicher
  des Servers, bis es abläuft, und wird nie gespeichert.
*/
let merker: { token: string; bis: number } | null = null;

async function token(): Promise<string> {
  if (merker && merker.bis > Date.now() + 60_000) return merker.token;
  const z = zugang();

  const antwort = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: z.refreshToken,
      client_id: z.clientId,
      client_secret: z.clientSecret,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    // Der Fehlertext von Amazon kann den Schluessel enthalten, deshalb
    // geht hier nur der Statuscode weiter.
    throw new Error(
      `Amazon hat den Zugang abgelehnt (${antwort.status}). Bitte Client-ID, Secret und Refresh-Token prüfen.`,
    );
  }

  const d = (await antwort.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new Error("Amazon hat kein Zugangstoken zurückgegeben.");
  merker = { token: d.access_token, bis: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return merker.token;
}

async function ruf<T>(pfad: string, o: { methode?: string; koerper?: unknown } = {}): Promise<T> {
  const antwort = await fetch(`${basis()}${pfad}`, {
    method: o.methode ?? "GET",
    headers: {
      "x-amz-access-token": await token(),
      accept: "application/json",
      ...(o.koerper ? { "Content-Type": "application/json" } : {}),
    },
    body: o.koerper ? JSON.stringify(o.koerper) : undefined,
    signal: AbortSignal.timeout(60000),
  });

  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    throw new Error(`Amazon (${antwort.status}) bei ${pfad}: ${text.slice(0, 300)}`);
  }
  return (await antwort.json()) as T;
}

export interface AmazonTransaktion {
  transactionId: string;
  orderId: string;
  orderLineItemId?: string;
  shipmentId?: string;
  invoiceNumber?: string;
  transactionType?: string;
  transactionDate?: string;
  amount?: { amount?: number | string; currencyCode?: string };
  tax?: { amount?: number | string; currencyCode?: string };
  sellerName?: string;
}

/**
 * Die Umsaetze eines Zeitraums, Seite fuer Seite.
 *
 * Amazon laesst zwei Anfragen je Sekunde zu; zwischen den Seiten wird
 * deshalb kurz gewartet. Lieber ein paar Sekunden laenger als eine
 * Sperre.
 */
export async function transaktionen(von: Date, bis: Date, hoechstens = 1000): Promise<AmazonTransaktion[]> {
  const alle: AmazonTransaktion[] = [];
  let seite: string | null = null;

  do {
    const frage = new URLSearchParams({
      feedStartDate: von.toISOString(),
      feedEndDate: bis.toISOString(),
    });
    if (seite) frage.set("nextPageToken", seite);

    const d: { transactions?: AmazonTransaktion[]; nextPageToken?: string } = await ruf(
      `/reconciliation/2021-01-08/transactions?${frage.toString()}`,
    );
    alle.push(...(d.transactions ?? []));
    seite = d.nextPageToken ?? null;
    if (seite) await new Promise((r) => setTimeout(r, 600));
  } while (seite && alle.length < hoechstens);

  return alle.slice(0, hoechstens);
}

export interface AmazonRechnungsdetail {
  orderId: string;
  orderLineItemId?: string;
  shipmentId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  /** STANDARD oder CREDIT_MEMO */
  invoiceType?: string;
  invoiceTotal?: { amount?: number | string; currencyCode?: string };
  tax?: Array<{ amount?: { amount?: number | string }; rate?: number | string }>;
  sellerName?: string;
}

/**
 * Welche Rechnungen zu diesen Positionen gehoeren.
 *
 * Eine Bestellung kann mehrere Rechnungen haben, etwa wenn sie in zwei
 * Sendungen kommt oder von zwei Haendlern. Deshalb wird je Position
 * gefragt und nicht je Bestellung.
 */
export async function rechnungsdetails(
  positionen: Array<{ orderId: string; orderLineItemId?: string; shipmentId?: string }>,
): Promise<AmazonRechnungsdetail[]> {
  const ergebnis: AmazonRechnungsdetail[] = [];

  // Amazon nimmt hoechstens 25 Positionen je Anfrage.
  for (let i = 0; i < positionen.length; i += 25) {
    const paket = positionen.slice(i, i + 25);
    const d: { invoiceDetails?: AmazonRechnungsdetail[]; invoices?: AmazonRechnungsdetail[] } = await ruf(
      "/reconciliation/2021-01-08/invoices",
      { methode: "POST", koerper: { orderLineItems: paket } },
    );
    ergebnis.push(...(d.invoiceDetails ?? d.invoices ?? []));
    if (i + 25 < positionen.length) await new Promise((r) => setTimeout(r, 600));
  }

  return ergebnis;
}

/*
  Ein ZIP mit Bordmitteln auspacken.

  Das PDF kommt doppelt verpackt: erst ZIP, dann GZIP. Fuer GZIP hat Node
  alles an Bord, fuer ZIP nicht. Ein ganzes Paket dafuer aufzunehmen waere
  viel verlangt, also steht hier der kleine Leser: Er sucht das zentrale
  Verzeichnis von hinten, nimmt den ersten Eintrag und packt ihn aus.
  Mehr als "gespeichert" und "deflate" kommt in einem Amazon-ZIP nicht vor.
*/
function ausZip(daten: Buffer): Buffer {
  // Ende des zentralen Verzeichnisses suchen (Signatur 0x06054b50).
  let ende = -1;
  for (let i = daten.length - 22; i >= 0 && i > daten.length - 70000; i--) {
    if (daten.readUInt32LE(i) === 0x06054b50) {
      ende = i;
      break;
    }
  }
  if (ende < 0) throw new Error("Das Archiv von Amazon ist nicht lesbar (kein ZIP-Ende gefunden).");

  const anfangVerzeichnis = daten.readUInt32LE(ende + 16);
  const kopf = anfangVerzeichnis;
  if (daten.readUInt32LE(kopf) !== 0x02014b50) throw new Error("Das Archiv von Amazon ist nicht lesbar.");

  const verfahren = daten.readUInt16LE(kopf + 10);
  const namensLaenge = daten.readUInt16LE(kopf + 28);
  const extraLaenge = daten.readUInt16LE(kopf + 30);
  const kommentarLaenge = daten.readUInt16LE(kopf + 32);
  void extraLaenge;
  void kommentarLaenge;
  const gepackt = daten.readUInt32LE(kopf + 20);
  const anfangDatei = daten.readUInt32LE(kopf + 42);
  void namensLaenge;

  // Im lokalen Kopf stehen die tatsaechlichen Laengen der Namensfelder.
  const lokalName = daten.readUInt16LE(anfangDatei + 26);
  const lokalExtra = daten.readUInt16LE(anfangDatei + 28);
  const start = anfangDatei + 30 + lokalName + lokalExtra;
  const roh = daten.subarray(start, start + gepackt);

  if (verfahren === 0) return Buffer.from(roh);
  if (verfahren === 8) return Buffer.from(inflateRawSync(roh));
  throw new Error(`Das Archiv von Amazon nutzt ein unbekanntes Packverfahren (${verfahren}).`);
}

/**
 * Das Rechnungs-PDF zu einer Bestellung holen.
 *
 * Der Weg ist dreistufig und dauert: Bericht anfordern, warten, abholen.
 * Amazon empfiehlt, alle fuenfzehn Sekunden nachzusehen; laenger als ein
 * paar Minuten wird hier nicht gewartet, dann ist es ein Fall fuer den
 * naechsten Lauf.
 */
export async function rechnungsPdf(o: {
  orderId: string;
  orderLineItemId?: string;
  shipmentId?: string;
  invoiceId?: string;
  dokumenttyp?: "Invoice" | "CreditMemo";
  wartenMs?: number;
}): Promise<Buffer | null> {
  const z = zugang();

  const optionen: Record<string, string> = { documentType: o.dokumenttyp ?? "Invoice" };
  if (o.invoiceId) optionen.invoiceId = o.invoiceId;
  if (o.orderId) optionen.orderId = o.orderId;
  if (o.orderLineItemId) optionen.orderLineItemId = o.orderLineItemId;
  if (o.shipmentId) optionen.shipmentId = o.shipmentId;

  const bericht: { reportId?: string } = await ruf("/reports/2021-09-30/reports", {
    methode: "POST",
    koerper: {
      reportType: "GET_AB_INVOICE_PDF",
      marketplaceIds: [z.marktplatz],
      reportOptions: optionen,
    },
  });
  if (!bericht.reportId) return null;

  const frist = Date.now() + (o.wartenMs ?? 180_000);
  let dokumentId: string | null = null;

  while (Date.now() < frist) {
    await new Promise((r) => setTimeout(r, 15_000));
    const stand: { processingStatus?: string; reportDocumentId?: string } = await ruf(
      `/reports/2021-09-30/reports/${bericht.reportId}`,
    );
    if (stand.processingStatus === "DONE") {
      dokumentId = stand.reportDocumentId ?? null;
      break;
    }
    if (stand.processingStatus === "FATAL" || stand.processingStatus === "CANCELLED") {
      return null;
    }
  }
  if (!dokumentId) return null;

  const dokument: { url?: string; compressionAlgorithm?: string } = await ruf(
    `/reports/2021-09-30/documents/${dokumentId}`,
  );
  if (!dokument.url) return null;

  const datei = await fetch(dokument.url, { signal: AbortSignal.timeout(60000) });
  if (!datei.ok) throw new Error(`Das Rechnungsdokument liess sich nicht laden (${datei.status}).`);
  let roh = Buffer.from(await datei.arrayBuffer());

  // Erst gzip, dann zip, so wie Amazon es verpackt.
  if (dokument.compressionAlgorithm?.toUpperCase() === "GZIP" || (roh[0] === 0x1f && roh[1] === 0x8b)) {
    roh = Buffer.from(gunzipSync(roh));
  }
  if (roh.subarray(0, 2).toString("latin1") === "PK") {
    roh = Buffer.from(ausZip(roh));
  }

  if (roh.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error("Was Amazon geliefert hat, ist kein PDF.");
  }
  return roh;
}

/** Ein kurzer Probelauf fuer die Einrichtungsseite. */
export async function amazonProbe(): Promise<{ gut: boolean; meldung: string }> {
  try {
    const bis = new Date();
    const von = new Date(bis.getTime() - 7 * 86400000);
    const liste = await transaktionen(von, bis, 5);
    return {
      gut: true,
      meldung: `Verbindung steht. In den letzten sieben Tagen nennt Amazon ${liste.length} Umsätze.`,
    };
  } catch (f) {
    return { gut: false, meldung: f instanceof Error ? f.message : "Unbekannter Fehler." };
  }
}
