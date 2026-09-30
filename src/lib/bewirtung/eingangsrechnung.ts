/**
 * Eingangsrechnungen: Was schuldet das Haus wem, und ist es bezahlt?
 *
 * Werners Arbeit in einer Ansicht. Bisher hat er jede Kreditkartenzahlung
 * von Hand mit den Belegen verglichen und in einer Liste nachgehalten, was
 * noch offen ist (Florian, 30.09.2026).
 *
 * Bezahlt heisst hier: Der Rechnung ist eine Abbuchung vom Konto zugeordnet
 * (bank_umsatz.beleg_id). Das ist die einzige Wahrheit dazu; ein zweites
 * Feld "bezahlt" am Beleg wuerde irgendwann etwas anderes behaupten als das
 * Konto.
 */

import { db } from "@/lib/db/client";
import type { Gesellschaft } from "./gesellschaft";

export interface Eingangsrechnung {
  id: string;
  nummer: string | null;
  lieferant: string;
  lieferantNummer: string;
  datum: string | null;
  faelligAm: string | null;
  betragCent: number;
  gesellschaft: Gesellschaft;
  status: string;
  herkunft: string;
  mailVon: string;
  /** Wann sie bezahlt wurde, sonst null. */
  bezahltAm: string | null;
  /** Von welchem Konto, letzte vier Stellen. */
  bezahltKonto: string;
  bezahltCent: number | null;
  /** Tage über der Fälligkeit, negativ wenn noch Zeit ist. */
  tageUeberfaellig: number | null;
}

function tageBis(datum: string | null): number | null {
  if (!datum) return null;
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  return Math.round((Date.parse(`${heute}T12:00:00Z`) - Date.parse(`${datum}T12:00:00Z`)) / 86400000);
}

/**
 * Alle Eingangsrechnungen mit ihrem Zahlstand.
 *
 * Die Verknüpfung läuft über bank_umsatz.beleg_id, also über den
 * Belegabgleich. Was dort zugeordnet wurde, gilt hier als bezahlt.
 */
export async function eingangsrechnungen(o: { nur?: "offen" | "bezahlt"; tage?: number } = {}): Promise<
  Eingangsrechnung[]
> {
  const zeilen = (await db()`
    select b.id, b.nummer, b.restaurant, b.lieferant_nummer, b.datum::text as datum,
           b.faellig_am::text as faellig_am, b.brutto_cent, b.trinkgeld_cent, b.gesellschaft,
           b.status, b.herkunft, b.mail_von,
           u.buchungstag::text as bezahlt_am, u.konto as bezahlt_konto, u.betrag_cent as bezahlt_cent
      from bewirtung b
      left join bank_umsatz u on u.beleg_id = b.id
     where b.status <> 'storniert'
       and b.erstellt_am >= now() - (${o.tage ?? 365} || ' days')::interval
     order by coalesce(b.faellig_am, b.datum) desc nulls last, b.erstellt_am desc
  `) as Array<Record<string, unknown>>;

  const alle = zeilen.map((r) => {
    const bezahltAm = r.bezahlt_am ? String(r.bezahlt_am) : null;
    const faellig = r.faellig_am ? String(r.faellig_am) : null;
    return {
      id: String(r.id),
      nummer: (r.nummer as string) ?? null,
      lieferant: String(r.restaurant ?? ""),
      lieferantNummer: String(r.lieferant_nummer ?? ""),
      datum: r.datum ? String(r.datum) : null,
      faelligAm: faellig,
      betragCent: Number(r.brutto_cent ?? 0) + Number(r.trinkgeld_cent ?? 0),
      gesellschaft: (r.gesellschaft as Gesellschaft) ?? "fzt",
      status: String(r.status ?? ""),
      herkunft: String(r.herkunft ?? "foto"),
      mailVon: String(r.mail_von ?? ""),
      bezahltAm,
      bezahltKonto: String(r.bezahlt_konto ?? ""),
      bezahltCent: r.bezahlt_cent === null || r.bezahlt_cent === undefined ? null : Math.abs(Number(r.bezahlt_cent)),
      // Überfällig zählt nur, solange nichts bezahlt ist.
      tageUeberfaellig: bezahltAm ? null : tageBis(faellig),
    };
  });

  if (o.nur === "offen") return alle.filter((r) => !r.bezahltAm);
  if (o.nur === "bezahlt") return alle.filter((r) => r.bezahltAm);
  return alle;
}

