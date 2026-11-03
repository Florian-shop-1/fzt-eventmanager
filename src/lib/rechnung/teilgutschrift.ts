import { db } from "@/lib/db/client";
import { merken, rechnungLesen, type Rechnung } from "@/lib/rechnung/db";

/**
 * Eine Teilgutschrift zu einer Rechnung (Florian, 03.11.2026).
 *
 * FloTix storniert einzelne Positionen einer Bestellung auf Rechnung und stellt dazu eine Stornorechnung aus. Hier mindert sich
 * der Rechnungsbetrag um die Gutschrift: Die Rechnung bleibt bestehen (sie wird nicht storniert), ihr Betrag sinkt, der offene
 * Betrag und der Stand (offen, ueberfaellig, bezahlt) rechnen sich daraus von selbst neu. Wurde mehr bezahlt als der neue Betrag,
 * steht die Differenz als Ueberzahlung da, und das Geld muss von Hand zurueck.
 *
 * Wiederholbar: Dieselbe Nummer der Stornorechnung mindert den Betrag nur einmal.
 */

export type TeilgutschriftErgebnis =
  | { ok: true; schonVerbucht: boolean; rechnung: Rechnung }
  | { ok: false; status: number; fehler: string };

export async function teilgutschriftBuchen(o: {
  rechnungsnummer: string;
  /** Die Nummer der Stornorechnung aus FloTix. */
  gutschriftNummer: string;
  /** Um wie viel der Rechnungsbetrag sinkt, in Cent, brutto. */
  betragCent: number;
  grund: string;
  wer: string;
}): Promise<TeilgutschriftErgebnis> {
  const sql = db();
  const gefunden = (await sql`select id from rechnung where upper(nummer) = upper(${o.rechnungsnummer})`) as Array<{ id: string }>;
  if (!gefunden[0]) return { ok: false, status: 404, fehler: "Rechnung nicht gefunden" };
  const id = gefunden[0].id;

  const vorher = await rechnungLesen(id);
  if (!vorher) return { ok: false, status: 404, fehler: "Rechnung nicht gefunden" };

  // Schon gebucht? Dann nichts mehr abziehen.
  const da = (await sql`
    select 1 as da from rechnung_ereignis
     where rechnung_id = ${id} and art = 'teilgutschrift' and nachher ->> 'gutschriftNummer' = ${o.gutschriftNummer}
     limit 1
  `) as Array<{ da: number }>;
  if (da[0]) return { ok: true, schonVerbucht: true, rechnung: vorher };

  if (vorher.status === "CANCELLED") return { ok: false, status: 409, fehler: "Die Rechnung ist schon storniert" };
  if (!Number.isInteger(o.betragCent) || o.betragCent <= 0) return { ok: false, status: 400, fehler: "Betrag fehlt" };
  if (o.betragCent > vorher.betragCent) return { ok: false, status: 409, fehler: "Die Gutschrift ist höher als der Rechnungsbetrag" };

  const neu = vorher.betragCent - o.betragCent;
  await sql`update rechnung set betrag_cent = ${neu}, geaendert_am = now() where id = ${id}`;
  await merken({
    rechnungId: id,
    art: "teilgutschrift",
    text: `Teilgutschrift ${o.gutschriftNummer} über ${(o.betragCent / 100).toFixed(2)} Euro: Rechnungsbetrag von ${(vorher.betragCent / 100).toFixed(2)} auf ${(neu / 100).toFixed(2)} Euro. ${o.grund}`.slice(0, 500),
    wer: o.wer,
    vorher: { betragCent: vorher.betragCent },
    nachher: { betragCent: neu, gutschriftNummer: o.gutschriftNummer, gutschriftCent: o.betragCent },
  });

  const nachher = (await rechnungLesen(id))!;
  return { ok: true, schonVerbucht: false, rechnung: nachher };
}
