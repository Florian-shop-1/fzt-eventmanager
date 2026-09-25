/**
 * Zahlungseingänge den Rechnungen zuordnen.
 *
 * Die wichtigste Regel steht am Anfang, weil sie über allem steht: Im
 * Zweifel wird nichts zugeordnet. Eine Rechnung fälschlich auf "bezahlt"
 * zu setzen ist schlimmer, als einen Zahlungseingang liegen zu lassen:
 * Das eine fällt niemandem auf, das andere sieht jeder in der Liste
 * "nicht zugeordnet" (Florian, 22.09.2026).
 *
 * Automatisch zugeordnet wird deshalb nur, wenn beides stimmt:
 *  - im Verwendungszweck steht genau eine Rechnungsnummer, die es gibt
 *  - der Betrag passt zur offenen Summe dieser Rechnung, oder er ist
 *    kleiner (dann ist es eine Teilzahlung)
 *
 * Alles andere kommt als Vorschlag auf den Tisch: gleicher Betrag,
 * gleicher Name, bekannte IBAN, zeitliche Nähe. Entschieden wird dann
 * von Hand.
 *
 * Abbuchungen (negative Beträge) werden nie mit Kundenrechnungen
 * verrechnet. Auf einer Rechnung liegt Geld, das hereinkommt.
 */

import type { BankUmsatz, Rechnung } from "./db";

export interface Vorschlag {
  rechnung: Rechnung;
  /** 0 bis 100, je höher desto sicherer. */
  punkte: number;
  gruende: string[];
}

/**
 * Rechnungsnummern aus einem Verwendungszweck.
 *
 * Erfasst die Formen, die im Haus vorkommen: RE-2026-10-01-01 aus dem
 * Eventmanager, RE-2026-0142 aus Lexware und V-0926-012 für Vorgänge.
 * Punkte, Schrägstriche und fehlende Bindestriche stören nicht.
 */
export function nummernAusText(text: string): string[] {
  const roh = text.toUpperCase().replace(/[.\s/]+/g, "-");
  const treffer = new Set<string>();
  for (const m of roh.matchAll(/\b(RE|RG|V)-?([0-9]{2,4}(?:-?[0-9]{1,4}){1,3})\b/g)) {
    treffer.add(`${m[1]}-${m[2]}`.replace(/-+/g, "-"));
  }
  return [...treffer];
}

/** Vergleicht zwei Nummern großzügig: ohne Trennzeichen, ohne Groß- und Kleinschreibung. */
function gleicheNummer(a: string, b: string): boolean {
  const k = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return k(a) === k(b);
}

/** Wie ähnlich sind zwei Namen? 0 bis 1, grob, aber robust gegen Rechtsformen. */
export function namensNaehe(a: string, b: string): number {
  const putzen = (s: string) =>
    s
      .toLowerCase()
      .replace(/gmbh|ug|ag|kg|ohg|e\.?\s?k\.?|co\.?|mbh|&|\.|,/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const x = putzen(a);
  const y = putzen(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const worteX = new Set(x.split(" ").filter((w) => w.length > 2));
  const worteY = y.split(" ").filter((w) => w.length > 2);
  if (worteX.size === 0 || worteY.length === 0) return 0;
  const treffer = worteY.filter((w) => worteX.has(w)).length;
  return treffer / Math.max(worteX.size, worteY.length);
}

function tageDazwischen(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000));
}

/**
 * Vorschläge für einen Zahlungseingang, der beste zuerst.
 * Stornierte und schon vollständig bezahlte Rechnungen bleiben außen vor.
 */
