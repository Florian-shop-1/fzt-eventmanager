/**
 * Aus einem gespeicherten Vertrag die Lücken für den Text machen.
 *
 * An einer Stelle, weil es an drei gebraucht wird: in der Vorschau, beim
 * Mitarbeiter und beim Unterschreiben. Liefe die Umrechnung an drei
 * Stellen, stünde irgendwann in der Vorschau eine andere Zahl als im
 * unterschriebenen Vertrag.
 */

import type { Arbeitsvertrag } from "@/lib/db/arbeitsvertrag";
import type { Luecken } from "./arbeitsvertrag";

const datumDe = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");

const euro = (cent: number | null) =>
  cent === null ? "" : (cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "drei" statt "3": Im Vertrag steht die Probezeit ausgeschrieben. */
const ZAHLWORT = ["null", "einen", "zwei", "drei", "vier", "fünf", "sechs"];

/** Zahlen mit Komma, aber ohne unnötige Nullen: 17,5 statt 17,50. */
function stunden(wert: number | null): string {
  if (wert === null) return "";
  return String(Math.round(wert * 100) / 100).replace(".", ",");
}

export function luecken(v: Arbeitsvertrag): Luecken {
  const p = v.personalien ?? {};
  return {
    name: p.name ?? v.name,
    anschrift: p.anschrift ?? "",
    geburtsdatum: p.geburtsdatum ?? "",
    beginn: datumDe(v.beginn),
    ende: datumDe(v.ende),
    taetigkeit: v.taetigkeit,
    aufgaben: v.aufgaben,
    stundenlohn: v.stundenlohnCent === null ? undefined : euro(v.stundenlohnCent),
    monatsstunden: stunden(v.monatsstunden) || undefined,
    wochenstunden: stunden(v.wochenstunden) || undefined,
    festgehalt: v.festgehaltCent === null ? undefined : euro(v.festgehaltCent),
    probezeit:
      v.probezeitMonate === null
        ? undefined
        : ZAHLWORT[v.probezeitMonate] ?? String(v.probezeitMonate),
  };
}
