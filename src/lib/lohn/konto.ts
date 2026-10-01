/**
 * Das Arbeitszeitkonto der Festangestellten.
 *
 * Ben arbeitet regelmäßig 80 Stunden im Monat, Olena 60 (Florian,
 * 30.09.2026). Am Monatsende wird verglichen, was wirklich zusammenkam:
 *
 *  - Wer weniger gearbeitet hat, hat Minusstunden. Die summieren sich
 *    auf und werden abgerufen.
 *  - Wer mehr gearbeitet hat, bekommt nicht sofort Plusstunden: Bis zu
 *    zehn Prozent der Monatsstunden sind mit dem Gehalt abgegolten, bei
 *    80 Stunden also acht, bei 60 Stunden sechs. Erst was darüber
 *    liegt, zählt als Plusstunde. So steht es im Teilzeitvertrag
 *    unter § 5 Absatz 2.
 *
 * Gerechnet wird nach Kalendermonaten, nicht nach dem Lohnzeitraum vom
 * 16. bis zum 15.: Die Regelarbeitszeit ist im Monat vereinbart.
 *
 * Der Saldo wird nie gespeichert, sondern jedes Mal neu aus den Stempeln
 * gerechnet. Ein gespeicherter Saldo wäre in dem Moment falsch, in dem
 * jemand eine Zeit korrigiert, und niemand würde es merken.
 */

import { db } from "@/lib/db/client";
import { nachFamilienname } from "@/lib/domain/namen";
import { zeitenImZeitraum } from "./auswertung";

export interface Sollzeit {
  benutzerId: string;
  name: string;
  email: string;
  monatsStunden: number;
  korridorProzent: number;
  seit: string;
  notiz: string;
}

export interface Kontomonat {
  /** JJJJ-MM */
  monat: string;
  sollMinuten: number;
  istMinuten: number;
  /** Mehrarbeit, die mit dem Gehalt abgegolten ist. */
  abgegoltenMinuten: number;
  /** Was darüber hinausgeht und als Plusstunde zählt. */
  plusMinuten: number;
  minusMinuten: number;
  /** Stand nach diesem Monat, plus ist Guthaben. */
  saldoMinuten: number;
}

export interface Kontostand {
  person: Sollzeit;
  monate: Kontomonat[];
  saldoMinuten: number;
}

function baue(z: Record<string, unknown>): Sollzeit {
  return {
    benutzerId: String(z.benutzer_id),
    name: String(z.name ?? ""),
    email: String(z.email ?? ""),
    monatsStunden: Number(z.monats_stunden),
    korridorProzent: Number(z.korridor_prozent ?? 10),
    seit: String(z.seit),
    notiz: String(z.notiz ?? ""),
  };
}

/** Für wen wird ein Arbeitszeitkonto geführt? */
export async function sollzeiten(): Promise<Sollzeit[]> {
  const z = (await db()`
    select s.benutzer_id, s.monats_stunden, s.korridor_prozent, s.seit::text as seit, s.notiz,
           b.name, b.email
      from arbeitszeit_soll s join benutzer b on b.id = s.benutzer_id
     where b.aktiv
  `.catch(() => [])) as Array<Record<string, unknown>>;
  // Nach Familienname, wie ueberall, wo mehrere Leute stehen.
  return z.map(baue).sort(nachFamilienname);
}

