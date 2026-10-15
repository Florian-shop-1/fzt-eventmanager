/**
 * Schriftverkehr mit einem Mitarbeiter, aus seiner Personalakte heraus.
 *
 * "wir möchten auch Schriftverkehr mit dem Mitarbeiter dort ablegen
 * können. Richte es so ein, dass Kevin, Werner oder ich dem Mitarbeiter
 * schreiben können und der Absender dann auch von unserer E-Mail-Adresse
 * kommt" (Florian, 15.10.2026).
 *
 * Deshalb geht die Mail aus dem eigenen Postfach des Schreibenden und
 * nicht aus dem Personalpostfach: Der Mitarbeiter sieht, wer ihm
 * schreibt, und seine Antwort landet direkt dort. Eine Kopie des Textes
 * bleibt in der Akte stehen, damit man später nachlesen kann, was
 * besprochen wurde, ohne drei Postfächer zu durchsuchen.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { mailRahmen, absatz, h, ueberschrift, LEISE } from "@/lib/abbrecher/rahmen";

/**
 * Aus welchen Postfächern geschrieben werden darf.
 *
 * Nur die drei Häuser-Adressen. Wer sich mit einem anderen Zugang
 * anmeldet, schreibt aus dem Personalpostfach; eine erfundene Adresse
 * würde bei Microsoft ohnehin abgewiesen.
 */
export const EIGENE_POSTFAECHER = new Set([
  "info@florianzimmer.com",
  "w.zimmer@florianzimmer.com",
  "kevin.steele@florianzimmer.com",
]);

export interface Nachricht {
  id: string;
  vonName: string;
  vonEmail: string;
  anEmail: string;
  betreff: string;
  text: string;
  gesendetAm: string;
  fehler: string;
}

export async function nachrichten(benutzerId: string): Promise<Nachricht[]> {
  const z = (await db()`
    select id, von_name, von_email, an_email, betreff, text, gesendet_am, fehler
      from personal_nachricht
     where benutzer_id = ${benutzerId}::uuid
     order by gesendet_am desc
  `.catch(() => [])) as Array<Record<string, unknown>>;

  return z.map((r) => ({
    id: String(r.id),
    vonName: String(r.von_name ?? ""),
    vonEmail: String(r.von_email ?? ""),
    anEmail: String(r.an_email ?? ""),
    betreff: String(r.betreff ?? ""),
    text: String(r.text ?? ""),
    gesendetAm: new Date(r.gesendet_am as string).toISOString(),
    fehler: String(r.fehler ?? ""),
  }));
}

/** Der Text im Hausdesign, damit die Mail aussieht wie alles andere von uns. */
function alsHtml(o: { betreff: string; text: string; vonName: string; vonEmail: string }): string {
  const absaetze = o.text
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean);

  return mailRahmen({
    titel: o.betreff,
    vorschau: absaetze[0]?.slice(0, 120) ?? o.betreff,
    ueberschrift: ueberschrift(h(o.betreff)),
    inhalt: absaetze
      .map((a) => absatz(h(a).replace(/\n/g, "<br>")))
      .join(""),
    fuss: `${h(o.vonName)} · <a href="mailto:${h(o.vonEmail)}" style="color:${LEISE};text-decoration:underline;">${h(o.vonEmail)}</a> · Florian Zimmer Theater`,
  });
}

/**
 * Eine Mail an den Mitarbeiter schicken und in der Akte ablegen.
 *
 * Geht die Mail nicht hinaus, wird sie trotzdem festgehalten, mit dem
 * Fehler daneben: Sonst steht in der Akte ein Gespräch, das nie
 * stattgefunden hat, oder es fehlt eines, das jemand geführt zu haben
 * glaubt.
 */
export async function nachrichtSchicken(o: {
  benutzerId: string;
  anEmail: string;
  betreff: string;
  text: string;
  vonName: string;
  vonEmail: string;
}): Promise<{ ok: boolean; meldung: string }> {
  const betreff = o.betreff.trim().slice(0, 200);
  const text = o.text.trim().slice(0, 20000);

  if (!o.anEmail.includes("@")) {
    return { ok: false, meldung: "Für diese Person ist keine E-Mail-Adresse hinterlegt." };
  }
  if (!betreff || !text) {
    return { ok: false, meldung: "Betreff und Text dürfen nicht leer sein." };
  }

  // Aus dem eigenen Postfach, wenn es eines der drei ist.
  const ausPostfach = EIGENE_POSTFAECHER.has(o.vonEmail.toLowerCase())
    ? o.vonEmail.toLowerCase()
    : undefined;

  let fehler = "";
  try {
    await mailVerschicken({
      an: o.anEmail,
      absender: ausPostfach,
      antwortAn: ausPostfach ?? o.vonEmail,
      betreff,
      text,
      html: alsHtml({ betreff, text, vonName: o.vonName, vonEmail: o.vonEmail }),
    });
  } catch (e) {
    fehler = e instanceof Error ? e.message : "unbekannter Fehler";
  }

  await db()`
    insert into personal_nachricht (benutzer_id, von_name, von_email, an_email, betreff, text, fehler)
    values (${o.benutzerId}::uuid, ${o.vonName}, ${ausPostfach ?? o.vonEmail}, ${o.anEmail},
            ${betreff}, ${text}, ${fehler})
  `.catch(() => undefined);

  return fehler
    ? { ok: false, meldung: `Die Mail ging nicht hinaus: ${fehler}` }
    : { ok: true, meldung: `Mail an ${o.anEmail} verschickt, abgelegt in der Akte.` };
}
