/**
 * Der Mailentwurf bei einer Show-Absage: Termin nennen, Alternativen
 * auflisten (Shows am selben Tag zuerst), Entschädigung erklären, Link
 * zur eigenen Terminwahl. Nur ein Entwurf: Florian oder Kevin sehen ihn
 * vor dem Versand und können ihn ändern (Florian, 29.09.2026).
 *
 * In dieser ersten Mail steht bewusst nichts von Geld zurück. "bitte in
 * der ersten mail keine Rückerstattung anbieten, sondern auf die
 * Umbuchung zu einem anderen Termin konzentrieren" (Florian, 01.10.2026).
 * Wer sein Geld will, bekommt es natürlich, aber er soll erst sehen, dass
 * ein anderer Abend genauso schön wird.
 */

import type { Vorstellungstermin } from "@/lib/ditix/spielplan";
import { datumLang } from "@/lib/zeit";

export interface Alternativen {
  /** Eine andere Show am selben Tag, meistens die Abendshow. */
  selberTag: Vorstellungstermin[];
  /** Der Abend davor. */
  tagDavor: Vorstellungstermin[];
  /** Der Tag danach. */
  tagDanach: Vorstellungstermin[];
  /** Alles Weitere aus dem Showkalender, der Reihe nach. */
  weitere: Vorstellungstermin[];
}

function tagVersetzt(datum: string, tage: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/**
 * Die kommenden Termine, sortiert nach Nähe zum ausgefallenen Abend.
 *
 * "Meist wird die Samstag mittag show abgesagt. da könnten sie auch
 * samstag abend kommen, freitag abend den tag davor oder sonntag mittag
 * ein tag danach. oder natürlich auch jeder andere termin aus dem
 * showkalender" (Florian, 01.10.2026). Genau diese Reihenfolge steht
 * hier: selber Tag, Abend davor, Tag danach, dann der Rest.
 *
 * Der Tag davor fliegt heraus, wenn er schon vorbei ist; das passiert bei
 * einer kurzfristigen Absage am Showtag selbst.
 */
export function alternativenAufteilen(
  abgesagt: Vorstellungstermin,
  kommende: Vorstellungstermin[],
  anzahlWeitere = 5,
): Alternativen {
  const infrage = kommende.filter((t) => t.ditixEventId !== abgesagt.ditixEventId && !t.ausverkauft);
  const davor = tagVersetzt(abgesagt.datum, -1);
  const danach = tagVersetzt(abgesagt.datum, 1);

  return {
    selberTag: infrage.filter((t) => t.datum === abgesagt.datum),
    tagDavor: infrage.filter((t) => t.datum === davor),
    tagDanach: infrage.filter((t) => t.datum === danach),
    weitere: infrage
      .filter((t) => t.datum !== abgesagt.datum && t.datum !== davor && t.datum !== danach)
      .slice(0, anzahlWeitere),
  };
}

function terminZeile(t: Vorstellungstermin): string {
  return `- ${datumLang(t.datum)}, ${t.uhrzeit} Uhr – ${t.name}`;
}

export function absageEntwurf(o: {
  vorname: string;
  abgesagt: Vorstellungstermin;
  grund: string;
  alternativen: Alternativen;
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
    "Der Abend ist damit nicht verloren: Wir buchen euch gerne auf einen anderen Termin um, eure Tickets behalten ihren Wert. Ein Klick auf euren Wunschtermin genügt, um den Rest kümmern wir uns.",
    "",
  ];

  const bloecke: Array<[string, Vorstellungstermin[]]> = [
    ["Noch am selben Tag, das würden wir euch besonders empfehlen:", o.alternativen.selberTag],
    ["Der Abend davor:", o.alternativen.tagDavor],
    ["Der Tag danach:", o.alternativen.tagDanach],
    ["Weitere Termine:", o.alternativen.weitere],
  ];
  for (const [ueberschrift, termine] of bloecke) {
    if (termine.length === 0) continue;
    zeilen.push(ueberschrift);
    zeilen.push(...termine.map(terminZeile));
    zeilen.push("");
  }

  zeilen.push(`Hier könnt ihr euren Termin direkt bestätigen: ${o.link}`);
  zeilen.push("");
  zeilen.push(
    "Dort steht auch der ganze Showkalender, falls ein anderer Abend besser passt, und ihr könnt euch mit einem Klick zurückrufen lassen.",
  );
  zeilen.push("");
  zeilen.push(
    o.kompensationArt === "upgrade"
      ? `Als Ausgleich bekommt ihr beim neuen Termin automatisch ein Upgrade auf ${o.neueKategorie}, ohne Aufpreis.`
      : `Als Ausgleich schenken wir euch bei eurem Besuch ${o.plaetze === 1 ? "ein Souvenirglas" : `${o.plaetze} Souvenirgläser`}.`,
  );
  zeilen.push("");
  zeilen.push("Wenn ihr lieber mit uns sprecht: 0731 7906 110, wir sind gerne für euch da.");
  zeilen.push("");
  zeilen.push("Herzliche Grüße");
  zeilen.push("Florian Zimmer Theater");

  return {
    betreff: `Wichtig: eure Show am ${datumLang(o.abgesagt.datum)} fällt leider aus`,
    text: zeilen.join("\n"),
  };
}
