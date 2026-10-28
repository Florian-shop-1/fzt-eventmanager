/**
 * Wer im Posteingang schon ein Angebot von uns hat.
 *
 * "im eventmanager waere schoen, wenn du da im posteingang das
 * entsprechend markierst, dass das der kunde ist wo du ein angebot
 * rausgeschickt hast" (Florian, 28.10.2026).
 *
 * Der Grund ist der Ton: Wer gerade ein Angebot ueber ein paar tausend
 * Euro bekommen hat und dann per WhatsApp eine Frage stellt, darf nicht
 * wie eine fremde Anfrage behandelt werden. Wer antwortet, soll das
 * sehen, bevor er tippt, und mit einem Klick im Vorgang landen.
 *
 * Erkannt wird ueber Mailadresse und Telefonnummer des Kunden. Beides
 * kann fehlen, dann gibt es eben keine Markierung: Lieber keine als eine
 * falsche, hier haengt der Ton gegenueber einem zahlenden Kunden dran.
 */

import { db } from "@/lib/db/client";
import { alsWaNummer } from "@/lib/whatsapp/kennung";

export type Angebotsstand = "offen" | "angenommen" | "abgelehnt" | "abgelaufen";

export type Angebotskunde = {
  vorgangId: string;
  vorgangNummer: string;
  kundenname: string;
  angebotNummer: string;
  versendetAm: string;
  stand: Angebotsstand;
};

/** Aelter als das interessiert niemanden mehr im Posteingang. */
const MONATE = 18;

function stand(z: Record<string, unknown>): Angebotsstand {
  if (z.angenommen_am) return "angenommen";
  if (z.abgelehnt_am) return "abgelehnt";
  const bis = z.gueltig_bis ? new Date(String(z.gueltig_bis)) : null;
  if (bis && bis.getTime() < Date.now() - 86_400_000) return "abgelaufen";
  return "offen";
}

/**
 * Schluessel sind die kleingeschriebene Mailadresse und die Nummer in
 * WhatsApp-Schreibweise (nur Ziffern mit Laendervorwahl). Beide zeigen
 * auf denselben Eintrag, damit die Suche im Posteingang egal ist, ob der
 * Kunde ueber Formular oder WhatsApp schreibt.
 */
export async function angebotsKunden(): Promise<Map<string, Angebotskunde>> {
  const zeilen = (await db()`
    select v.id as vorgang_id, v.nummer as vorgang_nummer, k.name as kundenname,
           k.email, k.telefon, a.nummer as angebot_nummer, a.versendet_am,
           a.angenommen_am, a.abgelehnt_am, a.gueltig_bis
      from angebot a
      join vorgang v on v.id = a.vorgang_id
      join kunde k   on k.id = v.kunde_id
     where a.versendet_am is not null
       and a.versendet_am > now() - make_interval(months => ${MONATE})
     order by a.versendet_am desc
  `) as Array<Record<string, unknown>>;

  const karte = new Map<string, Angebotskunde>();
  // Neueste zuerst: Was schon steht, bleibt stehen. So gewinnt bei
  // mehreren Angeboten an dieselbe Firma das juengste.
  for (const z of zeilen) {
    const eintrag: Angebotskunde = {
      vorgangId: String(z.vorgang_id),
      vorgangNummer: String(z.vorgang_nummer),
      kundenname: String(z.kundenname),
      angebotNummer: String(z.angebot_nummer),
      versendetAm: new Date(String(z.versendet_am)).toISOString(),
      stand: stand(z),
    };
    for (const schluessel of schluesselVon(z.email as string, z.telefon as string)) {
      if (!karte.has(schluessel)) karte.set(schluessel, eintrag);
    }
  }
  return karte;
}

function schluesselVon(email: string | null, telefon: string | null): string[] {
  const raus: string[] = [];
  const mail = (email ?? "").trim().toLowerCase();
  if (mail.includes("@")) raus.push(`mail:${mail}`);
  const nummer = alsWaNummer(telefon);
  if (nummer) raus.push(`tel:${nummer}`);
  return raus;
}

/** Der passende Eintrag zu einer Unterhaltung, oder null. */
export function angebotZu(
  karte: Map<string, Angebotskunde>,
  u: { waId: string; email: string | null; telefon: string | null },
): Angebotskunde | null {
  const mail = (u.email ?? "").trim().toLowerCase();
  if (mail.includes("@")) {
    const treffer = karte.get(`mail:${mail}`);
    if (treffer) return treffer;
  }
  for (const nummer of [alsWaNummer(u.telefon), alsWaNummer(u.waId)]) {
    if (!nummer) continue;
    const treffer = karte.get(`tel:${nummer}`);
    if (treffer) return treffer;
  }
  return null;
}
