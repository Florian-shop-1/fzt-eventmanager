/**
 * Plätze für eine Firmenanfrage blockieren.
 *
 * Im Haus heißt das blockieren, nicht optionieren: "bitte für kevin
 * nicht optionierte plätze nennen, sondern blockierte" (Florian,
 * 28.10.2026). In der Tür zu FloTix heißt es weiterhin Option, deshalb
 * stehen die Namen im Code so. Alles, was jemand liest, sagt blockiert.
 *
 * "wenn der kunde noch zeit braucht, sollte man auch plätze blockieren
 * können ... option so lange wie das angebot gültig ist, höchstens 7
 * tage" (Florian, 26.10.2026).
 *
 * Gehalten werden die Plätze in FloTix, dort stehen sie. Der
 * Eventmanager entscheidet nur, wie lange: Er kennt das Angebot und
 * seine Gültigkeit, und er fragt nach, wie voll der Abend schon ist.
 *
 * Je voller, desto kürzer. Einen Samstag im Dezember hält man niemandem
 * eine Woche lang frei, einen stillen Dienstag im Februar schon.
 */

import { FLOTIX_URL, flotixQuelle } from "./tuer";

export const HOECHSTENS_TAGE = 7;

function schluessel(): string {
  const k = (process.env.FLOTIX_KEY ?? "").trim();
  if (!k) throw new Error("FLOTIX_KEY fehlt, ohne den geht keine Option.");
  return k;
}

async function tuer<T>(pfad: string, koerper?: unknown): Promise<T> {
  const antwort = await fetch(`${FLOTIX_URL}/api/eventmanager?${pfad}`, {
    method: koerper ? "POST" : "GET",
    headers: {
      "x-eventmanager-key": schluessel(),
      ...(koerper ? { "content-type": "application/json" } : {}),
    },
    body: koerper ? JSON.stringify(koerper) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!antwort.ok) {
    const d = (await antwort.json().catch(() => ({}))) as { fehler?: string; grund?: string };
    throw new Error(d.grund ?? d.fehler ?? `FloTix antwortet nicht (${antwort.status}).`);
  }
  return (await antwort.json()) as T;
}

export interface Auslastung {
  plaetze: number;
  belegt: number;
  prozent: number;
}

export interface Optionsplatz {
  reihe: string;
  platz: string;
  kategorie: string;
}

export interface Option {
  vorgang: string;
  firma: string;
  vorstellungId: string;
  show: string;
  beginn: string;
  bis: string;
  plaetze: Optionsplatz[];
}

export async function auslastung(vorstellungId: string): Promise<Auslastung> {
  return tuer<Auslastung>(`aktion=auslastung&id=${encodeURIComponent(vorstellungId)}`);
}

export async function optionen(): Promise<Option[]> {
  if (!flotixQuelle()) return [];
  const d = await tuer<{ optionen?: Option[] }>("aktion=optionen");
  return d.optionen ?? [];
}

export async function optionSetzen(o: {
  vorstellungId: string;
  anzahl: number;
  firma: string;
  vorgang: string;
  bis: Date;
  /** Ausgesuchte Plaetze. Ohne sie nimmt FloTix die besten freien. */
  plaetze?: Array<{ reihe: string; platz: string }>;
}): Promise<{ gesetzt: number; fehlende: number; plaetze: Optionsplatz[] }> {
  return tuer("aktion=option-setzen", { ...o, bis: o.bis.toISOString() });
}

export async function optionVerlaengern(vorgang: string, bis: Date): Promise<{ plaetze: number }> {
  return tuer("aktion=option-verlaengern", { vorgang, bis: bis.toISOString() });
}

export async function optionAufheben(vorgang: string): Promise<{ freigegeben: number }> {
  return tuer("aktion=option-aufheben", { vorgang });
}

export interface Empfehlung {
  tage: number;
  /** Was wir dem Menschen dazu sagen. */
  grund: string;
  auslastung: Auslastung | null;
}

/**
 * Wie lange sollte man diese Plätze freihalten?
 *
 * Die Zahlen sind keine Wissenschaft, sondern eine Haltung: Je näher ein
 * Abend am Ausverkauf ist, desto teurer ist jeder Tag, an dem Plätze
 * niemandem gehören. Länger als das Angebot gilt wird nie optioniert,
 * sonst halten wir Plätze für ein Angebot frei, das längst abgelaufen
 * ist.
 */
export function empfehlung(a: Auslastung | null, gueltigBis?: Date | null): Empfehlung {
  let tage = HOECHSTENS_TAGE;
  let grund = "Der Abend ist noch offen, da ist eine Woche kein Problem.";

  if (a && a.plaetze > 0) {
    if (a.prozent >= 85) {
      tage = 2;
      grund = `Der Abend ist zu ${a.prozent} Prozent voll. Jeder Tag zählt, zwei Tage reichen.`;
    } else if (a.prozent >= 70) {
      tage = 3;
      grund = `Der Abend ist zu ${a.prozent} Prozent voll. Drei Tage, dann entscheidet er sich.`;
    } else if (a.prozent >= 40) {
      tage = 5;
      grund = `Der Abend ist zu ${a.prozent} Prozent voll. Fünf Tage sind vertretbar.`;
    } else {
      grund = `Der Abend ist erst zu ${a.prozent} Prozent voll, da tut eine Woche nicht weh.`;
    }
  }

  // Nie länger als das Angebot gilt.
  if (gueltigBis) {
    const bisTage = Math.ceil((gueltigBis.getTime() - Date.now()) / 86400000);
    if (bisTage > 0 && bisTage < tage) {
      tage = bisTage;
      grund += ` Das Angebot gilt ohnehin nur noch ${bisTage} ${bisTage === 1 ? "Tag" : "Tage"}.`;
    }
  }

  return { tage: Math.max(1, Math.min(HOECHSTENS_TAGE, tage)), grund, auslastung: a };
}
