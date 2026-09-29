/**
 * Die Stundenliste in der Form, die ein Steuerbüro verarbeiten kann.
 *
 * Frau Buschow bekommt eine Tabelle, keine hübsche Seite: eine Zeile je
 * Mitarbeiter, Stunden als Dezimalzahl mit Komma, dazu Urlaubs- und
 * Kranktage. Das lässt sich in jedes Lohnprogramm einlesen
 * (Florian, 29.09.2026).
 */

import { alsDezimal, type Mitarbeiterzeiten } from "./auswertung";
import type { Zeitraum } from "./zeitraum";

/** Semikolon und Windows-Zeilenenden: So erwartet Excel es hierzulande. */
function zeile(felder: Array<string | number>): string {
  return felder
    .map((f) => {
      const t = String(f);
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    })
    .join(";");
}

/** Die Sammelliste: eine Zeile je Mitarbeiter. */
export function summenListe(z: Zeitraum, leute: Mitarbeiterzeiten[]): string {
  const zeilen = [
    zeile([
      "Mitarbeiter",
      "Zeitraum von",
      "Zeitraum bis",
      "Stunden",
      "Pause Stunden",
      "Arbeitstage",
      "Urlaubstage",
      "Kranktage",
      "Offene Tage",
    ]),
  ];
  for (const p of leute) {
    zeilen.push(
      zeile([
        p.name,
        z.von.split("-").reverse().join("."),
        z.bis.split("-").reverse().join("."),
        alsDezimal(p.arbeitMinuten),
        alsDezimal(p.pauseMinuten),
        p.arbeitstage,
        p.urlaubstage,
        p.kranktage,
        p.offeneTage.length,
      ]),
    );
  }
  // Die BOM, damit Excel die Umlaute richtig anzeigt. Ohne sie steht in
  // der ersten Spalte "Mitarbeiter" mit kaputten Zeichen.
  return "﻿" + zeilen.join("\r\n") + "\r\n";
}

/** Das Protokoll: eine Zeile je Tag, als Beleg zur Sammelliste. */
export function protokollListe(z: Zeitraum, leute: Mitarbeiterzeiten[]): string {
  const zeilen = [
    zeile(["Mitarbeiter", "Datum", "Art", "Kommen", "Gehen", "Stunden", "Pause Stunden", "Hinweis"]),
  ];
  for (const p of leute) {
    const tage = new Map<string, { art: string; hinweis: string }>();
    for (const a of p.abwesend) {
      tage.set(a.datum, {
        art: a.art === "urlaub" ? "Urlaub" : a.art === "krank" ? "Krank" : "Frei",
        hinweis: a.grund,
      });
    }

    for (const t of p.protokoll) {
      const kommen = t.stempel.find((s) => s.art === "kommen")?.uhrzeit ?? "";
      const gehen = [...t.stempel].reverse().find((s) => s.art === "gehen")?.uhrzeit ?? "";
      zeilen.push(
        zeile([
          p.name,
          t.datum.split("-").reverse().join("."),
          "Arbeit",
          kommen,
          gehen,
          alsDezimal(t.arbeitMinuten),
          alsDezimal(t.pauseMinuten),
          t.offen ? "Ausstempeln fehlt" : "",
        ]),
      );
      tage.delete(t.datum);
    }

    // Abwesenheitstage, an denen nicht gestempelt wurde.
    for (const [datum, e] of [...tage].sort((a, b) => a[0].localeCompare(b[0]))) {
      zeilen.push(zeile([p.name, datum.split("-").reverse().join("."), e.art, "", "", "0,00", "0,00", e.hinweis]));
    }
  }
  return "﻿" + zeilen.join("\r\n") + "\r\n";
}

/** Dateiname ohne Leerzeichen, damit nichts am Mailanhang scheitert. */
export function dateiname(z: Zeitraum, was: string, endung: string): string {
  return `Stunden-${z.schluessel}-${was}.${endung}`;
}
