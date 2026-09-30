/**
 * Der tägliche Lauf für die wartenden Zauberstäbe.
 *
 * Wer beim Gewinnspiel mitgemacht und keine Anschrift dagelassen hat,
 * bekommt genau eine Erinnerung, frühestens am Tag darauf. Danach ist
 * Ruhe: Wer nicht antwortet, will ihn nicht (Florian, 30.09.2026).
 */

import { mailVerschicken } from "@/lib/mail/versand";
import { erinnerungVermerken, zauberstaebeOhneAnschrift } from "./zauberstab";
import { erinnerungMail } from "./zauberstab-mail";

/** Frühestens so viele Stunden nach der Teilnahme. */
export const VORLAUF_STUNDEN = 20;

export interface ZauberstabLauf {
  erinnert: number;
  fehler: string[];
}

export async function zauberstabLauf(probelauf = false): Promise<ZauberstabLauf> {
  const ergebnis: ZauberstabLauf = { erinnert: 0, fehler: [] };
  const offene = await zauberstaebeOhneAnschrift(VORLAUF_STUNDEN);

  for (const z of offene) {
    if (probelauf) {
      ergebnis.erinnert++;
      continue;
    }
    try {
      const mail = erinnerungMail(z);
      await mailVerschicken({
        an: z.email,
        betreff: mail.betreff,
        text: mail.text,
        html: mail.html,
        antwortAn: "tickets@florianzimmer.com",
        ueberBrevo: true,
        schlagwort: "zauberstab-erinnerung",
      });
      await erinnerungVermerken(z.id);
      ergebnis.erinnert++;
    } catch (f) {
      ergebnis.fehler.push(`${z.email}: ${f instanceof Error ? f.message : f}`);
    }
  }

  if (ergebnis.fehler.length) console.error("[zauberstab]", ergebnis.fehler.join("; "));
  return ergebnis;
}
