/**
 * Rechnungen, Zahlungen und der Stand dazu.
 * Siehe migrations/066_rechnung_zahlungsabgleich.sql.
 *
 * Eine Rechnung hat einen Betrag und beliebig viele Zahlungen. Der Stand
 * ergibt sich daraus und aus dem Fälligkeitsdatum, er wird nicht von Hand
 * gesetzt: Wer 500 von 1000 Euro bezahlt hat, steht auf "teilweise
 * bezahlt", ohne dass jemand daran denken muss.
 *
 * "Versendet" heißt: Die Mail ist wirklich rausgegangen. Ein erzeugtes
 * PDF allein zählt nicht (Florian, 22.09.2026).
 */

import { db } from "@/lib/db/client";

export type Status =
  | "DRAFT"
  | "CREATED"
  | "SENT"
  | "DUE"
  | "OVERDUE"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

/** Wie der Stand auf Deutsch heißt. */
export const STATUS_TEXT: Record<Status, string> = {
  DRAFT: "Entwurf",
  CREATED: "Erstellt",
  SENT: "Versendet",
  DUE: "Offen",
  OVERDUE: "Überfällig",
  PARTIALLY_PAID: "Teilweise bezahlt",
  PAID: "Bezahlt",
  CANCELLED: "Storniert",
};

export interface Zahlung {
  id: string;
  rechnungId: string;
  bankUmsatzId: string | null;
  betragCent: number;
  datum: string;
  art: string;
  herkunft: "automatisch" | "manuell";
  notiz: string;
  erfasstVon: string | null;
  erfasstAm: string;
}

export interface Rechnung {
  id: string;
  nummer: string;
  quelle: string;
  kunde: string;
  kundeEmail: string;
  kundeIban: string;
  betragCent: number;
  rechnungsdatum: string;
  zahlungszielTage: number;
  faelligAm: string;
  leistung: string;
  status: Status;
  versendetAm: string | null;
  versendetAn: string | null;
  mailStatus: "offen" | "gesendet" | "fehlgeschlagen";
  mailFehler: string | null;
  mailId: string | null;
  bezahltAm: string | null;
  storniertAm: string | null;
  notiz: string;
  erstelltAm: string;
  erstelltVon: string | null;
  /** Zum Vorgang, wenn die Rechnung zu einer Veranstaltung gehört. */
  vorgangId: string | null;
  /** Wann der Kunde die Rechnung zum ersten Mal geöffnet hat. */
  zuerstGeoeffnetAm: string | null;
  /** Wann die Bestätigung nach dem Zahlungseingang rausging. */
  dankMailAm: string | null;
  /** Summe aller Zahlungen. */
  bezahltCent: number;
  /** Was noch aussteht, nie negativ. */
  offenCent: number;
  /** Was zu viel kam, sonst null. */
  ueberzahlungCent: number | null;
  /** Negative Zahl heißt: noch so viele Tage Zeit. */
  tageUeberfaellig: number;
  zahlungen: Zahlung[];
}

export interface BankUmsatz {
  id: string;
  fingerabdruck: string;
  bankReferenz: string | null;
  buchungstag: string;
  wertstellung: string | null;
  betragCent: number;
  gegenname: string;
  gegenIban: string;
  verwendungszweck: string;
  stand: "offen" | "zugeordnet" | "ignoriert";
  ignoriertGrund: string | null;
  importiertAm: string;
  /** Welchen Rechnungen dieser Umsatz zugeordnet ist. */
  zuordnungen: Array<{ rechnungId: string; nummer: string; betragCent: number; herkunft: string }>;
}

function tage(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86400000);
}

