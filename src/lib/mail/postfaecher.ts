/**
 * Aus welchem Postfach eine Mail kommt.
 *
 * Bisher kam alles aus dem Ticketpostfach, auch die Mails an die eigenen
 * Leute. Das passt nicht: Wer eine Frage zu seinem Arbeitsvertrag hat und
 * auf "Antworten" drückt, landet beim Ticketverkauf (Florian, 01.10.2026).
 *
 * Ein noreply-Postfach wäre die schlechtere Antwort darauf. Gerade bei
 * einem Vertrag steht im Text "melde dich, bevor du unterschreibst", und
 * dann darf die Antwort nicht ins Leere laufen. Deshalb ein Postfach, das
 * ein Mensch liest.
 *
 * Welches, entscheidet die Einstellung bei Vercel. Fehlt sie, bleibt es
 * beim Ticketpostfach: lieber eine Mail aus dem falschen Postfach als
 * keine Mail.
 */

/** Mails an die eigenen Mitarbeiter: Vertrag, Dienstplan, Arbeitszeit. */
export function postfachPersonal(): string | undefined {
  return process.env.MAIL_ABSENDER_PERSONAL?.trim() || undefined;
}

/** Wohin Antworten auf Personalmails gehen sollen. */
export function antwortPersonal(): string | undefined {
  return (
    process.env.MAIL_ANTWORT_PERSONAL?.trim() ||
    process.env.MAIL_ABSENDER_PERSONAL?.trim() ||
    undefined
  );
}
