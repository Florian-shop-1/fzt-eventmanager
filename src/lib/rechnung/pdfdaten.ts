/**
 * Woher das Rechnungs-PDF seine Daten nimmt.
 *
 * Alles steht in der Rechnung selbst, auch der Absender: Ändert sich
 * später die Bankverbindung, muss eine alte Rechnung trotzdem so
 * aussehen wie an dem Tag, an dem sie rausging (Florian, 25.09.2026).
 */

import { db } from "@/lib/db/client";
import type { Position } from "@/lib/domain/vorgang";
import { angebotsAbsender } from "@/lib/angebot/pdfdaten";
import type { Absender } from "@/lib/angebot/pdf";
import { RESERVIERUNGSHINWEIS } from "./aus-angebot";
import type { RechnungsPdfDaten } from "./pdf-event";

/** Die Anschrift des Kunden, soweit sie am Vorgang hängt. */
interface Zeile {
  nummer: string;
  rechnungsdatum: string;
  faellig_am: string;
  zahlungsziel_tage: number;
  leistung: string;
  leistungszeitraum: string;
  kunde: string;
  positionen: Position[] | null;
  absender: Absender | null;
  bezahlt_cent: number | null;
  ansprechpartner: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
}

const ABFRAGE = `
  select r.nummer,
         to_char(r.rechnungsdatum, 'YYYY-MM-DD') as rechnungsdatum,
         to_char(r.faellig_am, 'YYYY-MM-DD')     as faellig_am,
         r.zahlungsziel_tage, r.leistung, r.leistungszeitraum, r.kunde,
         r.positionen, r.absender,
         (select coalesce(sum(z.betrag_cent), 0) from rechnung_zahlung z
           where z.rechnung_id = r.id)           as bezahlt_cent,
         k.ansprechpartner, k.strasse, k.plz, k.ort
    from rechnung r
    left join vorgang v on v.id = r.vorgang_id
    left join kunde k   on k.id = v.kunde_id
`;

async function bauen(z: Zeile | undefined): Promise<RechnungsPdfDaten | null> {
  if (!z) return null;
  if (!z.positionen || z.positionen.length === 0) return null;

  return {
    nummer: z.nummer,
    rechnungsdatum: z.rechnungsdatum,
    faelligAm: z.faellig_am,
    zahlungszielTage: Number(z.zahlungsziel_tage),
    leistung: z.leistung,
    leistungszeitpunkt: z.leistungszeitraum || null,
    kunde: {
      name: z.kunde,
      ansprechpartner: z.ansprechpartner,
      strasse: z.strasse,
      plz: z.plz,
      ort: z.ort,
    },
    positionen: z.positionen,
    // Eine Anzahlung mindert den offenen Betrag, nicht den Rechnungsbetrag.
    anzahlungCent: Number(z.bezahlt_cent ?? 0),
    hinweis: RESERVIERUNGSHINWEIS,
    absender: z.absender ?? (await angebotsAbsender()),
  };
}

/** Für das Büro, über die Kennung. */
export async function rechnungsPdfDaten(rechnungId: string): Promise<RechnungsPdfDaten | null> {
  const zeilen = (await db().query(ABFRAGE + " where r.id = $1", [rechnungId])) as Zeile[];
  return bauen(zeilen[0]);
}

/**
 * Für den Kunden, über den Schlüssel aus seinem Link.
 * Der erste Aufruf wird vermerkt: So sieht das Büro, ob die Rechnung
 * angekommen ist, bevor es nachfasst.
 */
export async function rechnungsPdfDatenFuerKunden(token: string): Promise<RechnungsPdfDaten | null> {
  const zeilen = (await db().query(ABFRAGE + " where r.zugang_token = $1", [token])) as Zeile[];
  const daten = await bauen(zeilen[0]);
  if (daten) {
    await db()`
      update rechnung set zuerst_geoeffnet_am = coalesce(zuerst_geoeffnet_am, now())
       where zugang_token = ${token}::uuid
    `;
  }
  return daten;
}

/** Der Dateiname, unter dem der Kunde die Rechnung bekommt. */
export function rechnungsDateiname(nummer: string): string {
  return `Rechnung-${nummer}-Florian-Zimmer-Theater.pdf`;
}