export function heute(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/**
 * Der Stand einer Rechnung aus Betrag, Zahlungen und Datum.
 *
 * Absichtlich hier gerechnet und nicht in der Datenbank gespeichert: So
 * kann eine Rechnung nicht "bezahlt" sein, während keine Zahlung dazu
 * existiert. Gespeichert wird nur, was nicht ableitbar ist: Versand,
 * Storno, Entwurf.
 */
export function standRechnen(r: {
  status: Status;
  betragCent: number;
  bezahltCent: number;
  faelligAm: string;
  versendetAm: string | null;
}): Status {
  if (r.status === "CANCELLED" || r.status === "DRAFT") return r.status;
  if (r.bezahltCent >= r.betragCent && r.betragCent > 0) return "PAID";
  if (r.bezahltCent > 0) return "PARTIALLY_PAID";
  if (tage(r.faelligAm, heute()) > 0) return "OVERDUE";
  if (r.versendetAm) return "SENT";
  return "CREATED";
}

function baueZahlung(z: Record<string, unknown>): Zahlung {
  return {
    id: String(z.id),
    rechnungId: String(z.rechnung_id),
    bankUmsatzId: (z.bank_umsatz_id as string) ?? null,
    betragCent: Number(z.betrag_cent),
    datum: String(z.datum),
    art: String(z.art ?? "ueberweisung"),
    herkunft: (z.herkunft as "automatisch" | "manuell") ?? "automatisch",
    notiz: String(z.notiz ?? ""),
    erfasstVon: (z.erfasst_von as string) ?? null,
    erfasstAm: new Date(z.erfasst_am as string).toISOString(),
  };
}

function baue(r: Record<string, unknown>, zahlungen: Zahlung[]): Rechnung {
  const betragCent = Number(r.betrag_cent);
  const meine = zahlungen.filter((z) => z.rechnungId === String(r.id));
  const bezahltCent = meine.reduce((n, z) => n + z.betragCent, 0);
  const faelligAm = String(r.faellig_am);
  const gespeichert = r.status as Status;
  const status = standRechnen({
    status: gespeichert,
    betragCent,
    bezahltCent,
    faelligAm,
    versendetAm: (r.versendet_am as string) ?? null,
  });

  return {
    id: String(r.id),
    nummer: String(r.nummer),
    quelle: String(r.quelle ?? "frei"),
    kunde: String(r.kunde),
    kundeEmail: String(r.kunde_email ?? ""),
    kundeIban: String(r.kunde_iban ?? ""),
    betragCent,
    rechnungsdatum: String(r.rechnungsdatum),
    zahlungszielTage: Number(r.zahlungsziel_tage ?? 14),
    faelligAm,
    leistung: String(r.leistung ?? ""),
    status,
    versendetAm: r.versendet_am ? new Date(r.versendet_am as string).toISOString() : null,
    versendetAn: (r.versendet_an as string) ?? null,
    mailStatus: (r.mail_status as Rechnung["mailStatus"]) ?? "offen",
    mailFehler: (r.mail_fehler as string) ?? null,
    mailId: (r.mail_id as string) ?? null,
    bezahltAm: r.bezahlt_am ? new Date(r.bezahlt_am as string).toISOString() : null,
    storniertAm: r.storniert_am ? new Date(r.storniert_am as string).toISOString() : null,
    notiz: String(r.notiz ?? ""),
    erstelltAm: new Date(r.erstellt_am as string).toISOString(),
    erstelltVon: (r.erstellt_von as string) ?? null,
    vorgangId: r.vorgang_id ? String(r.vorgang_id) : null,
    zuerstGeoeffnetAm: r.zuerst_geoeffnet_am
      ? new Date(r.zuerst_geoeffnet_am as string).toISOString()
      : null,
    dankMailAm: r.dank_mail_am ? new Date(r.dank_mail_am as string).toISOString() : null,
    bezahltCent,
    offenCent: Math.max(0, betragCent - bezahltCent),
    ueberzahlungCent: bezahltCent > betragCent ? bezahltCent - betragCent : null,
    tageUeberfaellig: tage(faelligAm, heute()),
    zahlungen: meine,
  };
}

export async function alleRechnungen(nur?: "offen" | "bezahlt"): Promise<Rechnung[]> {
  const r = (await db()`
    select *, rechnungsdatum::text as rechnungsdatum, faellig_am::text as faellig_am
      from rechnung order by rechnungsdatum desc, nummer desc limit 300
  `) as Array<Record<string, unknown>>;
  const ids = r.map((x) => String(x.id));
  const z =
    ids.length === 0
      ? []
      : ((await db()`
          select *, datum::text as datum from rechnung_zahlung
           where rechnung_id = any(${ids}::uuid[]) order by datum
        `) as Array<Record<string, unknown>>);
  const zahlungen = z.map(baueZahlung);
  const liste = r.map((x) => baue(x, zahlungen));
  if (nur === "offen") return liste.filter((x) => !["PAID", "CANCELLED"].includes(x.status));
  if (nur === "bezahlt") return liste.filter((x) => x.status === "PAID");
  return liste;
}

export async function rechnungLesen(id: string): Promise<Rechnung | null> {
  const r = (await db()`
    select *, rechnungsdatum::text as rechnungsdatum, faellig_am::text as faellig_am
      from rechnung where id = ${id}
  `) as Array<Record<string, unknown>>;
  if (!r[0]) return null;
  const z = (await db()`
    select *, datum::text as datum from rechnung_zahlung where rechnung_id = ${id} order by datum
  `) as Array<Record<string, unknown>>;
  return baue(r[0], z.map(baueZahlung));
}

export async function rechnungPerNummer(nummer: string): Promise<Rechnung | null> {
  const r = (await db()`select id from rechnung where upper(nummer) = upper(${nummer})`) as Array<{ id: string }>;
  return r[0] ? rechnungLesen(r[0].id) : null;
}

/** Der Verlauf einer Rechnung. */
export async function ereignisse(rechnungId: string): Promise<
  Array<{ zeitpunkt: string; art: string; text: string; wer: string }>
> {
  const z = (await db()`
    select zeitpunkt, art, text, wer from rechnung_ereignis
     where rechnung_id = ${rechnungId} order by zeitpunkt
  `) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    zeitpunkt: new Date(r.zeitpunkt as string).toISOString(),
    art: String(r.art),
    text: String(r.text),
    wer: String(r.wer ?? "System"),
  }));
}

