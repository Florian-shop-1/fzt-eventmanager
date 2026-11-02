/**
 * Aus welcher Vorstellung die Preise eines Angebots stammen.
 *
 * "wenn man z.b. donnerstag als wunschtag eingibt ohne konkretes datum,
 * dann zieht es sich trotzdem die preise von freitag" (Florian,
 * 02.11.2026).
 *
 * Die Regel stand zweimal im Programm, beim Erstellen eines Angebots
 * und in der Vorschau des Baukastens. Jetzt steht sie hier, damit
 * beide dasselbe zeigen.
 *
 * Gesucht wird die nächste Vorstellung an diesem Wochentag zur
 * passenden Tageszeit, ohne Sondershows: "es gilt immer der teurere
 * preis" und "Sondershows taugen nicht als Maßstab" (Florian,
 * 30.10.2026).
 *
 * Neu ist, was danach kommt. Findet sich nichts in den nächsten Monaten,
 * wurde bisher stillschweigend die nächstbeste Vorstellung genommen,
 * und die konnte ein halbes Jahr entfernt und eine ganz andere Show
 * sein. Das sieht niemand, der ein Angebot baut. Jetzt sagt die
 * Antwort, wie weit sie gegriffen hat, und die Oberfläche schreibt es
 * hin.
 */

import { istSondershow } from "@/lib/ditix/preise";
import { showtageAbHeute } from "@/lib/ditix/spielplan";

/** Bis hierhin gilt eine Vorstellung als brauchbarer Maßstab, in Tagen. */
const NAH = 120;

export interface Preisquelle {
  ditixEventId: string;
  datum: string;
  show: string;
  /** Weiter als NAH Tage entfernt: als Maßstab fragwürdig. */
  weitWeg: boolean;
  /** Wie viele Tage von heute bis dorthin. */
  tage: number;
}

export async function preisquelleFuerWochentag(
  wochentag: number,
  nachmittag: boolean,
): Promise<Preisquelle | null> {
  if (!Number.isInteger(wochentag)) return null;

  const heute = Date.now();
  const passende = (await showtageAbHeute(400)).filter((t) => {
    if (new Date(`${t.datum}T12:00:00Z`).getUTCDay() !== wochentag) return false;
    if (istSondershow(t.name)) return false;
    return nachmittag ? t.uhrzeit < "17:00" : t.uhrzeit >= "17:00";
  });
  if (passende.length === 0) return null;

  const erste = passende[0];
  const tage = Math.round(
    (new Date(`${erste.datum}T12:00:00Z`).getTime() - heute) / (1000 * 60 * 60 * 24),
  );
  return {
    ditixEventId: erste.ditixEventId,
    datum: erste.datum,
    show: erste.name,
    weitWeg: tage > NAH,
    tage,
  };
}
