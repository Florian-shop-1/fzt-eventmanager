/**
 * Ist die Rechnung an die Gastro bezahlt? Das sagt das Konto.
 *
 * Bisher fragte das Programm bei Lexware Office nach, ob eine Rechnung
 * bezahlt ist. Lexware Office soll aber weg, und der Umweg ist ohnehin
 * seltsam: Das Geld kommt auf unser Konto, und dessen Umsätze lesen wir
 * längst selbst (Florian, 30.09.2026).
 *
 * Erkannt wird eine Zahlung an drei Dingen, in dieser Reihenfolge:
 *
 *  1. Die Rechnungsnummer steht im Verwendungszweck. Das ist der sichere
 *     Fall, denn genau dafür steht sie dort.
 *  2. Der Betrag stimmt auf den Cent und der Name passt zur Gastro.
 *  3. Sonst nichts. Ein ungefährer Treffer wäre schlimmer als keiner:
 *     Eine falsch abgehakte Rechnung mahnt niemand mehr an.
 */

import { db } from "@/lib/db/client";
import type { WeinRechnung } from "./rechnung";

export interface Zahlungstreffer {
  buchungstag: string;
  betragCent: number;
  gegenname: string;
  verwendungszweck: string;
  /** Woran die Zahlung erkannt wurde. */
  grund: "nummer" | "betrag";
}

/** Vergleichbar machen: ohne Leerzeichen, klein. */
function kern(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/**
 * Sucht die Zahlung zu einer Rechnung in den Kontoumsätzen.
 *
 * Gesucht wird ab dem Tag der Rechnung, denn früher kann sie nicht
 * bezahlt worden sein, und höchstens ein halbes Jahr weit.
 */
export async function zahlungZuRechnung(r: WeinRechnung): Promise<Zahlungstreffer | null> {
  const ab = r.erstelltAm.slice(0, 10);

  const zeilen = (await db()`
    select buchungstag::text as buchungstag, betrag_cent, gegenname, verwendungszweck
      from bank_umsatz
     where betrag_cent > 0
       and buchungstag >= ${ab}::date - 3
       and buchungstag <= ${ab}::date + 190
     order by buchungstag
  `) as Array<Record<string, unknown>>;

  const nummer = (r.nummer ?? "").trim();
  const treffer: Zahlungstreffer[] = zeilen.map((z) => ({
    buchungstag: String(z.buchungstag),
    betragCent: Number(z.betrag_cent),
    gegenname: String(z.gegenname ?? ""),
    verwendungszweck: String(z.verwendungszweck ?? ""),
    grund: "betrag" as const,
  }));

  if (nummer) {
    const perNummer = treffer.find((t) => kern(t.verwendungszweck).includes(kern(nummer)));
    if (perNummer) return { ...perNummer, grund: "nummer" };
  }

  /*
    Ohne Rechnungsnummer im Verwendungszweck: Betrag und Name müssen
    beide passen. Die Gastro heisst im Kontoauszug "OK Magic Taste GmbH",
    manchmal mit Zusätzen.
  */
  const perBetrag = treffer.find(
    (t) => t.betragCent === r.bruttoCent && /magic\s*taste|gastro/i.test(t.gegenname),
  );
  return perBetrag ?? null;
}

/**
 * Prüft alle offenen Rechnungen gegen das Konto und hakt ab, was bezahlt ist.
 *
 * Zurück kommt, wie viele neu als bezahlt erkannt wurden.
 */
export async function zahlungenAmKontoPruefen(): Promise<{ geprueft: number; bezahlt: number }> {
  const offen = (await db()`
    select id, monat, nummer, netto_cent, ust_cent, brutto_cent, erstellt_am, versendet_am,
           versendet_an, status, bezahlt_am, lexoffice_id, (pdf is not null) as hat_pdf
      from wein_rechnung
     where bezahlt_am is null and status <> 'voided'
     order by monat
  `) as Array<Record<string, unknown>>;

  let bezahlt = 0;
  for (const z of offen) {
    const r: WeinRechnung = {
      id: String(z.id),
      monat: String(z.monat),
      nummer: (z.nummer as string) ?? null,
      nettoCent: Number(z.netto_cent ?? 0),
      ustCent: Number(z.ust_cent ?? 0),
      bruttoCent: Number(z.brutto_cent ?? 0),
      erstelltAm: new Date(z.erstellt_am as string).toISOString(),
      versendetAm: z.versendet_am ? new Date(z.versendet_am as string).toISOString() : null,
      versendetAn: (z.versendet_an as string[]) ?? [],
      status: String(z.status ?? "open"),
      bezahltAm: null,
      lexofficeId: (z.lexoffice_id as string) ?? null,
      hatPdf: Boolean(z.hat_pdf),
    };

    const t = await zahlungZuRechnung(r).catch(() => null);
    if (!t) continue;

    await db()`
      update wein_rechnung
         set bezahlt_am = ${t.buchungstag}::timestamptz,
             status = 'paid',
             status_geprueft_am = now()
       where id = ${r.id}
    `;
    bezahlt++;
  }

  return { geprueft: offen.length, bezahlt };
}