export async function sollzeitVon(benutzerId: string): Promise<Sollzeit | null> {
  const z = (await db()`
    select s.benutzer_id, s.monats_stunden, s.korridor_prozent, s.seit::text as seit, s.notiz,
           b.name, b.email
      from arbeitszeit_soll s join benutzer b on b.id = s.benutzer_id
     where s.benutzer_id = ${benutzerId}::uuid
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

export async function sollzeitSpeichern(o: {
  benutzerId: string;
  monatsStunden: number;
  korridorProzent: number;
  seit: string;
  notiz: string;
  wer: string;
}): Promise<void> {
  await db()`
    insert into arbeitszeit_soll (benutzer_id, monats_stunden, korridor_prozent, seit, notiz, geaendert_von)
    values (${o.benutzerId}::uuid, ${o.monatsStunden}, ${o.korridorProzent}, ${o.seit}::date, ${o.notiz}, ${o.wer})
    on conflict (benutzer_id) do update
      set monats_stunden = excluded.monats_stunden,
          korridor_prozent = excluded.korridor_prozent,
          seit = excluded.seit,
          notiz = excluded.notiz,
          geaendert_von = excluded.geaendert_von,
          geaendert_am = now()
  `;
}

export async function sollzeitEntfernen(benutzerId: string): Promise<void> {
  await db()`delete from arbeitszeit_soll where benutzer_id = ${benutzerId}::uuid`;
}

/** Der erste und der letzte Tag eines Monats. */
function monatsgrenzen(monat: string): { von: string; bis: string } {
  const [j, m] = monat.split("-").map(Number);
  const letzter = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return { von: `${monat}-01`, bis: `${monat}-${String(letzter).padStart(2, "0")}` };
}

/** Alle Monate von "seit" bis zum laufenden Monat. */
function monateSeit(seit: string, bis: string): string[] {
  const monate: string[] = [];
  const d = new Date(`${seit.slice(0, 7)}-01T12:00:00Z`);
  const ende = new Date(`${bis.slice(0, 7)}-01T12:00:00Z`);
  while (d <= ende) {
    monate.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return monate;
}

const heuteBerlin = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/**
 * Der Kontostand einer Person, Monat für Monat.
 *
 * Der laufende Monat zählt mit, ist aber naturgemäß noch nicht fertig:
 * Solange er läuft, steht dort ein Minus, das sich bis zum Monatsende
 * noch auffüllt. Deshalb wird er in der Anzeige gesondert gekennzeichnet
 * und nicht in den abgerufenen Saldo gerechnet.
 */
export async function kontostand(person: Sollzeit): Promise<Kontostand> {
  const heute = heuteBerlin();
  const monate = monateSeit(person.seit, heute);
  const sollMinuten = Math.round(person.monatsStunden * 60);
  const korridorMinuten = Math.round((sollMinuten * person.korridorProzent) / 100);

  const zeilen: Kontomonat[] = [];
  let saldo = 0;

  for (const monat of monate) {
    /*
      Im ersten Monat zaehlt nur, was nach Vertragsbeginn liegt.

      Olena hat am 18. September angefangen; die vollen 70 Stunden fuer
      September zu verlangen waere Unsinn. Gerechnet wird nach Tagen, ganz
      schlicht: "rechne das einfach aus, wieviele das waeren (dreisatz)"
      (Florian, 01.10.2026). 13 von 30 Tagen sind 30:20 statt 70:00.
    */
    const tageImMonat = Number(monatsgrenzen(monat).bis.slice(8));
    const anteilig =
      monat === person.seit.slice(0, 7)
        ? Math.round((sollMinuten * (tageImMonat - Number(person.seit.slice(8)) + 1)) / tageImMonat)
        : sollMinuten;
    const { von, bis } = monatsgrenzen(monat);
    const zeiten = await zeitenImZeitraum({
      schluessel: monat,
      von,
      bis: bis > heute ? heute : bis,
      name: monat,
    });
    const meine = zeiten.find((z) => z.benutzerId === person.benutzerId);
    const ist = meine?.arbeitMinuten ?? 0;

    const abweichung = ist - anteilig;
    const abgegolten = abweichung > 0 ? Math.min(abweichung, korridorMinuten) : 0;
    const plus = abweichung > 0 ? Math.max(0, abweichung - korridorMinuten) : 0;
    const minus = abweichung < 0 ? -abweichung : 0;

    /*
      Der laufende Monat zaehlt nicht in den Saldo.

      Am ersten Oktober steht noch nichts auf der Uhr; ihn mitzurechnen
      haette geheissen, dass Olena mit 70 Stunden Schulden ins Monat
      startet. Er steht in der Tabelle, grau, und wird am Monatsende von
      selbst scharf.
    */
    const laeuft = monat === heute.slice(0, 7);
    if (!laeuft) saldo += plus - minus;

    zeilen.push({
      monat,
      sollMinuten: anteilig,
      istMinuten: ist,
      abgegoltenMinuten: abgegolten,
      plusMinuten: plus,
      minusMinuten: minus,
      saldoMinuten: saldo,
    });
  }

  return { person, monate: zeilen, saldoMinuten: saldo };
}

/** Alle Konten auf einmal, für die Übersicht im Büro. */
export async function alleKontostaende(): Promise<Kontostand[]> {
  const leute = await sollzeiten();
  const stände: Kontostand[] = [];
  for (const p of leute) stände.push(await kontostand(p));
  return stände;
}
