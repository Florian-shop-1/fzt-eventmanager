/**
 * Der tägliche Lauf für die Bewertungsmail.
 *
 * Jeden Morgen um 10 Uhr: Wer hat gestern eine Show gesehen, bezahlt, eine
 * Adresse, noch keine Bewertungsmail und nicht widersprochen? Diese Gäste
 * bekommen die Mail. Aufbau und Gründe wie bei der Vorfreude-Mail
 * (mail/vorfreudelauf.ts).
 *
 * Solange der Schalter unter /bewertung aus ist, verschickt die Uhr nichts.
 */

import { buchungenFuerTag, type ShopBuchung } from "@/lib/db/shop-buchungen";
import { widersprochene, adresse } from "@/lib/db/werbewiderspruch";
import { bewertungAktiv, merkeBewertungMail } from "@/lib/db/bewertung";
import { baueBewertungsmail } from "@/lib/mail/bewertung";
import { mailVerschicken } from "@/lib/mail/versand";
import { isoDatum } from "@/lib/zeit";
import { db } from "@/lib/db/client";

export interface BewertungsLauf {
  datum: string;
  gefunden: number;
  verschickt: string[];
  uebersprungen: { email: string; grund: string }[];
  fehler: { email: string; meldung: string }[];
  probelauf: boolean;
  ausgeschaltet?: boolean;
}

/** Der Showtag von gestern, nach hiesiger Zeit. */
export function gestern(heute: Date = new Date()): string {
  const tag = new Date(`${isoDatum(heute)}T12:00:00Z`);
  tag.setUTCDate(tag.getUTCDate() - 1);
  return tag.toISOString().slice(0, 10);
}

async function bewertungMailAm(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const zeilen = (await db()`
    select id from shop_buchung where id = any(${ids}::uuid[]) and bewertung_mail_am is not null
  `) as Array<{ id: string }>;
  return new Set(zeilen.map((z) => String(z.id)));
}

function grund(b: ShopBuchung, schonGeschrieben: Set<string>, abgemeldet: Set<string>): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.datum)) return "Datum unlesbar";
  if (!b.bestaetigt) return "nicht bezahlt";
  if (!b.email || !b.email.includes("@")) return "keine Adresse";
  if (schonGeschrieben.has(b.id)) return "schon geschrieben";
  if (abgemeldet.has(adresse(b.email))) return "abgemeldet";
  return null;
}

/**
 * Pro Adresse nur eine Mail am Tag. Wer für sich und die Freunde zweimal
 * gebucht hat, soll nicht zweimal nach demselben Abend gefragt werden.
 */
export async function bewertungenVerschicken(datum: string, probelauf = false): Promise<BewertungsLauf> {
  const buchungen = await buchungenFuerTag(datum);
  const ergebnis: BewertungsLauf = {
    datum, gefunden: buchungen.length, verschickt: [], uebersprungen: [], fehler: [], probelauf,
  };
  if (buchungen.length === 0) return ergebnis;

  const schon = await bewertungMailAm(buchungen.map((b) => b.id));
  const abgemeldet = await widersprochene(buchungen.map((b) => b.email));
  const heuteAngeschrieben = new Set<string>();

  for (const b of buchungen) {
    const g = grund(b, schon, abgemeldet);
    if (g) {
      ergebnis.uebersprungen.push({ email: b.email || "(ohne Adresse)", grund: g });
      continue;
    }
    if (heuteAngeschrieben.has(adresse(b.email))) {
      ergebnis.uebersprungen.push({ email: b.email, grund: "zweite Buchung derselben Adresse" });
      continue;
    }
    heuteAngeschrieben.add(adresse(b.email));

    if (probelauf) {
      ergebnis.verschickt.push(b.email);
      continue;
    }

    const mail = baueBewertungsmail(b);
    try {
      await mailVerschicken({
        an: b.email,
        betreff: mail.betreff,
        text: mail.text,
        html: mail.html,
        antwortAn: "tickets@florianzimmer.com",
        ueberBrevo: true,
        schlagwort: "bewertung",
        abmeldenLink: `${(process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de")}/abmelden/${b.zugangToken}`,
      });
      await merkeBewertungMail(b.id);
      ergebnis.verschickt.push(b.email);
    } catch (f) {
      ergebnis.fehler.push({ email: b.email, meldung: f instanceof Error ? f.message : "Unbekannter Fehler" });
    }
  }
  return ergebnis;
}

/** Was die Uhr um 10 Uhr aufruft. */
export async function taeglicherBewertungslauf(): Promise<BewertungsLauf> {
  const datum = gestern();
  if (!(await bewertungAktiv()).aktiv) {
    return { datum, gefunden: 0, verschickt: [], uebersprungen: [], fehler: [], probelauf: false, ausgeschaltet: true };
  }
  return bewertungenVerschicken(datum);
}
