/**
 * Der Weg der Stunden ins Steuerbüro.
 *
 * Zwei Schritte, bewusst getrennt (Florian, 29.09.2026):
 *
 *   1. Werner sieht die Auswertung durch und bestätigt sie.
 *   2. Erst danach lässt sich die Mail an Frau Buschow abschicken.
 *
 * Solange wir testen, passiert Schritt 2 nur auf Knopfdruck. Nichts geht
 * von allein hinaus, und was hinausgegangen ist, bleibt festgehalten.
 */

import { db } from "@/lib/db/client";
import type { Zeitraum } from "./zeitraum";
import type { Mitarbeiterzeiten } from "./auswertung";
import { alsDezimal } from "./auswertung";

export interface Meldung {
  zeitraum: string;
  bestaetigtAm: string | null;
  bestaetigtVon: string | null;
  versendetAm: string | null;
  versendetAn: string | null;
}

export interface Lohneinstellung {
  steuerbuero: string;
  steuerbueroName: string;
  kopieAn: string;
}

export async function einstellungLesen(): Promise<Lohneinstellung> {
  const z = (await db()`
    select steuerbuero, steuerbuero_name, kopie_an from lohn_einstellung where id = 1
  `) as Array<Record<string, unknown>>;
  return {
    steuerbuero: String(z[0]?.steuerbuero ?? ""),
    steuerbueroName: String(z[0]?.steuerbuero_name ?? "Steuerbüro"),
    kopieAn: String(z[0]?.kopie_an ?? ""),
  };
}

export async function einstellungSpeichern(e: Lohneinstellung): Promise<void> {
  await db()`
    insert into lohn_einstellung (id, steuerbuero, steuerbuero_name, kopie_an)
    values (1, ${e.steuerbuero.trim()}, ${e.steuerbueroName.trim() || "Steuerbüro"}, ${e.kopieAn.trim()})
    on conflict (id) do update set
      steuerbuero = excluded.steuerbuero,
      steuerbuero_name = excluded.steuerbuero_name,
      kopie_an = excluded.kopie_an
  `;
}

export async function meldungLesen(schluessel: string): Promise<Meldung> {
  const z = (await db()`
    select zeitraum, bestaetigt_am, bestaetigt_von, versendet_am, versendet_an
      from lohn_meldung where zeitraum = ${schluessel}
  `) as Array<Record<string, unknown>>;
  const m = z[0];
  return {
    zeitraum: schluessel,
    bestaetigtAm: m?.bestaetigt_am ? String(m.bestaetigt_am) : null,
    bestaetigtVon: m?.bestaetigt_von ? String(m.bestaetigt_von) : null,
    versendetAm: m?.versendet_am ? String(m.versendet_am) : null,
    versendetAn: m?.versendet_an ? String(m.versendet_an) : null,
  };
}

/** Werner gibt den Zeitraum frei. Danach ist der Versandknopf offen. */
export async function bestaetigen(schluessel: string, wer: string): Promise<void> {
  await db()`
    insert into lohn_meldung (zeitraum, bestaetigt_am, bestaetigt_von)
    values (${schluessel}, now(), ${wer})
    on conflict (zeitraum) do update set bestaetigt_am = now(), bestaetigt_von = ${wer}
  `;
}

/**
 * Die Freigabe zurücknehmen.
 *
 * Wer beim Durchsehen noch einen Fehler findet, soll ihn korrigieren
 * können, ohne dass jemand die Meldung aus der Datenbank löschen muss.
 * Nach dem Versand geht das nicht mehr: Was beim Steuerbüro liegt, lässt
 * sich hier nicht zurückholen.
 */
export async function freigabeZuruecknehmen(schluessel: string): Promise<void> {
  await db()`
    update lohn_meldung set bestaetigt_am = null, bestaetigt_von = null
     where zeitraum = ${schluessel} and versendet_am is null
  `;
}

/** Nach dem Versand: festhalten, was hinausgegangen ist. */
export async function versandMerken(
  z: Zeitraum,
  an: string,
  leute: Mitarbeiterzeiten[],
): Promise<void> {
  const stand = leute.map((p) => ({
    name: p.name,
    stunden: alsDezimal(p.arbeitMinuten),
    pause: alsDezimal(p.pauseMinuten),
    arbeitstage: p.arbeitstage,
    urlaubstage: p.urlaubstage,
    kranktage: p.kranktage,
  }));
  await db()`
    insert into lohn_meldung (zeitraum, versendet_am, versendet_an, stand)
    values (${z.schluessel}, now(), ${an}, ${JSON.stringify(stand)}::jsonb)
    on conflict (zeitraum) do update set
      versendet_am = now(), versendet_an = ${an}, stand = ${JSON.stringify(stand)}::jsonb
  `;
}
