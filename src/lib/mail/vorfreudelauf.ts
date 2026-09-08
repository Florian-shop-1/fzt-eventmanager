/**
 * Der tägliche Lauf für die Vorfreude-Mail.
 *
 * Einmal am Tag wird gefragt: Welche Shows sind in genau einer Woche, und wer
 * hat dafür bezahlt, aber noch keine Mail bekommen? Diese Menschen bekommen
 * sie, alle anderen nicht.
 *
 * Vier Bedingungen, jede davon aus einem eigenen Grund:
 *
 *  - BEZAHLT. Gespeichert wird beim Übergang zur Kasse, also bevor Geld
 *    geflossen ist. Wer wegen des Preises abgebrochen hat, ist kein Kunde,
 *    und eine Werbemail an ihn wäre nicht nur unhöflich, sondern nach § 7
 *    UWG auch nicht gedeckt. buchungenFuerTag fragt dafür beim Shop nach.
 *  - NOCH KEINE MAIL. Der Lauf darf mehrfach angestoßen werden, von der Uhr
 *    und von Hand, ohne dass jemand zweimal geschrieben bekommt.
 *  - KEIN WIDERSPRUCH. Siehe werbewiderspruch.ts.
 *  - EINE ADRESSE. Ohne E-Mail gibt es nichts zu tun.
 *
 * Verschickt wird nacheinander, nicht parallel. Es geht um wenige Mails pro
 * Tag, und Microsoft bremst gleichzeitige Sendungen aus demselben Postfach.
 * Ein Fehler bei einem Gast beendet den Lauf nicht: Die übrigen bekommen ihre
 * Mail, der gescheiterte bleibt unmarkiert und ist morgen wieder dran.
 */

import { buchungenFuerTag, merkeMailGesendet, type ShopBuchung } from "@/lib/db/shop-buchungen";
import { widersprochene, adresse } from "@/lib/db/werbewiderspruch";
import { baueVorfreudemail } from "@/lib/mail/vorfreude";
import { mailVerschicken } from "@/lib/mail/versand";
import { isoDatum } from "@/lib/zeit";

/** Wie viele Tage vor der Show geschrieben wird. */
export const VORLAUF_TAGE = 7;

export interface LaufErgebnis {
  /** Der Showtag, um den es ging. */
  datum: string;
  /** Buchungen an diesem Tag insgesamt. */
  gefunden: number;
  verschickt: string[];
  /** Wer übersprungen wurde, mit Grund. Für die Übersicht im Programm. */
  uebersprungen: { email: string; grund: string }[];
  fehler: { email: string; meldung: string }[];
  /** Bei true wurde nichts verschickt, nur gezeigt, was passieren würde. */
  probelauf: boolean;
}

/**
 * Der Showtag, der in genau einer Woche ist, nach hiesiger Zeit.
 *
 * Erst das heutige Datum in Ulm bestimmen, dann sieben Tage im Kalender
 * weiterzählen. Sieben mal 24 Stunden zu addieren wäre falsch: In den beiden
 * Nächten der Zeitumstellung hat der Tag 23 oder 25 Stunden.
 */
export function zieldatum(heute: Date = new Date()): string {
  const tag = new Date(`${isoDatum(heute)}T12:00:00Z`);
  tag.setUTCDate(tag.getUTCDate() + VORLAUF_TAGE);
  return tag.toISOString().slice(0, 10);
}

function grundZumUeberspringen(b: ShopBuchung, abgemeldet: Set<string>): string | null {
  if (!b.bestaetigt) return "nicht bezahlt";
  if (!b.email || !b.email.includes("@")) return "keine Adresse";
  if (b.mailGesendetAm) return "schon geschrieben";
  if (abgemeldet.has(adresse(b.email))) return "abgemeldet";
  return null;
}

/**
 * Schickt die Mails für einen Showtag.
 *
 * Mit probelauf = true wird nichts verschickt und nichts markiert. Der Bericht
 * sieht genauso aus. Gedacht für den Blick ins Programm, bevor man den Knopf
 * wirklich drückt.
 */
export async function vorfreudeVerschicken(
  datum: string,
  probelauf = false,
): Promise<LaufErgebnis> {
  const buchungen = await buchungenFuerTag(datum);
  const ergebnis: LaufErgebnis = {
    datum,
    gefunden: buchungen.length,
    verschickt: [],
    uebersprungen: [],
    fehler: [],
    probelauf,
  };
  if (buchungen.length === 0) return ergebnis;

  const abgemeldet = await widersprochene(buchungen.map((b) => b.email));

  for (const b of buchungen) {
    const grund = grundZumUeberspringen(b, abgemeldet);
    if (grund) {
      ergebnis.uebersprungen.push({ email: b.email || "(ohne Adresse)", grund });
      continue;
    }

    if (probelauf) {
      ergebnis.verschickt.push(b.email);
      continue;
    }

    const mail = baueVorfreudemail(b);
    try {
      await mailVerschicken({
        an: b.email,
        betreff: mail.betreff,
        text: mail.text,
        antwortAn: "tickets@florianzimmer.com",
      });
      // Erst nach dem Versand markieren, siehe merkeMailGesendet.
      await merkeMailGesendet(b.id);
      ergebnis.verschickt.push(b.email);
    } catch (f) {
      ergebnis.fehler.push({
        email: b.email,
        meldung: f instanceof Error ? f.message : "Unbekannter Fehler",
      });
    }
  }

  return ergebnis;
}

/** Der Lauf, wie ihn die Uhr auslöst: der Tag in einer Woche. */
export async function taeglicherLauf(): Promise<LaufErgebnis> {
  return vorfreudeVerschicken(zieldatum());
}
