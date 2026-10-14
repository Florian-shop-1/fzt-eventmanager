/**
 * Der kurze Leitfaden fürs erste Telefonat zu einer Anfrage.
 *
 * "unsere Vorgehensweise: sobald eine Anfrage da ist, zuerst mal den
 * Kunden anrufen und mit ihm sprechen. Was klar ist, muss nicht nochmal
 * gefragt werden. Einfach das Gefühl geben, dass man es verstanden hat"
 * (Florian, 14.10.2026).
 *
 * Deshalb zwei Spalten statt einer Liste: links, was der Gast schon
 * gesagt hat, rechts das, was für ein Angebot noch fehlt. Gefragt wird
 * nur, was wirklich offen ist.
 */

import type { Lead } from "./leads";

export interface Leitfaden {
  /** Was schon dasteht, zum Zurückspiegeln im Gespräch. */
  bekannt: string[];
  /** Was für ein passendes Angebot noch fehlt. */
  fragen: string[];
  /** Woran man im Gespräch denken sollte. */
  merken: string[];
}

/** Leer, "-" und "keine Angabe" heißen alle dasselbe. */
function gefuellt(wert: string | null | undefined): boolean {
  const w = (wert ?? "").trim().toLowerCase();
  return w !== "" && w !== "-" && w !== "keine angabe" && w !== "k.a." && w !== "n/a";
}

/** Steckt im Freitext schon eine Antwort auf diese Frage? */
function erwaehnt(text: string, woerter: string[]): boolean {
  const t = text.toLowerCase();
  return woerter.some((w) => t.includes(w));
}

export function leitfadenFuer(lead: Lead): Leitfaden {
  const bekannt: string[] = [];
  const fragen: string[] = [];
  const merken: string[] = [];
  const text = `${lead.kommentar ?? ""} ${lead.anfragetyp ?? ""}`;

  if (gefuellt(lead.name)) bekannt.push(`Ansprechpartner: ${lead.name}`);
  if (gefuellt(lead.anfragetyp)) bekannt.push(`Anlass: ${lead.anfragetyp}`);
  if (gefuellt(lead.teilnehmer)) bekannt.push(`${lead.teilnehmer} Personen`);
  if (gefuellt(lead.wunschdatum)) bekannt.push(`Wunschtermin: ${lead.wunschdatum}`);
  if (gefuellt(lead.telefon)) bekannt.push(`Telefon: ${lead.telefon}`);
  if (gefuellt(lead.email)) bekannt.push(`E-Mail: ${lead.email}`);
  if (gefuellt(lead.herkunft)) bekannt.push(`Kam über: ${lead.herkunft}`);
  if (gefuellt(lead.kommentar)) bekannt.push(`Hat geschrieben: „${lead.kommentar.trim()}“`);

  // Nur fragen, was nicht schon dasteht.
  if (!gefuellt(lead.anfragetyp)) fragen.push("Worum geht es? Firmenfeier, Geburtstag, Jubiläum, Kundenabend?");
  if (!gefuellt(lead.teilnehmer)) fragen.push("Wie viele Personen werdet ihr sein, ungefähr?");
  if (!gefuellt(lead.wunschdatum)) {
    fragen.push("Habt ihr schon ein Datum, oder seid ihr flexibel?");
  } else {
    fragen.push(`Steht der ${lead.wunschdatum} fest, oder wäre ein anderer Abend auch möglich?`);
  }
  if (!gefuellt(lead.telefon)) fragen.push("Unter welcher Nummer erreichen wir euch am besten?");

  if (!erwaehnt(text, ["menü", "menue", "essen", "dinner", "buffet", "fingerfood"])) {
    fragen.push("Soll gegessen werden? Menü, Fingerfood oder nur Show?");
  }
  if (!erwaehnt(text, ["getränk", "getraenk", "bar", "sekt", "wein"])) {
    fragen.push("Getränke über die Bar auf Rechnung, oder ein Paket vorab?");
  }
  if (!erwaehnt(text, ["exklusiv", "ganzes haus", "alleine", "geschlossen"])) {
    fragen.push("Exklusiv im ganzen Haus oder mitten unter anderen Gästen?");
  }
  if (!erwaehnt(text, ["budget", "preis", "kostet", "euro", "€"])) {
    fragen.push("Gibt es einen Rahmen, in dem ihr euch bewegen wollt?");
  }
  if (!erwaehnt(text, ["rechnung", "firma", "gmbh", "ag ", "ug "])) {
    fragen.push("Geht die Rechnung an eine Firma? Dann brauchen wir die Anschrift.");
  }
  fragen.push("Bis wann braucht ihr das Angebot, und wer entscheidet mit?");

  merken.push("Erst zuhören, dann anbieten. Was schon dasteht, nicht noch einmal abfragen.");
  merken.push("Am Ende zusammenfassen: Anlass, Personen, Termin, Essen. Das zeigt, dass es angekommen ist.");
  merken.push("Angebot zusagen mit Termin: „Du hast es morgen Mittag im Postfach.“");
  if (gefuellt(lead.wunschdatum)) {
    merken.push("Vor dem Auflegen prüfen, ob an dem Abend überhaupt noch Platz ist.");
  }

  return { bekannt, fragen, merken };
}
