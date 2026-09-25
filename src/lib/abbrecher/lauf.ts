/**
 * Der tägliche Lauf für die abgebrochenen Warenkörbe.
 *
 *  1. Wer gestern abgebrochen hat, bekommt die Frage "Was hat dich
 *     abgehalten?". Sie verkauft nichts, sie fragt.
 *  2. Wer drei Tage später immer noch nicht gekauft hat, kommt in die
 *     Ziehung für die Getränkepakete.
 *
 * Zur Ziehung, weil es wichtig ist: Es wird wirklich gezogen. Pro Woche
 * gibt es ein festes Kontingent, und wer daraus etwas bekommt, entscheidet
 * der Zufall. Florian wollte, dass es sich nach Auswahl anfühlt, und der
 * ehrliche Weg dorthin ist, es zur echten Auswahl zu machen, statt in der
 * Mail etwas zu behaupten, was nicht stimmt (23.09.2026).
 *
 * Niemand geht leer aus: Wer nicht gezogen wird, bekommt trotzdem etwas,
 * bei Familienshows den erscheinenden Zauberstab, sonst das Souvenirglas
 * (Florian, 23.09.2026). Nicht geschrieben wird an Gäste, die sich über
 * den Abmeldeweg in der Mail abgemeldet haben.
 */

import { db } from "@/lib/db/client";
import { offeneNachfuehren } from "@/lib/db/shop-buchungen";
import { mailVerschicken } from "@/lib/mail/versand";
import { widersprochene } from "@/lib/db/werbewiderspruch";
import { abbrecher, abbruchEinstellung, angebotVermerken, frageVermerken, type Abbrecher } from "./db";
import { geschenkVersprechen, passendesGeschenk, type GeschenkArt } from "./geschenk";
import { abmeldenLink, angebotMail, frageMail } from "./mails";

/** Wie viele Getränkepakete in einer Woche vergeben werden. */
export const KONTINGENT_JE_WOCHE = 20;

/** Wie lange das Angebot gilt. */
export const ANGEBOT_STUNDEN = 24;

export interface AbbrecherLauf {
  gefragt: number;
  /** Hat das Getränkepaket gewonnen. */
  gezogen: number;
  /** Hat Glas oder Zauberstab bekommen. */
  getroestet: number;
  uebersprungen: number;
  fehler: string[];
}

function stundenSeit(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 3600000;
}

/** Wie viele Pakete diese Woche schon vergeben sind. */
async function schonVergeben(): Promise<number> {
  const z = (await db()`
    select count(*) as n from shop_buchung
     where angebot_am >= date_trunc('week', now())
  `) as Array<{ n: number }>;
  return Number(z[0]?.n ?? 0);
}

/**
 * Zieht zufällig aus einer Liste, ohne sie zu verändern.
 * Fisher-Yates auf einer Kopie, damit die Reihenfolge wirklich zufällig
 * ist und nicht bloß "die ersten der Liste".
 */
function ziehen<T>(liste: T[], wieviele: number): T[] {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie.slice(0, wieviele);
}

