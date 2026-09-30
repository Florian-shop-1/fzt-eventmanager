/**
 * Die Erinnerung an den wartenden Zauberstab.
 *
 * Wer beim Gewinnspiel mitgemacht, aber keine Anschrift dagelassen hat,
 * bekommt am Tag darauf diese eine Mail. Sie verkauft nichts, sie fragt
 * nach drei Zeilen Anschrift, damit das Päckchen rausgehen kann
 * (Florian, 30.09.2026).
 *
 * Genau eine Erinnerung, nicht mehr: Wer sie ignoriert, will den
 * Zauberstab nicht, und dann ist Stille die richtige Antwort.
 */

import { absatz, klein, knopf, mailRahmen, ueberschrift } from "@/lib/abbrecher/rahmen";
import type { Zauberstab } from "./zauberstab";

const SHOP = process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de";

export function anschriftLink(z: Zauberstab): string {
  return `${SHOP}/zauberstab-adresse/${z.token}`;
}

export function erinnerungMail(z: Zauberstab): { betreff: string; text: string; html: string } {
  const anrede = z.vorname ? `Hallo ${z.vorname},` : "Hallo,";
  const link = anschriftLink(z);

  const text = [
    anrede,
    "",
    "dein erscheinender Zauberstab liegt bei uns bereit, aber wir wissen",
    "noch nicht, wohin er soll.",
    "",
    "Drei Zeilen genügen, dann geht er auf die Reise:",
    "",
    link,
    "",
    "Er kostet dich nichts, die Anleitung liegt dabei. Und dein Los für das",
    "magische Wochenende für zwei liegt ohnehin schon im Topf.",
    "",
    "Florian",
    "",
    "",
    "--",
    "Du bekommst diese Mail, weil du am Gewinnspiel des Florian Zimmer",
    "Theaters teilgenommen hast. Trägst du nichts ein, hörst du nichts mehr",
    "von uns dazu.",
    "",
    "Florian Zimmer Theater GmbH",
    "Grethe-Weiser-Str. 2/1 · 89231 Neu-Ulm",
    "Telefon 0731 7906 110 · tickets@florianzimmer.com",
  ].join("\n");

  const html = mailRahmen({
    titel: "Dein Zauberstab wartet",
    vorschau: "Drei Zeilen Anschrift, dann geht er auf die Reise.",
    ueberschrift: ueberschrift("Dein Zauberstab<br />wartet noch"),
    inhalt: [
      absatz(anrede),
      absatz(
        "dein erscheinender Zauberstab liegt bei uns bereit, aber wir wissen noch nicht, "
          + "wohin er soll. Drei Zeilen genügen, dann geht er auf die Reise.",
      ),
      knopf("Anschrift eintragen", link),
      absatz(
        "Er kostet dich nichts, die Anleitung liegt dabei. Und dein Los für das magische "
          + "Wochenende für zwei liegt ohnehin schon im Topf.",
      ),
    ].join(""),
    fuss: klein(
      "Du bekommst diese Mail, weil du am Gewinnspiel des Florian Zimmer Theaters teilgenommen hast. "
        + "Trägst du nichts ein, hörst du nichts mehr von uns dazu.",
    ),
  });

  return { betreff: "Dein Zauberstab wartet noch auf eine Anschrift", text, html };
}
