/**
 * Was passiert, wenn ein Gast bis zu drei Sterne gibt.
 *
 * Die Unterhaltung erscheint im Posteingang, markiert als "Bewertung", mit
 * Telefonnummer und Anrufknopf, und alle mit WhatsApp-Freigabe bekommen eine
 * Mail. So geht es auch in der Warnung nach 24 Stunden nicht unter.
 *
 * Warum nicht an tickets@: Eine Mail von tickets@ an tickets@ kommt dort nicht
 * im Posteingang an (14.09.2026, siehe db/whatsapp.ts meldeempfaenger).
 *
 * Mail-Scanner: Outlook und manche Firmenfilter rufen alle Links einer Mail
 * vorab auf, also alle fünf Sterne hintereinander. Deshalb speichert die Seite
 * die Sterne erst per JavaScript, und die Meldung wartet hier noch einen
 * Moment und prüft dann, ob die Sterne noch dieselben sind. Ein Scanner, der
 * 1 bis 5 in einer Sekunde klickt, endet bei 5 und löst nichts aus.
 */

import {
  buchungZurBewertung,
  unterhaltungMerken,
  type BewerteteBuchung,
} from "@/lib/db/bewertung";
import { nachrichtAnhaengen, webanfrageSpeichern } from "@/lib/db/whatsapp";
import { nachEingang } from "@/lib/whatsapp/nachlauf";

export const SCHLECHT_BIS = 3;
const WARTEN_MS = 20_000;

function sterneText(n: number): string {
  return `${"★".repeat(n)}${"☆".repeat(5 - n)} (${n} von 5)`;
}

function abend(b: BewerteteBuchung): string {
  const tag = new Date(`${b.datum}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin",
  });
  return `${b.show || "Show"} am ${tag}${b.uhrzeit ? `, ${b.uhrzeit.slice(0, 5)} Uhr` : ""}`;
}

/** Nach dem Speichern der Sterne aufrufen, im Hintergrund. */
export async function nachSternen(token: string, sterne: number): Promise<void> {
  if (sterne > SCHLECHT_BIS) return;
  await new Promise((r) => setTimeout(r, WARTEN_MS));

  const b = await buchungZurBewertung(token);
  if (!b || b.sterne === null || b.sterne > SCHLECHT_BIS || b.unterhaltung) return;
  // Dieselben Sterne wie beim Klick? Sonst hat inzwischen jemand anders geklickt.
  if (b.sterne !== sterne) return;

  const neu = await webanfrageSpeichern({
    kanal: "bewertung",
    name: b.name || "Gast ohne Namen",
    nachricht: `Bewertung ${sterneText(b.sterne)} für ${abend(b)}.${b.kritik ? ` Kritik: ${b.kritik}` : " Kritik folgt vielleicht noch."} Bitte dringend anrufen.`,
    email: b.email || null,
    telefon: b.telefon || null,
    rueckweg: b.telefon ? "anruf" : "mail",
    seite: abend(b),
  });
  await unterhaltungMerken(b.id, neu.waId);
  await nachEingang([{ ...neu, name: `${b.name || "Gast"}, ${b.sterne} Sterne` }]);
}

/** Nach dem Speichern der Kritik aufrufen. */
export async function nachKritik(token: string): Promise<void> {
  const b = await buchungZurBewertung(token);
  if (!b || !b.kritik) return;
  if (b.unterhaltung) {
    await nachrichtAnhaengen(b.unterhaltung, `Kritik: ${b.kritik}`);
    await nachEingang([{ waId: b.unterhaltung, name: `${b.name || "Gast"}, Kritik nachgereicht`, typ: "text", text: b.kritik }]);
    return;
  }
  // Kritik kam schneller als die Wartezeit der Sternemeldung: Die legt dann
  // alles zusammen an, siehe nachSternen.
}