export async function abbrecherLauf(probelauf = false): Promise<AbbrecherLauf> {
  const ergebnis: AbbrecherLauf = { gefragt: 0, gezogen: 0, getroestet: 0, uebersprungen: 0, fehler: [] };

  // Aus heisst aus: keine Mail, auch nicht die naechtliche.
  const e = await abbruchEinstellung();
  if (!e.aktiv && !probelauf) return ergebnis;
  let uebrig = e.hoechstens;

  /*
    Vor jedem Versand beim Shop nachfragen, wer bezahlt hat.

    Das ist die wichtigste Stelle dafuer: Eine Mail "du hast deinen
    Warenkorb liegen lassen" an jemanden, der laengst bezahlt hat, ist
    peinlich und kostet Vertrauen. Die Liste allein reicht nicht, weil der
    Zahlungsstand sonst nur beim Oeffnen einer Seite nachgefuehrt wird
    (Florian, 23.09.2026).
  */
  await offeneNachfuehren({ hoechstens: 200, abstandMinuten: 60 }).catch(() => 0);

  const alle = await abbrecher(30);

  /*
    Wer nicht widersprochen hat und noch nicht gekauft hat.

    Ein eigenes Haekchen im Shop gibt es seit dem 23.09.2026 nicht mehr:
    Nach anwaltlicher Auskunft genuegt der Hinweis im Fliesstext, dass wir
    wegen des Ticketkaufs Kontakt aufnehmen. Der Abmeldeweg steht in jeder
    Mail, und wer ihn nutzt, steht hier heraus.
  */
  const abgemeldet = await widersprochene(alle.map((a) => a.email));
  const offen = alle.filter((a) => !a.spaeterGekauft && !abgemeldet.has(a.email.toLowerCase()));
  ergebnis.uebersprungen = alle.length - offen.length;

  /* 1. Die Frage, frühestens vier Stunden und spätestens drei Tage danach. */
  const fragen = offen.filter((a) => !a.frageAm && stundenSeit(a.eingegangenAm) >= 4 && stundenSeit(a.eingegangenAm) <= 72);
  for (const a of fragen) {
    if (probelauf) {
      ergebnis.gefragt++;
      continue;
    }
    if (uebrig <= 0) break;
    try {
      const mail = frageMail(a);
      await mailVerschicken({
        an: a.email,
        betreff: mail.betreff,
        text: mail.text,
        html: mail.html,
        ueberBrevo: true,
        schlagwort: "abbruch-frage",
        abmeldenLink: abmeldenLink(a),
      });
      await frageVermerken(a.id);
      ergebnis.gefragt++;
      uebrig--;
    } catch (f) {
      ergebnis.fehler.push(`${a.email}: ${f instanceof Error ? f.message : f}`);
    }
  }

  /*
    2. Das Angebot, drei Tage nach dem Abbruch.

    Gezogen wird nur, WER das Getränkepaket bekommt. Alle anderen bekommen
    trotzdem etwas: den Zauberstab bei den Familienshows, sonst das
    Souvenirglas. Leer ausgehen soll niemand.
  */
  const kandidaten = offen.filter(
    (a) => !a.angebotAm && stundenSeit(a.eingegangenAm) >= 72 && stundenSeit(a.eingegangenAm) <= 30 * 24,
  );
  const rest = Math.max(0, KONTINGENT_JE_WOCHE - (await schonVergeben()));
  const gezogene = new Set(ziehen(kandidaten, rest).map((a) => a.id));

  for (const a of kandidaten) {
    const art = gezogene.has(a.id) ? "baendchen" : passendesGeschenk(a.show);
    if (probelauf) {
      if (art === "baendchen") ergebnis.gezogen++;
      else ergebnis.getroestet++;
      continue;
    }
    if (uebrig <= 0) break;
    try {
      await angebotSchicken(a, art);
      uebrig--;
      if (art === "baendchen") ergebnis.gezogen++;
      else ergebnis.getroestet++;
    } catch (f) {
      ergebnis.fehler.push(`${a.email}: ${f instanceof Error ? f.message : f}`);
    }
  }

  if (ergebnis.fehler.length) console.error("[abbrecher]", ergebnis.fehler.join("; "));
  return ergebnis;
}

/**
 * Das Angebot verschicken und das Geschenk auf den Namen legen.
 *
 * Gebucht wird nichts: Der Gast meldet sich am Abend an der Magic-Bar,
 * das Foyer sieht ihn unter "Geschenke" und hakt ab.
 */
async function angebotSchicken(a: Abbrecher, art: GeschenkArt): Promise<void> {
  const bis = new Date(Date.now() + ANGEBOT_STUNDEN * 3600000);
  const mail = angebotMail(a, art, bis);
  await mailVerschicken({
    an: a.email,
    betreff: mail.betreff,
    text: mail.text,
    html: mail.html,
    ueberBrevo: true,
    schlagwort: `abbruch-${art}`,
    abmeldenLink: abmeldenLink(a),
  });
  await angebotVermerken(a.id);
  await geschenkVersprechen({
    buchungId: a.id,
    email: a.email,
    name: a.name,
    art,
    anzahl: a.plaetze && a.plaetze > 0 ? a.plaetze : 1,
    giltBis: bis,
  });
}

/** Eine einzelne Mail von Hand, aus der Liste im Eventmanager heraus. */
export async function einzelnSchicken(a: Abbrecher, art: "frage" | "angebot"): Promise<void> {
  if (art === "frage") {
    const mail = frageMail(a);
    await mailVerschicken({
      an: a.email,
      betreff: mail.betreff,
      text: mail.text,
      html: mail.html,
      ueberBrevo: true,
      schlagwort: "abbruch-frage",
      abmeldenLink: abmeldenLink(a),
    });
    await frageVermerken(a.id);
    return;
  }
  await angebotSchicken(a, passendesGeschenk(a.show));
}
