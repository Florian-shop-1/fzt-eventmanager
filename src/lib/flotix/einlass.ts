/**
 * Tickets scannen, ohne dass jemand bei FloTix hinein muss.
 *
 * "wir müssen es so machen, dass für den mitarbeiter die anmeldung über
 * eventmanager ausreicht. wir wollen die nicht in flotix reinlassen"
 * (Florian, 29.10.2026).
 *
 * Die Tickets liegen bei FloTix, und dort wird auch entwertet: Das ist
 * ein einziger Schreibvorgang mit der Bedingung darin, zwei Handys
 * koennen nicht beide gewinnen. Hier laeuft nur die Kamera und die
 * Anmeldung. Der Eventmanager prueft, wer da steht, und spricht dann mit
 * dem gemeinsamen Schluessel fuer diese Person.
 *
 * Deshalb steht in FloTix' Protokoll bei diesen Scans kein Benutzer.
 * Drueben gibt es ihn ja nicht.
 */

import { FLOTIX_URL } from "./tuer";

export type Station = "einlass" | "restaurant" | "theke";

export interface ScanAntwort {
  ergebnis: "ok" | "schon_benutzt" | "storniert" | "falsche_vorstellung" | "falsche_station" | "unbekannt";
  titel: string;
  zeilen: string[];
  hinweise: string[];
  gast: string;
  bestellnummer: string | null;
  ticketId: string | null;
  gruppe: { gesamt: number; eingelassen: number } | null;
  achtung?: boolean;
  upgrade?: { zeilen: string[]; link: string } | null;
}

export interface EinlassVorstellung {
  id: string;
  titel: string;
  beginn: string;
  gesamt: number;
  drin: number;
}

function schluessel(): string {
  const s = (process.env.FLOTIX_KEY ?? "").trim();
  if (!s) throw new Error("FLOTIX_KEY fehlt, ohne den antwortet FloTix nicht.");
  return s;
}

async function rufen(aktion: string, rumpf?: unknown): Promise<Record<string, unknown>> {
  const antwort = await fetch(`${FLOTIX_URL}/api/eventmanager?aktion=${aktion}`, {
    method: rumpf === undefined ? "GET" : "POST",
    headers: {
      "x-eventmanager-key": schluessel(),
      ...(rumpf === undefined ? {} : { "content-type": "application/json" }),
    },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok && antwort.status !== 409) {
    throw new Error(`FloTix antwortet nicht (${antwort.status}) auf "${aktion}".`);
  }
  return (await antwort.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Die Vorstellungen, an denen gescannt wird, mit dem Stand "wie viele sind drin". */
export async function einlassVorstellungen(alle: boolean): Promise<EinlassVorstellung[]> {
  const d = await rufen(`einlass-vorstellungen${alle ? "&alle=1" : ""}`);
  const liste = Array.isArray(d.vorstellungen) ? (d.vorstellungen as Array<Record<string, unknown>>) : [];
  return liste.map((v) => ({
    id: String(v.id),
    titel: String(v.titel ?? ""),
    beginn: String(v.beginn ?? ""),
    gesamt: Number(v.gesamt ?? 0),
    drin: Number(v.drin ?? 0),
  }));
}

/** Ein Ticket pruefen und im selben Zug entwerten. */
export async function ticketScannen(o: {
  eingabe: string;
  station: Station;
  vorstellung: string;
}): Promise<ScanAntwort> {
  return (await rufen("einlass-scan", o)) as unknown as ScanAntwort;
}

/** Ein versehentliches Entwerten zuruecknehmen. */
export async function scanZuruecknehmen(ticketId: string): Promise<boolean> {
  const d = await rufen("einlass-zurueck", { ticketId });
  return d.ok === true;
}
