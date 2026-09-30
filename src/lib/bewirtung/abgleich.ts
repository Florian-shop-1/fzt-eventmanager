/**
 * Welche Ausgabe hat schon einen Beleg, und welche fehlt noch?
 *
 * Das Programm kennt beide Seiten: die Abbuchungen vom Konto und die
 * gescannten Belege. Betrag und Datum passen zusammen oder eben nicht.
 * Was zusammenpasst, schlaegt es vor; abgehakt wird mit einem Klick
 * (Florian, 29.09.2026).
 *
 * Ein Beleg gehoert immer nur zu einer Abbuchung. Zweimal denselben Beleg
 * zu verwenden waere genau das, was bei einer Pruefung auffaellt.
 *
 * Nicht jede Abbuchung braucht einen Beleg. Loehne, Miete, Steuern und
 * Versicherungen belegen sich durch den Vertrag. Dafuer gibt es Regeln
 * auf den Namen des Empfaengers, damit man das nicht jeden Monat neu
 * abhakt.
 */

import { db } from "@/lib/db/client";

export type Belegstand = "offen" | "beleg" | "kein_beleg";

export interface Ausgabe {
  id: string;
  buchungstag: string;
  /** Immer positiv: der ausgegebene Betrag. */
  betragCent: number;
  gegenname: string;
  verwendungszweck: string;
  konto: string;
  stand: Belegstand;
  notiz: string;
  wer: string;
  /** Der zugeordnete Beleg, falls einer da ist. */
  belegId: string | null;
  belegNummer: string | null;
  belegGeschaeft: string | null;
  /** Passt eine Regel? Dann steht hier ihr Grund. */
  regel: string | null;
}

export interface Belegvorschlag {
  belegId: string;
  nummer: string | null;
  datum: string | null;
  geschaeft: string;
  betragCent: number;
  /** Wie sicher der Vorschlag ist, 0 bis 100. */
  guete: number;
  warum: string;
}

const TAGE_FENSTER = 10;

/** Namen vergleichbar machen: klein, ohne Rechtsform und Sonderzeichen. */
function kern(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|ug|se|s\.?a\.?r\.?l|b\.?v|ltd|inc|co|und|and|europe|deutschland|germany)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}

/** Teilen sich zwei Namen ein aussagekraeftiges Wort? */
function namenPassen(a: string, b: string): boolean {
  const woerterA = new Set(kern(a).split(" ").filter((w) => w.length >= 4));
  return kern(b)
    .split(" ")
    .some((w) => w.length >= 4 && woerterA.has(w));
}

/**
 * Die Ausgaben eines Monats mit ihrem Belegstand.
 *
 * Nur Abbuchungen: Was hereinkommt, braucht keinen Beleg, das sind
 * unsere eigenen Rechnungen.
 */
export async function ausgabenDesMonats(monat: string): Promise<Ausgabe[]> {
  const zeilen = (await db()`
    select u.id, u.buchungstag::text as buchungstag, u.betrag_cent, u.gegenname,
           u.verwendungszweck, u.konto, u.beleg_stand, u.beleg_notiz, u.beleg_wer,
           u.beleg_id, b.nummer as beleg_nummer, b.restaurant as beleg_geschaeft
      from bank_umsatz u
      left join bewirtung b on b.id = u.beleg_id
     where u.betrag_cent < 0
       and to_char(u.buchungstag, 'YYYY-MM') = ${monat}
     order by u.buchungstag desc, u.betrag_cent
  `) as Array<Record<string, unknown>>;

  const regeln = (await db()`select muster, grund from beleg_regel`) as Array<{
    muster: string;
    grund: string;
  }>;

  return zeilen.map((r) => {
    const gegenname = String(r.gegenname ?? "");
    const zweck = String(r.verwendungszweck ?? "");
    const treffer = regeln.find(
      (x) =>
        x.muster &&
        (gegenname.toLowerCase().includes(x.muster.toLowerCase()) ||
          zweck.toLowerCase().includes(x.muster.toLowerCase())),
    );
    return {
      id: String(r.id),
      buchungstag: String(r.buchungstag),
      betragCent: Math.abs(Number(r.betrag_cent)),
      gegenname,
      verwendungszweck: zweck,
      konto: String(r.konto ?? ""),
      stand: (r.beleg_stand as Belegstand) ?? "offen",
      notiz: String(r.beleg_notiz ?? ""),
      wer: String(r.beleg_wer ?? ""),
      belegId: r.beleg_id ? String(r.beleg_id) : null,
      belegNummer: (r.beleg_nummer as string) ?? null,
      belegGeschaeft: (r.beleg_geschaeft as string) ?? null,
      regel: treffer ? treffer.grund || `Regel: ${treffer.muster}` : null,
    };
  });
}