export async function merken(o: {
  rechnungId: string | null;
  art: string;
  text: string;
  wer?: string;
  vorher?: unknown;
  nachher?: unknown;
}): Promise<void> {
  await db()`
    insert into rechnung_ereignis (rechnung_id, art, text, wer, vorher, nachher)
    values (${o.rechnungId}, ${o.art}, ${o.text}, ${o.wer ?? "System"},
            ${o.vorher === undefined ? null : JSON.stringify(o.vorher)}::jsonb,
            ${o.nachher === undefined ? null : JSON.stringify(o.nachher)}::jsonb)
  `;
}

/** Legt eine Rechnung an. Die Fälligkeit rechnet das Programm. */
export async function rechnungAnlegen(o: {
  nummer: string;
  quelle?: string;
  vorgangId?: string | null;
  weinRechnungId?: string | null;
  kunde: string;
  kundeEmail?: string;
  betragCent: number;
  rechnungsdatum?: string;
  zahlungszielTage?: number;
  leistung?: string;
  notiz?: string;
  von: string;
}): Promise<Rechnung> {
  const ziel = o.zahlungszielTage ?? (await einstellung()).zahlungszielTage;
  const datum = o.rechnungsdatum ?? heute();
  const z = (await db()`
    insert into rechnung (nummer, quelle, vorgang_id, wein_rechnung_id, kunde, kunde_email,
                          betrag_cent, rechnungsdatum, zahlungsziel_tage, faellig_am, leistung,
                          notiz, erstellt_von)
    values (${o.nummer}, ${o.quelle ?? "frei"}, ${o.vorgangId ?? null}, ${o.weinRechnungId ?? null},
            ${o.kunde}, ${o.kundeEmail ?? ""}, ${o.betragCent}, ${datum}::date, ${ziel},
            (${datum}::date + ${ziel}::int), ${o.leistung ?? ""}, ${o.notiz ?? ""}, ${o.von})
    on conflict (nummer) do update set betrag_cent = excluded.betrag_cent, geaendert_am = now()
    returning id
  `) as Array<{ id: string }>;

  await merken({
    rechnungId: z[0].id,
    art: "erstellt",
    text: `Rechnung ${o.nummer} über ${(o.betragCent / 100).toFixed(2)} Euro erstellt`,
    wer: o.von,
  });
  return (await rechnungLesen(z[0].id))!;
}

