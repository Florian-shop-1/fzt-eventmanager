/**
 * Der Mailentwurf bei einer Show-Absage: Termin nennen, Alternativen
 * auflisten (Shows am selben Tag zuerst), Entschädigung erklären, Link
 * zur eigenen Terminwahl. Nur ein Entwurf: Florian oder Kevin sehen ihn
 * vor dem Versand und können ihn ändern (Florian, 29.09.2026).
 */

import type { Vorstellungstermin } from "@/lib/ditix/spielplan";
import { datumLang } from "@/lib/zeit";

/** Kommende Termine, aufgeteilt in "selber Tag wie die Absage" und die übrigen nächsten. */
export function alternativenAufteilen(
  abgesagt: Vorstellungstermin,
  kommende: Vorstellungstermin[],
  anzahlWeitere = 5,
): { selberTag: Vorstellungstermin[]; weitere: Vorstellungstermin[] } {
  const infrage = kommende.filter((t) => t.ditixEventId !== abgesagt.ditixEventId && !t.ausverkauft);
  const selberTag = infrage.filter((t) => t.datum === abgesagt.datum);
  const weitere = infrage.filter((t) => t.datum !== abgesagt.datum).slice(0, anzahlWeitere);
  return { selberTag, weitere };
}

function terminZeile(t: Vorstellungstermin): string {
  return `- ${datumLang(t.datum)}, ${t.uhrzeit} Uhr – ${t.name}`;
}

export function absageEntwurf(o: {
  vorname: string;
  abgesagt: Vorstellungstermin;
  grund: string;
  selberTag: Vorstellungstermin[];
  weitere: Vorstellungstermin[];
  link: string;
  kompensationArt: "upgrade" | "glas";
  neueKategorie: string | null;
  plaetze: number;
}): { betreff: string; text: string } {
  const zeilen: string[] = [
    `Hallo ${o.vorname},`,
    "",
    `eure Show am ${datumLang(o.abgesagt.datum)}, ${o.abgesagt.uhrzeit} Uhr (${o.abgesagt.name}) kann ${o.grund} leider nicht stattfinden. Das tut uns wirklich leid.`,
    "",
    "Wir buchen euch gerne auf einen anderen Termin um, wählt dafür einfach unten aus.",
    "",
  ];

  if (o.selberTag.length > 0) {
    zeilen.push("Noch am selben Tag, das würden wir euch besonders empfehlen:");
    zeilen.push(...o.selberTag.map(terminZeile));
    zeilen.push("");
  }

  if (o.weitere.length > 0) {
    zeilen.push("Die nächsten Termine:");
    zeilen.push(...o.weitere.map(terminZeile));
    zeilen.push("");
  }

  zeilen.push(`Wählt euren Wunschtermin hier, dann kümmern wir uns um den Rest: ${o.link}`);
  zeilen.push("");
  zeilen.push(
    o.kompensationArt === "upgrade"
      ? `Als Ausgleich bekommt ihr beim neuen Termin automatisch ein Upgrade auf ${o.neueKategorie}, ohne Aufpreis.`
      : `Als Ausgleich schenken wir euch bei eurem Besuch ${o.plaetze === 1 ? "ein Souvenirglas" : `${o.plaetze} Souvenirgläser`}.`,
  );
  zeilen.push("");
  zeilen.push("Bei Fragen sind wir gerne für euch da.");
  zeilen.push("");
  zeilen.push("Herzliche Grüße");
  zeilen.push("Florian Zimmer Theater");

  return {
    betreff: `Wichtig: eure Show am ${datumLang(o.abgesagt.datum)} fällt leider aus`,
    text: zeilen.join("\n"),
  };
}