export interface Rechnungsstand {
  offen: number;
  offenCent: number;
  ueberfaellig: number;
  ueberfaelligCent: number;
  bezahlt: number;
  bezahltCent: number;
  /** Bezahlt, aber der Betrag weicht vom Beleg ab. */
  abweichungen: number;
}

export function rechnungsstand(liste: Eingangsrechnung[]): Rechnungsstand {
  const offen = liste.filter((r) => !r.bezahltAm);
  const ueber = offen.filter((r) => (r.tageUeberfaellig ?? -1) > 0);
  const bezahlt = liste.filter((r) => r.bezahltAm);
  return {
    offen: offen.length,
    offenCent: offen.reduce((n, r) => n + r.betragCent, 0),
    ueberfaellig: ueber.length,
    ueberfaelligCent: ueber.reduce((n, r) => n + r.betragCent, 0),
    bezahlt: bezahlt.length,
    bezahltCent: bezahlt.reduce((n, r) => n + r.betragCent, 0),
    /*
      Abweichung zwischen Beleg und Abbuchung.

      Ein paar Cent koennen durch Rundung entstehen, deshalb erst ab einem
      Euro. Alles darueber sollte sich jemand ansehen: Skonto, Teilzahlung
      oder schlicht der falsche Beleg zugeordnet.
    */
    abweichungen: bezahlt.filter(
      (r) => r.bezahltCent !== null && Math.abs(r.bezahltCent - r.betragCent) >= 100,
    ).length,
  };
}

/** Fälligkeit und Rechnungsnummer des Lieferanten nachtragen. */
export async function rechnungsdatenSetzen(o: {
  id: string;
  faelligAm: string | null;
  lieferantNummer: string;
  istRechnung: boolean;
}): Promise<void> {
  await db()`
    update bewirtung
       set faellig_am = ${o.faelligAm}::date,
           lieferant_nummer = ${o.lieferantNummer.trim().slice(0, 80)},
           ist_rechnung = ${o.istRechnung}
     where id = ${o.id}::uuid
  `;
}

export interface Postlaufstand {
  zuletztAm: string | null;
  gesehen: number;
  neu: number;
  ohneAnhang: number;
  fehlerAnzahl: number;
  letzterFehler: string;
}

export async function postlaufStand(): Promise<Postlaufstand> {
  const z = (await db()`select * from rechnungspost_lauf where id = 1`) as Array<Record<string, unknown>>;
  const r = z[0] ?? {};
  return {
    zuletztAm: r.zuletzt_am ? new Date(r.zuletzt_am as string).toISOString() : null,
    gesehen: Number(r.gesehen ?? 0),
    neu: Number(r.neu ?? 0),
    ohneAnhang: Number(r.ohne_anhang ?? 0),
    fehlerAnzahl: Number(r.fehler_anzahl ?? 0),
    letzterFehler: String(r.letzter_fehler ?? ""),
  };
}

export async function postlaufMerken(o: {
  gesehen: number;
  neu: number;
  ohneAnhang: number;
  fehlerAnzahl: number;
  letzterFehler: string;
}): Promise<void> {
  await db()`
    insert into rechnungspost_lauf (id, zuletzt_am, gesehen, neu, ohne_anhang, fehler_anzahl, letzter_fehler)
    values (1, now(), ${o.gesehen}, ${o.neu}, ${o.ohneAnhang}, ${o.fehlerAnzahl}, ${o.letzterFehler.slice(0, 500)})
    on conflict (id) do update set
      zuletzt_am = now(), gesehen = excluded.gesehen, neu = excluded.neu,
      ohne_anhang = excluded.ohne_anhang, fehler_anzahl = excluded.fehler_anzahl,
      letzter_fehler = excluded.letzter_fehler
  `;
}