/** Hält fest, dass die Rechnung wirklich per Mail rausging. */
export async function versandMerken(o: {
  rechnungId: string;
  an: string;
  mailId?: string | null;
  fehler?: string | null;
  wer: string;
}): Promise<void> {
  if (o.fehler) {
    await db()`
      update rechnung set mail_status = 'fehlgeschlagen', mail_fehler = ${o.fehler}, geaendert_am = now()
       where id = ${o.rechnungId}
    `;
    await merken({
      rechnungId: o.rechnungId,
      art: "versand_fehler",
      text: `E-Mail-Versand an ${o.an} fehlgeschlagen: ${o.fehler}`,
      wer: o.wer,
    });
    return;
  }
  await db()`
    update rechnung
       set versendet_am = now(), versendet_an = ${o.an}, mail_id = ${o.mailId ?? null},
           mail_status = 'gesendet', mail_fehler = null,
           status = case when status = 'CREATED' or status = 'DRAFT' then 'SENT' else status end,
           geaendert_am = now()
     where id = ${o.rechnungId}
  `;
  await merken({
    rechnungId: o.rechnungId,
    art: "versendet",
    text: `Rechnung per E-Mail an ${o.an} versendet`,
    wer: o.wer,
  });
}

/** Trägt eine Zahlung ein und schreibt den Verlauf mit. */
export async function zahlungEintragen(o: {
  rechnungId: string;
  bankUmsatzId?: string | null;
  betragCent: number;
  datum: string;
  art?: string;
  herkunft: "automatisch" | "manuell";
  notiz?: string;
  wer: string;
}): Promise<void> {
  await db()`
    insert into rechnung_zahlung (rechnung_id, bank_umsatz_id, betrag_cent, datum, art, herkunft, notiz, erfasst_von)
    values (${o.rechnungId}, ${o.bankUmsatzId ?? null}, ${o.betragCent}, ${o.datum}::date,
            ${o.art ?? "ueberweisung"}, ${o.herkunft}, ${o.notiz ?? ""}, ${o.wer})
    on conflict (rechnung_id, bank_umsatz_id) do nothing
  `;

  const r = await rechnungLesen(o.rechnungId);
  if (!r) return;

  if (o.bankUmsatzId) {
    await db()`update bank_umsatz set stand = 'zugeordnet' where id = ${o.bankUmsatzId}`;
  }
  await db()`
    update rechnung
       set bezahlt_am = case when ${r.bezahltCent} >= betrag_cent then now() else bezahlt_am end,
           geaendert_am = now()
     where id = ${o.rechnungId}
  `;

  await merken({
    rechnungId: o.rechnungId,
    art: o.herkunft === "automatisch" ? "zahlung_auto" : "zahlung_manuell",
    text:
      `${(o.betragCent / 100).toFixed(2)} Euro ${o.herkunft === "automatisch" ? "über den Bankabgleich" : "von Hand"} ` +
      `zugeordnet${r.offenCent > 0 ? `, offen bleiben ${(r.offenCent / 100).toFixed(2)} Euro` : ""}`,
    wer: o.wer,
  });

  if (r.bezahltCent >= r.betragCent) {
    await merken({
      rechnungId: o.rechnungId,
      art: "bezahlt",
      text:
        r.ueberzahlungCent && r.ueberzahlungCent > 0
          ? `Rechnung bezahlt, Überzahlung ${(r.ueberzahlungCent / 100).toFixed(2)} Euro`
          : "Rechnung vollständig bezahlt",
      wer: o.wer,
    });

    /*
      Und der Kunde erfährt es sofort.

      Hier und nicht bei den Aufrufern: Eine Zahlung kann über den
      Bankabgleich hereinkommen oder von Hand eingetragen werden, und in
      beiden Fällen wartet jemand auf die Bestätigung. Ein Fehler beim
      Mailversand darf die Buchung nicht kippen, deshalb abgefangen
      (Florian, 25.09.2026).

      Der Import steht erst hier, damit db.ts beim Laden nicht den
      halben Mailversand mitzieht.
    */
    try {
      const { bestaetigungSchicken } = await import("./bestaetigung");
      await bestaetigungSchicken(o.rechnungId);
    } catch (fehler) {
      console.error("[rechnung] Bestätigung nicht verschickt:", fehler);
      await merken({
        rechnungId: o.rechnungId,
        art: "bestaetigung_fehler",
        text: `Die Bestätigung an den Kunden ging nicht raus: ${
          fehler instanceof Error ? fehler.message : "unbekannter Fehler"
        }`,
        wer: "System",
      }).catch(() => {});
    }
  }
}

