/**
 * Versand von Gästemails über Brevo.
 *
 * Seit 15.09.2026 gehen die automatischen Mails an Gäste (Vorfreude,
 * Bewertung) über Brevo statt über das Postfach tickets@. Anlass war ein
 * Hinweis von Julian, geprüft und für richtig befunden:
 *
 *  - Markieren Gäste eine werbliche Mail als Spam, leidet sonst der Ruf von
 *    tickets@, und damit auch jede Mail an Firmenkunden. Getrennte Wege
 *    halten das Geschäftspostfach sauber.
 *  - Brevo ist für Versand an viele Empfänger gebaut, Microsoft 365 nicht.
 *
 * Alles andere bleibt bei Microsoft (versand.ts): Angebote, Antworten an
 * Kunden, interne Meldungen. Die sollen unter "Gesendete Elemente" stehen.
 *
 * Wer was bekommt und wann, entscheidet weiterhin der Eventmanager. Brevo
 * stellt nur zu. Absender bleibt tickets@florianzimmer.com, die Domain ist
 * bei Brevo bestätigt (brevo1/brevo2._domainkey).
 */

import type { Mail } from "./versand";

const BREVO = "https://api.brevo.com/v3";
const ABSENDER_NAME = "Florian Zimmer Theater";

function schluessel(): string | null {
  return process.env.BREVO_API_KEY?.trim() || null;
}

/** Ob der Brevo-Weg eingerichtet ist. Ohne Schlüssel geht alles über Microsoft. */
export function brevoEingerichtet(): boolean {
  return schluessel() !== null;
}

function liste(wer: string | string[] | undefined): Array<{ email: string }> {
  if (!wer) return [];
  return (Array.isArray(wer) ? wer : [wer]).map((a) => a.trim()).filter(Boolean).map((email) => ({ email }));
}

/** Übersetzt die häufigsten Antworten von Brevo in einen verständlichen Satz. */
function fehlertext(status: number, roh: string): string {
  let code = "";
  let text = roh.slice(0, 300);
  try {
    const j = JSON.parse(roh) as { code?: string; message?: string };
    code = j.code ?? "";
    text = j.message ?? text;
  } catch {
    // Kein JSON, dann bleibt der Rohtext.
  }
  if (status === 401 || code === "unauthorized") {
    return "Brevo lehnt den Schlüssel ab. Stimmt BREVO_API_KEY bei Vercel, und ist der Schlüssel in Brevo aktiv?";
  }
  if (/sender.*(not valid|invalid|not exist)/i.test(text)) {
    return `Brevo kennt den Absender nicht. In Brevo unter Absender, Domains muss ${process.env.MAIL_ABSENDER} bestätigt sein.`;
  }
  if (/ip/i.test(text) && status === 401) {
    return "Brevo blockiert die IP-Adresse. Die Sperre für nicht autorisierte IPs muss für API-Schlüssel aus sein.";
  }
  return `Brevo hat die Mail nicht angenommen (${status}). ${text}`;
}

/**
 * Brevo hat geantwortet und die Mail abgelehnt. Dann ist sicher nichts
 * verschickt, und der Weg über Microsoft kann einspringen. Bei einer
 * Zeitüberschreitung ist das nicht sicher, dort gibt es diesen Fehler nicht.
 */
export class BrevoAbgelehnt extends Error {}

/** Verschickt eine Mail über Brevo. Wirft bei jedem Fehler, wie mailVerschicken. */
export async function brevoVerschicken(mail: Mail): Promise<void> {
  const key = schluessel();
  const absender = process.env.MAIL_ABSENDER ?? "";
  if (!key) throw new Error("BREVO_API_KEY fehlt bei Vercel.");
  if (!absender) throw new Error("MAIL_ABSENDER fehlt bei Vercel.");

  const antwortAn = liste(mail.antwortAn)[0];
  const blind = liste(mail.blindkopie);

  const antwort = await fetch(`${BREVO}/smtp/email`, {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: ABSENDER_NAME, email: absender },
      to: liste(mail.an),
      ...(blind.length > 0 && { bcc: blind }),
      ...(antwortAn && { replyTo: antwortAn }),
      subject: mail.betreff,
      ...(mail.html ? { htmlContent: mail.html } : {}),
      textContent: mail.text,
      ...(mail.schlagwort && { tags: [mail.schlagwort] }),
      ...(mail.abmeldenLink && { headers: { "List-Unsubscribe": `<${mail.abmeldenLink}>` } }),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (antwort.status === 201 || antwort.status === 202 || antwort.ok) return;
  throw new BrevoAbgelehnt(fehlertext(antwort.status, await antwort.text()));
}

/**
 * Prüft den Brevo-Weg, ohne eine Mail zu verschicken: Schlüssel gültig,
 * Absender in Brevo bestätigt und aktiv.
 */
export async function brevoPruefen(): Promise<{ gut: boolean; meldung: string }> {
  const key = schluessel();
  if (!key) return { gut: false, meldung: "BREVO_API_KEY ist bei Vercel nicht gesetzt. Gästemails gehen deshalb über Microsoft." };
  const absender = (process.env.MAIL_ABSENDER ?? "").toLowerCase();
  try {
    const kopf = { "api-key": key, accept: "application/json" };
    const konto = await fetch(`${BREVO}/account`, { headers: kopf, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!konto.ok) return { gut: false, meldung: fehlertext(konto.status, await konto.text()) };
    const k = (await konto.json()) as { companyName?: string };

    const s = await fetch(`${BREVO}/senders`, { headers: kopf, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!s.ok) return { gut: false, meldung: fehlertext(s.status, await s.text()) };
    const { senders = [] } = (await s.json()) as { senders?: Array<{ email: string; active: boolean }> };
    const eintrag = senders.find((x) => x.email.toLowerCase() === absender);
    if (!eintrag) {
      return {
        gut: false,
        meldung: `Schlüssel gültig (Konto ${k.companyName ?? "?"}), aber ${absender} ist in Brevo nicht als Absender angelegt.`,
      };
    }
    if (!eintrag.active) {
      return { gut: false, meldung: `Schlüssel gültig, aber der Absender ${absender} ist in Brevo noch nicht bestätigt.` };
    }
    return { gut: true, meldung: `Verbunden mit Brevo (Konto ${k.companyName ?? "?"}). Absender ${absender} ist bestätigt.` };
  } catch (f) {
    return { gut: false, meldung: f instanceof Error ? f.message : "Brevo ist nicht erreichbar." };
  }
}