/**
 * Welche gescannten Belege koennten zu dieser Ausgabe gehoeren?
 *
 * Gesucht wird nach Betrag und Datum. Der Betrag muss stimmen, sonst ist
 * es ein anderer Vorgang; beim Datum gibt es Spielraum, denn die Bank
 * bucht spaeter, als im Restaurant bezahlt wurde. Ein passender Name
 * macht den Vorschlag sicherer, ist aber keine Bedingung: Auf dem
 * Kontoauszug steht oft der Zahlungsdienstleister und nicht das Lokal.
 */
export async function vorschlaegeZu(umsatzId: string): Promise<Belegvorschlag[]> {
  const u = (await db()`
    select id, buchungstag::text as buchungstag, betrag_cent, gegenname, verwendungszweck
      from bank_umsatz where id = ${umsatzId}
  `) as Array<Record<string, unknown>>;
  if (!u[0]) return [];

  const betrag = Math.abs(Number(u[0].betrag_cent));
  const tag = String(u[0].buchungstag);
  const name = `${u[0].gegenname ?? ""} ${u[0].verwendungszweck ?? ""}`;

  const belege = (await db()`
    select b.id, b.nummer, b.datum::text as datum, b.restaurant, b.brutto_cent, b.trinkgeld_cent
      from bewirtung b
     where b.status = 'fertig'
       and b.id not in (select beleg_id from bank_umsatz where beleg_id is not null)
       -- Die Zahl ausdruecklich als int: sonst haelt Postgres den Wert
       -- fuer ein Datum und rechnet date - date, was eine Zahl ergibt.
       and b.datum between (${tag}::date - ${TAGE_FENSTER}::int) and (${tag}::date + 3)
     order by b.datum desc
  `) as Array<Record<string, unknown>>;

  const vorschlaege: Belegvorschlag[] = [];
  for (const b of belege) {
    const gesamt = Number(b.brutto_cent ?? 0) + Number(b.trinkgeld_cent ?? 0);
    const nurBrutto = Number(b.brutto_cent ?? 0);
    const passt = gesamt === betrag || nurBrutto === betrag;
    if (!passt) continue;

    const geschaeft = String(b.restaurant ?? "");
    const tageAuseinander = Math.abs(
      (Date.parse(`${b.datum}T12:00:00Z`) - Date.parse(`${tag}T12:00:00Z`)) / 86400000,
    );

    // Der Betrag stimmt, das ist die Grundlage. Name und Naehe im Datum
    // machen den Vorschlag sicherer.
    let guete = 70;
    if (namenPassen(name, geschaeft)) guete += 20;
    if (tageAuseinander <= 2) guete += 10;

    vorschlaege.push({
      belegId: String(b.id),
      nummer: (b.nummer as string) ?? null,
      datum: (b.datum as string) ?? null,
      geschaeft,
      betragCent: gesamt,
      guete: Math.min(100, guete),
      warum:
        `Betrag stimmt` +
        (namenPassen(name, geschaeft) ? ", Name passt" : "") +
        (tageAuseinander <= 2 ? ", gleicher Tag" : `, ${Math.round(tageAuseinander)} Tage davor`),
    });
  }

  return vorschlaege.sort((a, b) => b.guete - a.guete).slice(0, 5);
}

/**
 * Alle offenen Ausgaben eines Monats mit ihren Vorschlaegen.
 *
 * In einer Abfrage statt einer je Zeile: Ein Monat hat schnell hundert
 * Abbuchungen, und hundert Einzelabfragen dauern spuerbar.
 */
export async function vorschlaegeFuerMonat(
  monat: string,
): Promise<Map<string, Belegvorschlag[]>> {
  const offene = (await ausgabenDesMonats(monat)).filter((a) => a.stand === "offen" && !a.regel);
  const karte = new Map<string, Belegvorschlag[]>();
  for (const a of offene) {
    const v = await vorschlaegeZu(a.id);
    if (v.length > 0) karte.set(a.id, v);
  }
  return karte;
}

/**
 * Was eindeutig zusammengehoert, gleich abhaken.
 *
 * "wenn es passt, kannst du selber den haken gleich setzen" (Florian,
 * 30.09.2026). Gemeint sind die Rechnungen, die per Mail hereinkommen:
 * Huss Licht + Ton schickt die Rechnung, bucht per Lastschrift ab, und
 * beides passt auf den Cent. Dafuer muss niemand klicken.
 *
 * Automatisch wird nur zugeordnet, was keine zweite Moeglichkeit hat:
 * genau ein Vorschlag, Betrag auf den Cent gleich, und entweder passt
 * der Name oder das Datum liegt dicht beieinander. Alles andere bleibt
 * liegen und wartet auf einen Menschen. Ein falsch gesetzter Haken ist
 * schlimmer als ein fehlender: Er sieht aus wie Arbeit, die getan ist.
 *
 * Rueckgaengig geht es immer: In der Liste steht "doch nicht" daneben,
 * und wer automatisch zugeordnet hat, steht dabei.
 */