export async function zahlungLoesen(zahlungId: string, wer: string): Promise<void> {
  const z = (await db()`
    delete from rechnung_zahlung where id = ${zahlungId}
    returning rechnung_id, bank_umsatz_id, betrag_cent
  `) as Array<{ rechnung_id: string; bank_umsatz_id: string | null; betrag_cent: number }>;
  if (!z[0]) return;
  if (z[0].bank_umsatz_id) {
    await db()`update bank_umsatz set stand = 'offen' where id = ${z[0].bank_umsatz_id}`;
  }
  await db()`update rechnung set bezahlt_am = null, geaendert_am = now() where id = ${z[0].rechnung_id}`;
  await merken({
    rechnungId: z[0].rechnung_id,
    art: "zuordnung_geloest",
    text: `Zuordnung über ${(z[0].betrag_cent / 100).toFixed(2)} Euro wieder gelöst`,
    wer,
  });
}

export async function stornieren(rechnungId: string, grund: string, wer: string): Promise<void> {
  await db()`
    update rechnung set status = 'CANCELLED', storniert_am = now(), storniert_grund = ${grund}, geaendert_am = now()
     where id = ${rechnungId}
  `;
  await merken({ rechnungId, art: "storniert", text: `Rechnung storniert: ${grund}`, wer });
}

export async function faelligkeitAendern(rechnungId: string, faelligAm: string, wer: string): Promise<void> {
  const vorher = (await db()`select faellig_am::text as f from rechnung where id = ${rechnungId}`) as Array<{ f: string }>;
  await db()`update rechnung set faellig_am = ${faelligAm}::date, geaendert_am = now() where id = ${rechnungId}`;
  await merken({
    rechnungId,
    art: "faelligkeit",
    text: `Fälligkeit von ${vorher[0]?.f ?? "?"} auf ${faelligAm} geändert`,
    wer,
    vorher: vorher[0]?.f,
    nachher: faelligAm,
  });
}

/* ------------------------------------------------------------------ *
 * Bankumsätze
 * ------------------------------------------------------------------ */

function baueUmsatz(u: Record<string, unknown>, zuordnungen: BankUmsatz["zuordnungen"]): BankUmsatz {
  return {
    id: String(u.id),
    fingerabdruck: String(u.fingerabdruck),
    bankReferenz: (u.bank_referenz as string) ?? null,
    buchungstag: String(u.buchungstag),
    wertstellung: (u.wertstellung as string) ?? null,
    betragCent: Number(u.betrag_cent),
    gegenname: String(u.gegenname ?? ""),
    gegenIban: String(u.gegen_iban ?? ""),
    verwendungszweck: String(u.verwendungszweck ?? ""),
    stand: (u.stand as BankUmsatz["stand"]) ?? "offen",
    ignoriertGrund: (u.ignoriert_grund as string) ?? null,
    importiertAm: new Date(u.importiert_am as string).toISOString(),
    zuordnungen,
  };
}

export async function umsaetze(anzahl = 200): Promise<BankUmsatz[]> {
  const u = (await db()`
    select *, buchungstag::text as buchungstag, wertstellung::text as wertstellung
      from bank_umsatz order by buchungstag desc, importiert_am desc limit ${anzahl}
  `) as Array<Record<string, unknown>>;
  const ids = u.map((x) => String(x.id));
  const z =
    ids.length === 0
      ? []
      : ((await db()`
          select z.bank_umsatz_id, z.betrag_cent, z.herkunft, r.id as rechnung_id, r.nummer
            from rechnung_zahlung z join rechnung r on r.id = z.rechnung_id
           where z.bank_umsatz_id = any(${ids}::uuid[])
        `) as Array<Record<string, unknown>>);
  return u.map((x) =>
    baueUmsatz(
      x,
      z
        .filter((y) => String(y.bank_umsatz_id) === String(x.id))
        .map((y) => ({
          rechnungId: String(y.rechnung_id),
          nummer: String(y.nummer),
          betragCent: Number(y.betrag_cent),
          herkunft: String(y.herkunft),
        })),
    ),
  );
}

