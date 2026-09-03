/**
 * Einen Sitzplan von allen Beträgen befreien.
 *
 * Osman plant, wer wo sitzt. Dafür braucht er den vollständigen Plan mit
 * allen Gruppen, Logen und Hinweisen. Was ihn nichts angeht, ist der
 * kaufmännische Teil: Wie viel Geld eine halb belegte Loge kostet, ist
 * eine Sache zwischen uns und dem Kunden.
 *
 * Wichtig ist, dass der Hinweis selbst bleibt. Dass in Loge 4 zwei Plätze
 * frei bleiben, muss er wissen, sonst deckt er falsch ein. Nur der Betrag
 * verschwindet.
 *
 * Das passiert auf dem Server, bevor der Plan an den Browser geht. Ein
 * Ausblenden per Gestaltung würde die Zahlen trotzdem mitschicken.
 */

import type { Hinweis, Plan } from "./types";

/** Entfernt Eurobeträge aus einem Hinweistext. */
function ohneBetrag(text: string): string {
  return text
    // "Differenz 168,00 € in Rechnung stellen." fällt ganz weg.
    .replace(/\s*Differenz[^.]*\.\s*$/i, "")
    // Einzelne Beträge, falls doch einer mitten im Satz steht.
    .replace(/\s*\d{1,3}(\.\d{3})*,\d{2}\s*€/g, "")
    .trim();
}

function hinweisOhnePreis(h: Hinweis): Hinweis {
  if (h.differenzCent === undefined) return h;
  return { ...h, text: ohneBetrag(h.text), differenzCent: undefined };
}

export function planOhnePreise(plan: Plan): Plan {
  return {
    ...plan,
    hinweise: plan.hinweise.map(hinweisOhnePreis),
    differenzGesamtCent: 0,
  };
}