export function vorschlaege(umsatz: BankUmsatz, rechnungen: Rechnung[]): Vorschlag[] {
  if (umsatz.betragCent <= 0) return [];
  const nummern = nummernAusText(umsatz.verwendungszweck);
  const offene = rechnungen.filter((r) => r.status !== "CANCELLED" && r.offenCent > 0);

  const liste: Vorschlag[] = [];
  for (const r of offene) {
    const gruende: string[] = [];
    let punkte = 0;

    if (nummern.some((n) => gleicheNummer(n, r.nummer))) {
      punkte += 60;
      gruende.push("Rechnungsnummer steht im Verwendungszweck");
    }

    if (umsatz.betragCent === r.offenCent) {
      punkte += 25;
      gruende.push("Betrag passt genau");
    } else if (umsatz.betragCent === r.betragCent) {
      punkte += 20;
      gruende.push("Betrag entspricht der Rechnungssumme");
    } else if (umsatz.betragCent < r.offenCent) {
      punkte += 6;
      gruende.push("könnte eine Teilzahlung sein");
    }

    const naehe = namensNaehe(umsatz.gegenname, r.kunde);
    if (naehe >= 0.85) {
      punkte += 12;
      gruende.push("Name stimmt überein");
    } else if (naehe >= 0.5) {
      punkte += 6;
      gruende.push("Name ähnelt dem Kunden");
    }

    if (r.kundeIban && umsatz.gegenIban && r.kundeIban.replace(/\s/g, "") === umsatz.gegenIban.replace(/\s/g, "")) {
      punkte += 10;
      gruende.push("IBAN ist von diesem Kunden bekannt");
    }

    const abstand = tageDazwischen(umsatz.buchungstag, r.rechnungsdatum);
    if (abstand <= 45) {
      punkte += 4;
      gruende.push("zeitlich passend");
    }

    if (punkte > 0) liste.push({ rechnung: r, punkte, gruende });
  }

  return liste.sort((a, b) => b.punkte - a.punkte).slice(0, 5);
}

export interface Entscheidung {
  /** Wenn gesetzt: diese Rechnung darf automatisch bebucht werden. */
  rechnung: Rechnung | null;
  betragCent: number;
  grund: string;
  vorschlaege: Vorschlag[];
}

/**
 * Was mit einem Zahlungseingang geschehen soll.
 *
 * Automatisch nur bei eindeutiger Nummer. Steht dieselbe Nummer nicht im
 * Text, oder passen mehrere Rechnungen gleich gut, bleibt der Eingang
 * offen und wandert mit Vorschlägen in die Liste.
 */
export function entscheiden(umsatz: BankUmsatz, rechnungen: Rechnung[]): Entscheidung {
  if (umsatz.betragCent <= 0) {
    return { rechnung: null, betragCent: 0, grund: "Abbuchung, keine Kundenzahlung", vorschlaege: [] };
  }

  const alle = vorschlaege(umsatz, rechnungen);
  const nummern = nummernAusText(umsatz.verwendungszweck);
  const mitNummer = alle.filter((v) => nummern.some((n) => gleicheNummer(n, v.rechnung.nummer)));

  if (mitNummer.length === 1) {
    const v = mitNummer[0];
    const passt = umsatz.betragCent <= v.rechnung.offenCent || umsatz.betragCent === v.rechnung.betragCent;
    if (passt) {
      return {
        rechnung: v.rechnung,
        betragCent: umsatz.betragCent,
        grund: `Rechnungsnummer ${v.rechnung.nummer} im Verwendungszweck, Betrag passt`,
        vorschlaege: alle,
      };
    }
    return {
      rechnung: null,
      betragCent: umsatz.betragCent,
      grund: `Rechnungsnummer ${v.rechnung.nummer} gefunden, aber der Betrag passt nicht`,
      vorschlaege: alle,
    };
  }

  if (mitNummer.length > 1) {
    return {
      rechnung: null,
      betragCent: umsatz.betragCent,
      grund: "Mehrere Rechnungsnummern im Verwendungszweck",
      vorschlaege: alle,
    };
  }

  return {
    rechnung: null,
    betragCent: umsatz.betragCent,
    grund: alle.length > 0 ? "Keine Rechnungsnummer im Verwendungszweck" : "Keine passende Rechnung gefunden",
    vorschlaege: alle,
  };
}