export async function umsatzLesen(id: string): Promise<BankUmsatz | null> {
  const alle = await umsaetze(400);
  return alle.find((u) => u.id === id) ?? null;
}

export async function umsatzIgnorieren(id: string, grund: string, wer: string): Promise<void> {
  await db()`update bank_umsatz set stand = 'ignoriert', ignoriert_grund = ${grund} where id = ${id}`;
  await merken({ rechnungId: null, art: "umsatz_ignoriert", text: `Zahlungseingang beiseitegelegt: ${grund}`, wer });
}

export interface Einstellung {
  kontoEndetAuf: string;
  bank: string;
  bic: string;
  zuletztAm: string | null;
  zuletztUmsaetze: number;
  bisDatum: string | null;
  freigabeNoetig: boolean;
  letzterFehler: string | null;
  zahlungszielTage: number;
}

export async function einstellung(): Promise<Einstellung> {
  const z = (await db()`
    select konto_endet_auf, bank, bic, zuletzt_am, zuletzt_umsaetze, bis_datum::text as bis_datum,
           freigabe_noetig, letzter_fehler, zahlungsziel_tage
      from bank_stand where id = 1
  `) as Array<Record<string, unknown>>;
  const r = z[0] ?? {};
  return {
    kontoEndetAuf: String(r.konto_endet_auf ?? "2019"),
    bank: String(r.bank ?? ""),
    bic: String(r.bic ?? ""),
    zuletztAm: r.zuletzt_am ? new Date(r.zuletzt_am as string).toISOString() : null,
    zuletztUmsaetze: Number(r.zuletzt_umsaetze ?? 0),
    bisDatum: (r.bis_datum as string) ?? null,
    freigabeNoetig: Boolean(r.freigabe_noetig),
    letzterFehler: (r.letzter_fehler as string) ?? null,
    zahlungszielTage: Number(r.zahlungsziel_tage ?? 14),
  };
}

export async function einstellungSpeichern(o: { zahlungszielTage?: number; kontoEndetAuf?: string }): Promise<void> {
  await db()`
    update bank_stand
       set zahlungsziel_tage = coalesce(${o.zahlungszielTage ?? null}, zahlungsziel_tage),
           konto_endet_auf = coalesce(${o.kontoEndetAuf ?? null}, konto_endet_auf)
     where id = 1
  `;
}

export async function syncMerken(o: {
  umsaetze: number;
  bisDatum?: string | null;
  fehler?: string | null;
  freigabeNoetig?: boolean;
}): Promise<void> {
  await db()`
    update bank_stand
       set zuletzt_am = now(), zuletzt_umsaetze = ${o.umsaetze},
           bis_datum = coalesce(${o.bisDatum ?? null}::date, bis_datum),
           letzter_fehler = ${o.fehler ?? null},
           freigabe_noetig = coalesce(${o.freigabeNoetig ?? null}, freigabe_noetig)
     where id = 1
  `;
}

/**
 * Meldet den ersten erfolgreichen Bankabruf, genau einmal.
 *
 * Gibt true zurueck, wenn das der erste war und die Nachricht noch nicht
 * hinausgegangen ist. Das Setzen und das Pruefen passieren in einem
 * einzigen Befehl, damit zwei gleichzeitige Laeufe nicht zwei Mails
 * ausloesen (Florian, 23.09.2026).
 */
export async function erfolgErstmalsMerken(): Promise<boolean> {
  const z = (await db()`
    update bank_stand
       set erster_erfolg_am = coalesce(erster_erfolg_am, now()),
           erfolg_gemeldet = true
     where id = 1 and not erfolg_gemeldet
    returning id
  `) as Array<unknown>;
  return z.length > 0;
}
