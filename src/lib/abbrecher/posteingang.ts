/**
 * Abbrecher-Meldungen in den Posteingang.
 *
 * Bisher kam nur dort etwas an, wenn der Gast zusätzlich einen Text
 * geschrieben hat. Wer einfach auf "technisches Problem" klickte, löste
 * zwar den Rückruf-Vermerk in der Vertriebsliste aus, tauchte aber im
 * Posteingang nirgends auf. Thorsten Erb ist so durchgerutscht: Meldung
 * um 9:00 Uhr, Status "anrufen", und niemand hat es gesehen (Florian,
 * 24.09.2026).
 *
 * Jetzt gilt: Ein gemeldetes technisches Problem geht immer in den
 * Posteingang und löst immer die Meldemail aus, mit oder ohne Text. Denn
 * dahinter steht ein Gast, der kaufen wollte und nicht konnte.
 */

import { grundText, type Abbrecher } from "./db";
import { webanfrageSpeichern } from "@/lib/db/whatsapp";
import { nachEingang } from "@/lib/whatsapp/nachlauf";
import { mailVerschicken } from "@/lib/mail/versand";

/**
 * Wer bei einem technischen Problem sofort Bescheid weiß.
 *
 * Bewusst nur diese beiden und nicht der ganze Verteiler: Ein Gast, der
 * kaufen wollte und nicht konnte, muss heute noch angerufen werden, und
 * dafür ist die Geschäftsführung zuständig (Florian, 24.09.2026).
 */
const ALARM = ["info@florianzimmer.com", "kevin.steele@florianzimmer.com"];

/** Zeilenumbruch als Konstante: In Vorlagen mit Umlauten ist er sonst
 *  schon zweimal beim Bearbeiten zerbrochen. */
const UM = String.fromCharCode(10);

function abendVon(a: Abbrecher): string {
  if (!a.datum) return "";
  const tag = a.datum.split("-").reverse().join(".");
  return `${a.show || "Show"} am ${tag}${a.uhrzeit ? `, ${a.uhrzeit} Uhr` : ""}`;
}

/**
 * Legt eine Unterhaltung an und meldet sie.
 *
 * `dringend` steht für die Fälle, in denen jemand anrufen muss. Der Text
 * sagt es dann unmissverständlich, damit im Büro niemand rätselt, was zu
 * tun ist.
 */
export async function abbrecherMeldung(o: {
  buchung: Abbrecher;
  grund: string;
  text?: string;
  dringend?: boolean;
}): Promise<void> {
  const { buchung: a, grund, text, dringend } = o;
  const abend = abendVon(a);

  const zeilen = [
    dringend
      ? `${a.name || a.email} kam beim Buchen nicht weiter und meldet ein technisches Problem.`
      : `${a.name || a.email} hat den Warenkorb liegen gelassen.`,
    abend ? `Abend: ${abend}` : "",
    `Angegebener Grund: ${grundText(grund) || "keiner"}`,
    text ? `\nEigene Worte:\n„${text}“` : "",
    dringend
      ? "\nBITTE ANRUFEN. Der Gast wollte kaufen und konnte nicht. Wir haben ihm auf der Antwortseite zugesagt, dass wir uns melden."
      : "",
  ].filter(Boolean);

  const neu = await webanfrageSpeichern({
    kanal: "abbrecher",
    name: a.name || a.email || "Gast ohne Namen",
    nachricht: zeilen.join("\n"),
    email: a.email || null,
    telefon: a.telefon || null,
    // Bei einem technischen Problem ist der Anruf der schnellere Weg,
    // sofern wir eine Nummer haben.
    rueckweg: dringend && a.telefon ? "anruf" : a.telefon ? "anruf" : "mail",
    seite: abend || null,
  });

  await nachEingang([
    {
      ...neu,
      name: dringend
        ? `${a.name || "Gast"}, technisches Problem beim Buchen`
        : `${a.name || "Gast"}, Warenkorb liegen gelassen`,
    },
  ]);

  // Bei einem technischen Problem zusaetzlich direkt an Florian und
  // Kevin. Die Meldung im Posteingang kann ein paar Stunden liegen
  // bleiben, dieser Anruf nicht.
  if (dringend) {
    const zeit = new Date().toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    });
    const inhalt = [
      `${a.name || a.email || "Ein Gast"} kam beim Buchen nicht weiter und meldet ein technisches Problem.`,
      "",
      abend ? `Abend: ${abend}` : "",
      a.telefon ? `Telefon: ${a.telefon}` : "Keine Telefonnummer hinterlegt.",
      a.email ? `E-Mail: ${a.email}` : "",
      a.plaetze ? `Im Warenkorb lagen ${a.plaetze} Plätze.` : "",
      text ? [UM, "Eigene Worte:", `„${text}“`].join(UM) : "",
      "",
      "Wir haben ihm auf der Antwortseite zugesagt, dass wir uns melden.",
      "",
      `Gemeldet am ${zeit} Uhr. Der Vorgang steht im Posteingang und in der Abbrecherliste.`,
    ]
      .filter(Boolean)
      .join(UM);

    await mailVerschicken({
      an: ALARM,
      betreff: `Bitte anrufen: ${a.name || a.email || "Gast"} kommt beim Buchen nicht weiter`,
      text: inhalt,
      html: inhalt
        .split(UM)
        .map((z) => (z ? `<p style="margin:0 0 10px">${z}</p>` : ""))
        .join(""),
    }).catch((f) => {
      console.warn("[abbrecher] Alarmmail nicht zugestellt:", f);
    });
  }
}
