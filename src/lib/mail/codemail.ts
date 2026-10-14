/**
 * Der Codeversand im Hausdesign.
 *
 * "wenn jemand so ne Schlemmerblock-Mail kriegt, sieht das nicht toll
 * aus, warum machst du die nicht in dem schönen Design, wie wenn jemand
 * Vorfreude-Mail kriegt" (Florian, 14.10.2026).
 *
 * Es sprach nichts dagegen: Der Rahmen lag schon da, er wurde hier nur
 * nie benutzt. Verschickt wird weiterhin beides, Text und HTML, damit
 * die Mail auch in einem Programm ankommt, das kein HTML anzeigt.
 *
 * Der Code steht gross, in Gold und zum Antippen markierbar. Er ist das
 * Einzige, was der Gast aus dieser Mail wirklich braucht.
 */

import { GOLD_HELL, LEISE, WEISS, absatz, h, kasten, klein, mailRahmen, ueberschrift } from "@/lib/abbrecher/rahmen";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

export interface Codeblock {
  /** Wie die Aktion beim Gast heisst, etwa "Freikarte". */
  aktion: string;
  codes: string[];
  /** Der Einlösehinweis zu diesem Vorrat. */
  hinweis: string | null;
}

/** Aus "Hallo,\n\nschön, dass ..." werden einzelne Absätze. */
function absaetze(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((a) => a.trim().replace(/\n/g, " "))
    .filter(Boolean);
}

export function codeMailHtml(o: {
  betreff: string;
  einleitung: string;
  bloecke: Codeblock[];
  schluss: string;
}): string {
  const kopf = absaetze(o.einleitung);
  const anrede = kopf[0] ?? "Hallo,";
  const rest = kopf.slice(1);

  const codes = o.bloecke
    .map((b) =>
      kasten(
        klein(h(b.aktion))
        + b.codes
          .map(
            (c) =>
              `<p style="margin:10px 0 0;font-family:${MONO};font-size:26px;letter-spacing:2px;color:${GOLD_HELL};">${h(c)}</p>`,
          )
          .join("")
        + (b.hinweis
          ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:#D8D8D8;">${h(b.hinweis)}</p>`
          : ""),
      ),
    )
    .join("");

  return mailRahmen({
    titel: o.betreff,
    vorschau: o.bloecke[0]?.codes[0] ? `Dein Code: ${o.bloecke[0].codes[0]}` : o.betreff,
    ueberschrift: ueberschrift(h(o.betreff)),
    inhalt: [
      absatz(h(anrede), `color:${WEISS};font-size:17px;`),
      ...rest.map((a) => absatz(h(a))),
      codes,
      ...absaetze(o.schluss).map((a) => absatz(h(a))),
    ].join(""),
    fuss: `Florian Zimmer Theater · <a href="https://shop.florianzimmertheater.de" style="color:${LEISE};text-decoration:underline;">shop.florianzimmertheater.de</a>`,
  });
}
