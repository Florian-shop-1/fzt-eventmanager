/**
 * Was ein Stempeltag wert ist.
 *
 * Die eine Stelle, an der aus Stempeln Arbeitszeit wird. Vorher rechnete
 * die Monatsübersicht ihre eigene Summe und die Lohnauswertung ihre
 * eigene; zwei Rechenwege für dieselbe Zahl sind einer zu viel.
 *
 * Zwei Dinge macht diese Rechnung anders als das reine Zusammenzählen
 * der Stempel (Florian, 29.09.2026):
 *
 *  1. Fehlstempel fallen heraus. Wer beim Einstempeln dreimal danebenhaut
 *     ("gekommen 19:04, gegangen 19:04, gekommen 19:04, gegangen 19:05,
 *     gekommen 19:05, gegangen 23:00"), hat um 19:05 angefangen und um
 *     23:00 aufgehört. Genau so wird es gerechnet.
 *
 *  2. Unplausible Zeiten zählen nicht, bis jemand sie bestätigt. Wer um
 *     zwei Uhr nachts einstempelt, hat entweder etwas Ungewöhnliches
 *     gemacht oder danebengegriffen. Beides muss ein Mensch ansehen, statt
 *     dass eine krumme Zahl stillschweigend in die Lohnabrechnung wandert.
 */

/** Kürzer als das ist kein Arbeiten, sondern ein Vertippen am Knopf. */
export const KURZ_MINUTEN = 3;

/**
 * Nachts zwischen diesen Uhrzeiten wird nicht gearbeitet.
 *
 * Die Spätschicht räumt nach der Show auf, das geht schon mal bis ein Uhr.
 * Ab halb drei ist Schluss mit plausibel.
 */
export const NACHT_VON = 2 * 60 + 30;
export const NACHT_BIS = 5 * 60 + 30;

/** Länger als das arbeitet niemand an einem Tag. */
export const LANGER_TAG_MINUTEN = 14 * 60;

export interface TagStempel {
  art: string;
  /** Zeitpunkt in Millisekunden. */
  ms: number;
  /** Gesetzt, wenn das Büro den Stempel angelegt oder geändert hat. */
  geaendertVon?: string | null;
}

export interface Tagesrechnung {
  arbeitMinuten: number;
  pauseMinuten: number;
  /** Gekommen, aber nie gegangen. Dann fehlt die Zeit. */
  offen: boolean;
  /** Wie viele Fehlstempel-Abschnitte herausgefallen sind. */
  fehlstempel: number;
  /** Warum der Tag nicht plausibel ist, sonst null. */
  unplausibel: string | null;
  /** Das Büro hat diesen Tag angefasst und damit bestätigt. */
  bestaetigt: boolean;
  /** Zählt der Tag in der Lohnabrechnung mit? */
  gewertet: boolean;
}

/** Silvester und Neujahr: Da wird tatsächlich nachts gearbeitet. */
export function istSilvester(tag: string): boolean {
  return tag.endsWith("-12-31") || tag.endsWith("-01-01");
}

