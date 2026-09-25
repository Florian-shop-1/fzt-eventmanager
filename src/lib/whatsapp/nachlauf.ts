/**
 * Was nach einer neuen WhatsApp passiert: Mail an alle mit Freigabe und, wenn
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
  meldeempfaenger,
  type NeuerEingang,
} from "@/lib/db/whatsapp";
import { textSchicken } from "@/lib/whatsapp/senden";
import { istWebseite, kennungLesbar } from "@/lib/whatsapp/kennung";
import { db } from "@/lib/db/client";

const NL = String.fromCharCode(10);

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

/**
 * Die Mail an alle mit Freigabe. Eigene Funktion, damit der Testknopf
 * dieselbe verschickt. Liefert die Namen, an die sie ging.
 */
export async function meldungSchicken(waId: string, name: string, texte: string[]): Promise<string[]> {
  const empfaenger = await meldeempfaenger();
  if (empfaenger.length === 0) {
    throw new Error("Niemand hat die WhatsApp-Freigabe mit einer Mailadresse. Siehe Zugänge.");
  }
  const web = istWebseite(waId);
  let kontakt: string[] = [];
  let bewertung = false;
  let abbrecher = false;
  if (web) {
    const [u] = (await db()`
      select kanal, email, telefon, rueckweg, seite from wa_unterhaltung where wa_id = ${waId}
    `) as Array<{ kanal: string; email: string | null; telefon: string | null; rueckweg: string | null; seite: string | null }>;
    bewertung = u?.kanal === "bewertung";
    abbrecher = u?.kanal === "abbrecher";
    kontakt = [
      "",
      u?.rueckweg === "anruf" ? "Wünscht sich einen Rückruf." : "Wünscht sich eine Antwort per Mail.",
      ...(u?.telefon ? [`Telefon: ${u.telefon}`] : []),
      ...(u?.email ? [`E-Mail: ${u.email}`] : []),
      ...(u?.seite && !bewertung ? [`Geschrieben auf: shop.florianzimmertheater.de${u.seite}`] : []),
      ...(u?.seite && (bewertung || abbrecher) ? [`Abend: ${u.seite}`] : []),
    ];
  }

  /*
    Die Antwort eines Abbrechers geht zusätzlich an tickets@: Dort sitzt
    das Büro ohnehin den ganzen Tag, und die Nachricht braucht eine
    Antwort wie jede andere Anfrage auch (Florian, 23.09.2026).
  */
  const an = empfaenger.map((e) => e.email);
  if (abbrecher && !an.some((x) => x.toLowerCase() === "tickets@florianzimmer.com")) {
    an.push("tickets@florianzimmer.com");
  }

  await mailVerschicken({
    an,
    betreff: bewertung
      ? `Schlechte Bewertung: ${name}. Bitte heute noch anrufen`
      : abbrecher
        ? `Warenkorb liegen gelassen: ${name} schreibt uns`
        : web
        ? `Anfrage über die Webseite von ${name}`
        : `WhatsApp von ${name}`,
    text: [
      bewertung
        ? `Ein Gast hat seinen Abend schlecht bewertet. Bitte ruft ihn an, bevor er es öffentlich macht:`
        : abbrecher
        ? `${name} hat eine Buchung abgebrochen und auf unsere Frage geantwortet:`
        : web
        ? `${name} hat über das Kontaktfenster im Shop geschrieben:`
        : `${name} (${kennungLesbar(waId)}) hat per WhatsApp geschrieben:`,
      "",
      texte.map((t) => `„${t}“`).join(NL + NL),
      ...kontakt,
      "",
      "Antworten im Eventmanager:",
      `${appUrl()}/whatsapp?mit=${encodeURIComponent(waId)}`,
      "",
      "Weitere Nachrichten in dieser Unterhaltung lösen keine neue Mail aus, bis jemand sie im Eventmanager geöffnet hat.",
    ].join(NL),
  });
  return empfaenger.map((e) => e.name);
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
    console.error("WhatsApp-Meldung per Mail fehlgeschlagen:", fehler instanceof Error ? fehler.message : fehler);
  }
}

async function automatischAntworten(waId: string): Promise<void> {
  // Das Kontaktfenster bestätigt dem Besucher selbst, und per WhatsApp lässt
  // sich eine Webanfrage ohnehin nicht beantworten.
  if (istWebseite(waId)) return;
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
