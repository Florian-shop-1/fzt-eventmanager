/**
 * Was nach einer neuen WhatsApp passiert: Mail an tickets@ und, wenn
 * eingeschaltet, eine automatische Antwort an den Kunden.
 *
 * Läuft, nachdem Meta seine Antwort schon hat (after() im Webhook). Meta
 * soll nicht auf Outlook warten müssen, und schlägt hier etwas fehl, ist
 * die Nachricht trotzdem gespeichert und steht im Posteingang.
 *
 * Deshalb wirft hier nichts. Jeder Fehler landet im Protokoll bei Vercel,
 * und der Rest läuft weiter.
 */

import { mailVerschicken } from "@/lib/mail/versand";
import {
  autoantwortFaellig,
  autoantwortVermerkZuruecknehmen,
  automatikSpeichern,
  mailFaellig,
  mailVermerkZuruecknehmen,
  type NeuerEingang,
} from "@/lib/db/whatsapp";
import { textSchicken } from "@/lib/whatsapp/senden";

const NL = String.fromCharCode(10);

function meldeadresse(): string {
  return process.env.WHATSAPP_MELDUNG_AN ?? "tickets@florianzimmer.com";
}

function appUrl(): string {
  return process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
}

export async function nachEingang(neue: NeuerEingang[]): Promise<void> {
  // Je Kunde nur einmal, auch wenn im selben Päckchen drei Nachrichten steckten.
  const jeKunde = new Map<string, NeuerEingang[]>();
  for (const n of neue) jeKunde.set(n.waId, [...(jeKunde.get(n.waId) ?? []), n]);

  for (const [waId, nachrichten] of jeKunde) {
    await melden(waId, nachrichten);
    await automatischAntworten(waId);
  }
}

/** Die Mail an tickets@. Eigene Funktion, damit der Testknopf dieselbe verschickt. */
export async function meldungSchicken(waId: string, name: string, texte: string[]): Promise<string> {
  const an = meldeadresse();
  await mailVerschicken({
    an,
    // Absender ist ebenfalls tickets@. Mit Kopie unter Gesendet käme die
    // Meldung nicht im Posteingang an, siehe mail/versand.ts.
    imGesendetenAblegen: false,
    betreff: `WhatsApp von ${name}`,
    text: [
      `${name} (+${waId}) hat per WhatsApp geschrieben:`,
      "",
      texte.map((t) => `„${t}“`).join(NL + NL),
      "",
      "Antworten im Eventmanager:",
      `${appUrl()}/whatsapp?mit=${waId}`,
      "",
      "Weitere Nachrichten in dieser Unterhaltung lösen keine neue Mail aus, bis jemand sie im Eventmanager geöffnet hat.",
    ].join(NL),
  });
  return an;
}

async function melden(waId: string, nachrichten: NeuerEingang[]): Promise<void> {
  try {
    if (!(await mailFaellig(waId))) return;

    try {
      await meldungSchicken(waId, nachrichten[0].name, nachrichten.map((n) => n.text));
    } catch (fehler) {
      // Ohne Vermerk versucht es die nächste Nachricht dieses Kunden erneut.
      await mailVermerkZuruecknehmen(waId);
      throw fehler;
    }
  } catch (fehler) {
    console.error("WhatsApp-Meldung an tickets@ fehlgeschlagen:", fehler instanceof Error ? fehler.message : fehler);
  }
}

async function automatischAntworten(waId: string): Promise<void> {
  try {
    const text = await autoantwortFaellig(waId);
    if (!text) return;
    let metaId: string;
    try {
      metaId = await textSchicken(waId, text);
    } catch (fehler) {
      await autoantwortVermerkZuruecknehmen(waId);
      throw fehler;
    }
    await automatikSpeichern(waId, metaId, text);
  } catch (fehler) {
    console.error("Automatische WhatsApp-Antwort fehlgeschlagen:", fehler instanceof Error ? fehler.message : fehler);
  }
}
