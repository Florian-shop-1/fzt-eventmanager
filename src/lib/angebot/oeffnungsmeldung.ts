/**
 * Der Kunde hat das Angebot geöffnet. Jetzt anrufen.
 *
 * "ich möchte sehen, ob der kunde die mail mit dem angebot geöffnet hat.
 * sobald er sie geöffnet hat, muss bei kevin eine mail eingehen. er soll
 * dann anrufen, das fühlt sich dann an wie eine fügung des schicksals
 * für den kunden" (Florian, 26.10.2026).
 *
 * Genau so ist es auch: Wer gerade auf das Angebot schaut, hat den Abend
 * im Kopf. Ein Anruf in dieser Minute trifft auf jemanden, der ohnehin
 * schon überlegt.
 *
 * Gemeldet wird höchstens einmal in vierundzwanzig Stunden je Angebot.
 * Wer dreimal am Tag hineinschaut, weil er es dem Chef zeigt, soll nicht
 * dreimal einen Anruf auslösen.
 *
 * Nichts davon darf den Aufruf der Angebotsseite aufhalten. Geht die Mail
 * nicht hinaus, sieht es der Kunde nicht, und im Protokoll steht, warum.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";
import type { AngebotDetail } from "./lesen";

const APP = process.env.EVENTMANAGER_URL ?? "https://eventmanager.florianzimmertheater.de";

/** Wer die Meldung bekommt. Mehrere Adressen mit Komma. */
function empfaenger(): string[] {
  return (
    process.env.ANGEBOT_MELDEN_AN ?? "kevin.steele@florianzimmer.com,info@florianzimmer.com"
  )
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.includes("@"));
}

const euro = (cent: number) => (cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " EUR";

/** Hat dieses Angebot in den letzten 24 Stunden schon eine Meldung ausgelöst? */
async function schonGemeldet(angebotId: string): Promise<boolean> {
  const z = (await db()`
    select 1 from angebot_meldung
     where angebot_id = ${angebotId}::uuid and gemeldet_am > now() - interval '24 hours'
     limit 1
  `.catch(() => [])) as unknown[];
  return z.length > 0;
}

export async function oeffnungMelden(angebot: AngebotDetail): Promise<void> {
  try {
    if (await schonGemeldet(angebot.id)) return;

    // Erst merken, dann schicken: Zwei gleichzeitige Aufrufe sollen nicht
    // zwei Mails erzeugen.
    const gemerkt = (await db()`
      insert into angebot_meldung (angebot_id) values (${angebot.id}::uuid)
      on conflict do nothing
      returning id
    `.catch(() => [])) as unknown[];
    if (gemerkt.length === 0) return;

    const [telefon] = (await db()`
      select coalesce(k.telefon, '') as telefon, coalesce(k.ansprechpartner, '') as ansprechpartner
        from vorgang v join kunde k on k.id = v.kunde_id
       where v.id = ${angebot.vorgangId}::uuid
    `.catch(() => [])) as Array<{ telefon: string; ansprechpartner: string }>;

    /*
      Die Summe ohne die Wahlpositionen.

      Alternativen und optionale Zeilen gehoeren nicht dazu: Sonst
      stuende in der Mail eine Zahl, die der Kunde so nie gesehen hat.
    */
    const summe = angebot.positionen
      .filter((p) => !p.optional && !p.istAlternativeZu)
      .reduce((s, p) => {
        const roh = p.einzelBruttoCent * p.menge;
        return s + Math.round(roh * (1 - (p.rabattProzent ?? 0) / 100));
      }, 0);

    const wievielte = angebot.oeffnungen.length + 1;
    const abend = angebot.vorstellung
      ? `${new Date(angebot.vorstellung.datum).toLocaleDateString("de-DE")}, ${angebot.vorstellung.show}`
      : "Termin steht noch offen";

    const text = [
      `${angebot.kunde.name} schaut sich gerade euer Angebot ${angebot.nummer} an.`,
      "",
      `Abend: ${abend}`,
      `Angebotssumme: ${euro(summe)}`,
      telefon?.ansprechpartner ? `Ansprechpartner: ${telefon.ansprechpartner}` : "",
      telefon?.telefon ? `Telefon: ${telefon.telefon}` : "Telefonnummer fehlt im Vorgang.",
      `E-Mail: ${angebot.kunde.email}`,
      wievielte > 1 ? `Das ist der ${wievielte}. Besuch auf der Angebotsseite.` : "",
      "",
      "Ruf jetzt an, nicht morgen.",
      "Er hat den Abend in diesem Moment vor Augen, und ein Anruf genau jetzt fühlt sich für ihn",
      "an wie eine Fügung des Schicksals. In einer Stunde ist es nur noch ein Verkaufsanruf.",
      "",
      `Vorgang öffnen: ${APP}/vorgaenge/${angebot.vorgangId}`,
    ]
      .filter((z) => z !== "")
      .join("\n");

    for (const an of empfaenger()) {
      await mailVerschicken({
        an,
        absender: postfachPersonal(),
        antwortAn: antwortPersonal(),
        betreff: `Angebot geöffnet: ${angebot.kunde.name} (${euro(summe)})`,
        text,
      }).catch((f) => console.error("[angebot] Öffnungsmeldung an", an, "fehlgeschlagen:", f));
    }

    console.log("[angebot] Öffnung gemeldet:", angebot.nummer, angebot.kunde.name);
  } catch (f) {
    console.error("[angebot] Öffnungsmeldung fehlgeschlagen:", f);
  }
}