export async function automatischZuordnen(monat?: string): Promise<{ zugeordnet: number; namen: string[] }> {
  const liste = monat
    ? (await ausgabenDesMonats(monat)).filter((a) => a.stand === "offen" && !a.regel)
    : await offeneAusgaben();

  const namen: string[] = [];
  for (const a of liste) {
    const v = await vorschlaegeZu(a.id);
    if (v.length !== 1) continue;
    if (v[0].guete < 90) continue;
    if (v[0].betragCent !== a.betragCent) continue;
    await belegZuordnen(a.id, v[0].belegId, "automatisch");
    namen.push(`${a.gegenname || "Abbuchung"} ${(a.betragCent / 100).toFixed(2).replace(".", ",")} €`);
  }
  return { zugeordnet: namen.length, namen };
}

/** Alle offenen Ausgaben, unabhaengig vom Monat. Fuer den automatischen Lauf. */
async function offeneAusgaben(): Promise<Ausgabe[]> {
  const monate = (await db()`
    select distinct to_char(buchungstag, 'YYYY-MM') as m
      from bank_umsatz
     where betrag_cent < 0 and beleg_stand = 'offen'
     order by m desc
     limit 6
  `.catch(() => [])) as Array<{ m: string }>;
  const alle: Ausgabe[] = [];
  for (const { m } of monate) {
    alle.push(...(await ausgabenDesMonats(m)).filter((a) => a.stand === "offen" && !a.regel));
  }
  return alle;
}

export async function belegZuordnen(umsatzId: string, belegId: string, wer: string): Promise<void> {
  await db()`
    update bank_umsatz
       set beleg_id = ${belegId}::uuid, beleg_stand = 'beleg', beleg_wer = ${wer}, beleg_am = now()
     where id = ${umsatzId}::uuid
  `;
}

export async function belegLoesen(umsatzId: string): Promise<void> {
  await db()`
    update bank_umsatz
       set beleg_id = null, beleg_stand = 'offen', beleg_notiz = '', beleg_wer = '', beleg_am = null
     where id = ${umsatzId}::uuid
  `;
}

/** Diese Ausgabe braucht keinen Beleg, etwa Lohn oder Miete. */
export async function keinBelegNoetig(umsatzId: string, grund: string, wer: string): Promise<void> {
  await db()`
    update bank_umsatz
       set beleg_stand = 'kein_beleg', beleg_notiz = ${grund.trim().slice(0, 200)},
           beleg_wer = ${wer}, beleg_am = now(), beleg_id = null
     where id = ${umsatzId}::uuid
  `;
}

/** Eine Regel fuer wiederkehrende Abbuchungen ohne Beleg. */
export async function regelAnlegen(muster: string, grund: string, wer: string): Promise<void> {
  const sauber = muster.trim().slice(0, 120);
  if (sauber.length < 3) throw new Error("Das Muster ist zu kurz, mindestens drei Zeichen.");
  await db()`
    insert into beleg_regel (muster, grund, erstellt_von)
    values (${sauber}, ${grund.trim().slice(0, 200)}, ${wer})
    on conflict (lower(muster)) do update set grund = excluded.grund
  `;
}

export async function regelLoeschen(id: string): Promise<void> {
  await db()`delete from beleg_regel where id = ${id}::uuid`;
}

export async function regeln(): Promise<Array<{ id: string; muster: string; grund: string }>> {
  const z = (await db()`select id, muster, grund from beleg_regel order by muster`) as Array<
    Record<string, unknown>
  >;
  return z.map((r) => ({ id: String(r.id), muster: String(r.muster), grund: String(r.grund ?? "") }));
}

export interface Monatsstand {
  ausgaben: number;
  mitBeleg: number;
  ohneBeleg: number;
  keinBelegNoetig: number;
  summeOhneBelegCent: number;
}

export function monatsstand(liste: Ausgabe[]): Monatsstand {
  const offen = liste.filter((a) => a.stand === "offen" && !a.regel);
  return {
    ausgaben: liste.length,
    mitBeleg: liste.filter((a) => a.stand === "beleg").length,
    ohneBeleg: offen.length,
    keinBelegNoetig: liste.filter((a) => a.stand === "kein_beleg" || a.regel).length,
    summeOhneBelegCent: offen.reduce((n, a) => n + a.betragCent, 0),
  };
}
