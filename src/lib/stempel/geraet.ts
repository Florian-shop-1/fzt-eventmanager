/**
 * Stempeln nur am eigenen Handy (Florian, 23.09.2026).
 *
 * Grund: Am Bürorechner oder am Tablet im Foyer könnte jemand für einen
 * anderen stempeln, und der Standort eines fest stehenden Geräts sagt
 * ohnehin nichts darüber aus, ob der Mitarbeiter da ist. Am Handy hängt
 * die Zeit an der Person, und die Standortprüfung ergibt einen Sinn.
 *
 * Erkannt wird an der Gerätekennung des Browsers. Das ist keine Mauer:
 * Wer will, stellt seinen Browser auf "Desktop-Website" oder umgekehrt.
 * Es geht darum, dass es im Alltag am richtigen Gerät passiert, nicht
 * darum, Betrug technisch unmöglich zu machen. Wer schummeln will,
 * schafft das auch mit einem gefälschten Standort.
 *
 * Tablets zählen ausdrücklich nicht als Handy: iPads melden sich als
 * "iPad" (neuere auch als Macintosh mit Touch), Android-Tablets lassen
 * das "Mobile" in der Kennung weg.
 */

export interface GeraetPruefung {
  handy: boolean;
  /** Was dem Mitarbeiter angezeigt wird, wenn es nicht passt. */
  grund: string;
}

const NICHT_HANDY = /ipad|tablet|playbook|silk|kindle/i;
const HANDY = /android.*mobile|iphone|ipod|windows phone|iemobile|blackberry|opera mini|mobile safari/i;

export function istHandy(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return false;
  if (NICHT_HANDY.test(ua)) return false;
  return HANDY.test(ua);
}

export function geraetPruefen(userAgent: string | null | undefined): GeraetPruefung {
  const handy = istHandy(userAgent);
  return {
    handy,
    grund: handy
      ? ""
      : "Gestempelt wird nur am eigenen Handy. Am Rechner und am Tablet ist das Stempeln abgeschaltet.",
  };
}