function minutenAmTag(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Ein Tag aus seinen Stempeln.
 *
 * Erwartet die Stempel des Tages in der Reihenfolge, in der sie gesetzt
 * wurden, und den Tag als JJJJ-MM-TT für die Silvesterprüfung.
 */
export function tagRechnen(tag: string, stempel: TagStempel[]): Tagesrechnung {
  let arbeit = 0;
  let pause = 0;
  let fehlstempel = 0;
  let start: number | null = null;
  let pauseStart: number | null = null;

  /*
    Ein Abschnitt Arbeit. Ist er kürzer als drei Minuten, war es ein
    Fehlgriff und zählt nicht. Dieselbe Minute zweimal zu zählen wäre
    genauso falsch wie sie wegzulassen, aber hier geht es um Sekunden,
    nicht um Arbeitszeit.
  */
  const arbeitDazu = (von: number, bis: number) => {
    const min = (bis - von) / 60000;
    if (min < KURZ_MINUTEN) {
      fehlstempel += 1;
      return;
    }
    arbeit += min;
  };

  for (const s of stempel) {
    if (s.art === "kommen") {
      // Zweimal "kommen" hintereinander: Das erste war der Fehlgriff.
      if (start !== null) arbeitDazu(start, s.ms);
      start = s.ms;
    }
    if (s.art === "pause_start") {
      if (start !== null) arbeitDazu(start, s.ms);
      start = null;
      pauseStart = s.ms;
    }
    if (s.art === "pause_ende") {
      if (pauseStart !== null) {
        const min = (s.ms - pauseStart) / 60000;
        if (min >= KURZ_MINUTEN) pause += min;
        else fehlstempel += 1;
      }
      pauseStart = null;
      start = s.ms;
    }
    if (s.art === "gehen") {
      if (start !== null) arbeitDazu(start, s.ms);
      if (pauseStart !== null) {
        const min = (s.ms - pauseStart) / 60000;
        if (min >= KURZ_MINUTEN) pause += min;
        else fehlstempel += 1;
      }
      start = null;
      pauseStart = null;
    }
  }

  const offen = start !== null || pauseStart !== null;
  const arbeitMinuten = Math.round(arbeit);
  const pauseMinuten = Math.round(pause);

  // Was daran nicht plausibel ist.
  let unplausibel: string | null = null;
  if (!istSilvester(tag)) {
    const nachts = stempel.find((s) => {
      const m = minutenAmTag(s.ms);
      return m >= NACHT_VON && m <= NACHT_BIS;
    });
    if (nachts) {
      const uhr = new Date(nachts.ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      unplausibel = `Gestempelt um ${uhr} Uhr nachts`;
    }
  }
  if (!unplausibel && arbeitMinuten > LANGER_TAG_MINUTEN) {
    unplausibel = `${Math.round(arbeitMinuten / 60)} Stunden an einem Tag`;
  }

  const bestaetigt = stempel.some((s) => Boolean(s.geaendertVon));

  return {
    arbeitMinuten,
    pauseMinuten,
    offen,
    fehlstempel,
    unplausibel,
    bestaetigt,
    // Gewertet wird, was vollständig und plausibel ist. Ein unplausibler
    // Tag zählt erst, wenn das Büro ihn angefasst und damit bestätigt hat.
    gewertet: !offen && (!unplausibel || bestaetigt),
  };
}

/**
 * Schichten ueber Mitternacht dem richtigen Tag zuordnen.
 *
 * Wer um 17 Uhr kommt und nach dem Aufraeumen um 00:30 geht, hat eine
 * Schicht gearbeitet, nicht zwei halbe. Nach Kalendertagen sortiert
 * stuende am ersten Tag ein Kommen ohne Gehen und am zweiten ein Gehen
 * ohne Kommen: zwei kaputte Tage aus einer heilen Schicht
 * (Florian, 29.09.2026).
 *
 * Deshalb wandern die ersten Stempel eines Tages zum Vortag zurueck,
 * wenn dort eine Schicht offen ist und sie noch in der Nacht liegen.
 * Ein spaeteres Kommen am selben Tag beginnt wieder eine eigene Schicht.
 */
export function nachtschichtenAnhaengen<T extends { art: string; ms: number }>(
  gruppen: Array<{ datum: string; stempel: T[] }>,
): Array<{ datum: string; stempel: T[] }> {
  const sortiert = [...gruppen].sort((a, b) => a.datum.localeCompare(b.datum));

  for (let i = 1; i < sortiert.length; i++) {
    const vorher = sortiert[i - 1];
    const jetzt = sortiert[i];

    // Nur der unmittelbar folgende Kalendertag.
    const naechsterTag = new Date(`${vorher.datum}T12:00:00Z`);
    naechsterTag.setUTCDate(naechsterTag.getUTCDate() + 1);
    if (jetzt.datum !== naechsterTag.toISOString().slice(0, 10)) continue;

    // Ist am Vortag ueberhaupt eine Schicht offen geblieben?
    const letzte = vorher.stempel[vorher.stempel.length - 1];
    if (!letzte || letzte.art === "gehen") continue;

    // Alles vor dem Morgen und vor dem naechsten Kommen gehoert noch dazu.
    const umziehen: T[] = [];
    for (const s of jetzt.stempel) {
      if (s.art === "kommen") break;
      const d = new Date(s.ms);
      if (d.getHours() * 60 + d.getMinutes() > NACHT_BIS) break;
      umziehen.push(s);
      if (s.art === "gehen") break;
    }
    if (umziehen.length === 0) continue;

    vorher.stempel.push(...umziehen);
    jetzt.stempel = jetzt.stempel.slice(umziehen.length);
  }

  return sortiert.filter((g) => g.stempel.length > 0);
}
