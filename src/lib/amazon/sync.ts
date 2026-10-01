/**
 * Amazon-Rechnungen in den Belegstapel holen.
 *
 * Der Weg ist dreistufig, und jede Stufe kann fuer sich abbrechen, ohne
 * die anderen mitzureissen:
 *
 *  1. Amazon nach den Umsaetzen des Zeitraums fragen.
 *  2. Zu den Bestellungen die Rechnungen erfragen (eine Bestellung kann
 *     mehrere haben) und sie im Merkheft amazon_rechnung festhalten.
 *  3. Fuer jede gemerkte Rechnung ohne Beleg das PDF holen und daraus
 *     einen ganz normalen Beleg machen, mit herkunft 'amazon_business'.
 *
 * Es entsteht keine zweite Belegverwaltung: Der Beleg liegt in derselben
 * Tabelle wie der abfotografierte Kassenbon und laeuft denselben Weg
 * durch Zweck, Freigabe und Festschreibung. Das Merkheft daneben weiss
 * nur, was Amazon schon genannt hat und wozu noch ein PDF fehlt
 * (Florian, 01.10.2026).
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { rechnungsdetails, rechnungsPdf, transaktionen, type AmazonRechnungsdetail } from "./api";

/** Wie weit zurueck beim allerersten Lauf gefragt wird. */
const ERSTER_ZEITRAUM_TAGE = 60;

/** Wie oft ein fehlendes PDF neu versucht wird, bevor Ruhe ist. */
const HOECHSTENS_VERSUCHE = 12;

export interface AmazonAbgleich {
  bisDatum: string | null;
  zuletztAm: string | null;
  zuletztNeu: number;
  zuletztFehler: string;
}

export interface AmazonLauf {
  gesehen: number;
  gemerkt: number;
  importiert: number;
  wartenAufPdf: number;
  fehler: string[];
}

export async function abgleichStand(): Promise<AmazonAbgleich> {
  const z = (await db()`
    select bis_datum, zuletzt_am, zuletzt_neu, zuletzt_fehler from amazon_abgleich where id = 1
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return {
    bisDatum: z[0]?.bis_datum ? new Date(z[0].bis_datum as string).toISOString() : null,
    zuletztAm: z[0]?.zuletzt_am ? new Date(z[0].zuletzt_am as string).toISOString() : null,
    zuletztNeu: Number(z[0]?.zuletzt_neu ?? 0),
    zuletztFehler: String(z[0]?.zuletzt_fehler ?? ""),
  };
}

export interface GemerkteRechnung {
  id: string;
  rechnungsnummer: string;
  orderId: string;
  dokumenttyp: string;
  rechnungsdatum: string | null;
  verkaeufer: string;
  bruttoCent: number | null;
  stand: string;
  versuche: number;
  letzterFehler: string;
  belegId: string | null;
  gesehenAm: string;
}

export async function gemerkteRechnungen(hoechstens = 50): Promise<GemerkteRechnung[]> {
  const z = (await db()`
    select id, rechnungsnummer, order_id, dokumenttyp, rechnungsdatum::text as rechnungsdatum,
           verkaeufer, brutto_cent, stand, versuche, letzter_fehler, beleg_id, gesehen_am
      from amazon_rechnung
     order by coalesce(rechnungsdatum, gesehen_am::date) desc, gesehen_am desc
     limit ${hoechstens}
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    id: String(r.id),
    rechnungsnummer: String(r.rechnungsnummer),
    orderId: String(r.order_id ?? ""),
    dokumenttyp: String(r.dokumenttyp ?? "rechnung"),
    rechnungsdatum: (r.rechnungsdatum as string) ?? null,
    verkaeufer: String(r.verkaeufer ?? ""),
    bruttoCent: r.brutto_cent === null ? null : Number(r.brutto_cent),
    stand: String(r.stand ?? "offen"),
    versuche: Number(r.versuche ?? 0),
    letzterFehler: String(r.letzter_fehler ?? ""),
    belegId: (r.beleg_id as string) ?? null,
    gesehenAm: new Date(r.gesehen_am as string).toISOString(),
  }));
}

function cent(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Aus STANDARD und CREDIT_MEMO wird etwas, das man lesen kann. */
function typ(invoiceType: string | undefined): "rechnung" | "gutschrift" {
  return (invoiceType ?? "").toUpperCase().includes("CREDIT") ? "gutschrift" : "rechnung";
}

/**
 * Schritt 1 und 2: Was gibt es Neues?
 *
 * Gefragt wird ab dem Stand des letzten Laufs, mit zwei Tagen
 * Ueberlappung: Amazon stellt Umsaetze mit Verzug ein, und eine Rechnung
 * doppelt zu sehen ist harmlos, eine zu verpassen nicht.
 */
export async function rechnungenSuchen(): Promise<{ gesehen: number; gemerkt: number }> {
  const stand = await abgleichStand();
  const bis = new Date();
  const von = stand.bisDatum
    ? new Date(Date.parse(stand.bisDatum) - 2 * 86400000)
    : new Date(bis.getTime() - ERSTER_ZEITRAUM_TAGE * 86400000);

  const umsaetze = await transaktionen(von, bis);

  // Je Bestellposition einmal fragen, Doppelte vorher heraus.
  const gesehen = new Set<string>();
  const positionen = umsaetze
    .filter((u) => u.orderId)
    .filter((u) => {
      const schluessel = `${u.orderId}|${u.orderLineItemId ?? ""}|${u.shipmentId ?? ""}`;
      if (gesehen.has(schluessel)) return false;
      gesehen.add(schluessel);
      return true;
    })
    .map((u) => ({
      orderId: u.orderId,
      orderLineItemId: u.orderLineItemId,
      shipmentId: u.shipmentId,
    }));

  let details: AmazonRechnungsdetail[] = [];
  if (positionen.length > 0) details = await rechnungsdetails(positionen);

  let gemerkt = 0;
  for (const d of details) {
    const nummer = (d.invoiceNumber ?? "").trim();
    if (!nummer) continue;

    const steuer = (d.tax ?? []).reduce((s, t) => s + (cent(t.amount?.amount) ?? 0), 0);
    const brutto = cent(d.invoiceTotal?.amount);

    const z = (await db()`
      insert into amazon_rechnung (rechnungsnummer, order_id, order_line_item_id, shipment_id,
                                   dokumenttyp, rechnungsdatum, verkaeufer, netto_cent, steuer_cent,
                                   brutto_cent, waehrung)
      values (${nummer}, ${d.orderId ?? ""}, ${d.orderLineItemId ?? ""}, ${d.shipmentId ?? ""},
              ${typ(d.invoiceType)}, ${(d.invoiceDate ?? "").slice(0, 10) || null}::date,
              ${d.sellerName ?? "Amazon"}, ${brutto !== null ? brutto - steuer : null}, ${steuer || null},
              ${brutto}, ${d.invoiceTotal?.currencyCode ?? "EUR"})
      on conflict (rechnungsnummer) do nothing
      returning id
    `) as Array<{ id: string }>;
    if (z[0]) gemerkt++;
  }

  await db()`
    update amazon_abgleich
       set bis_datum = ${bis.toISOString()}::timestamptz, zuletzt_am = now(),
           zuletzt_neu = ${gemerkt}, zuletzt_fehler = ''
     where id = 1
  `;

  return { gesehen: umsaetze.length, gemerkt };
}

/**
 * Schritt 3: Aus einer gemerkten Rechnung einen Beleg machen.
 *
 * Fehlt das PDF noch, bleibt die Rechnung auf "offen" stehen und wird
 * beim naechsten Lauf erneut versucht. Amazon stellt die Rechnung
 * manchmal erst Tage nach der Lieferung bereit.
 */
export async function pdfsHolen(hoechstens = 10): Promise<{ importiert: number; offen: number; fehler: string[] }> {
  const offen = (await db()`
    select id, rechnungsnummer, order_id, order_line_item_id, shipment_id, dokumenttyp,
           rechnungsdatum::text as rechnungsdatum, verkaeufer, netto_cent, steuer_cent, brutto_cent, versuche
      from amazon_rechnung
     where stand = 'offen' and versuche < ${HOECHSTENS_VERSUCHE}
     order by gesehen_am
     limit ${hoechstens}
  `.catch(() => [])) as Array<Record<string, unknown>>;

  let importiert = 0;
  const fehler: string[] = [];

  for (const r of offen) {
    const id = String(r.id);
    const nummer = String(r.rechnungsnummer);
    try {
      const pdf = await rechnungsPdf({
        orderId: String(r.order_id ?? ""),
        orderLineItemId: String(r.order_line_item_id ?? "") || undefined,
        shipmentId: String(r.shipment_id ?? "") || undefined,
        dokumenttyp: String(r.dokumenttyp) === "gutschrift" ? "CreditMemo" : "Invoice",
      });

      if (!pdf) {
        await db()`
          update amazon_rechnung
             set versuche = versuche + 1, letzter_fehler = 'PDF liegt bei Amazon noch nicht bereit',
                 geaendert_am = now()
           where id = ${id}::uuid
        `;
        continue;
      }

      const hash = createHash("sha256").update(pdf).digest("hex");
      const belegId = await belegAnlegen({
        pdf,
        hash,
        nummer,
        orderId: String(r.order_id ?? ""),
        dokumenttyp: String(r.dokumenttyp ?? "rechnung"),
        datum: (r.rechnungsdatum as string) ?? null,
        verkaeufer: String(r.verkaeufer ?? "Amazon"),
        nettoCent: r.netto_cent === null ? null : Number(r.netto_cent),
        steuerCent: r.steuer_cent === null ? null : Number(r.steuer_cent),
        bruttoCent: r.brutto_cent === null ? null : Number(r.brutto_cent),
      });

      await db()`
        update amazon_rechnung
           set stand = 'importiert', beleg_id = ${belegId}::uuid, letzter_fehler = '', geaendert_am = now()
         where id = ${id}::uuid
      `;
      importiert++;
    } catch (f) {
      const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
      fehler.push(`${nummer}: ${meldung}`);
      await db()`
        update amazon_rechnung
           set versuche = versuche + 1, letzter_fehler = ${meldung.slice(0, 400)}, geaendert_am = now()
         where id = ${id}::uuid
      `;
    }
  }

  const rest = (await db()`
    select count(*)::int as n from amazon_rechnung where stand = 'offen'
  `.catch(() => [{ n: 0 }])) as Array<{ n: number }>;

  return { importiert, offen: Number(rest[0]?.n ?? 0), fehler };
}

/**
 * Der Beleg selbst, in der ganz normalen Belegtabelle.
 *
 * Als Entwurf, wie jeder gescannte Beleg auch: Zweck und Kategorie setzt
 * weiterhin ein Mensch. Das Programm nimmt das Abtippen ab, nicht die
 * Entscheidung.
 */
async function belegAnlegen(o: {
  pdf: Buffer;
  hash: string;
  nummer: string;
  orderId: string;
  dokumenttyp: string;
  datum: string | null;
  verkaeufer: string;
  nettoCent: number | null;
  steuerCent: number | null;
  bruttoCent: number | null;
}): Promise<string> {
  const da = (await db()`
    select id from bewirtung
     where (foto_hash = ${o.hash} or amazon_rechnungsnummer = ${o.nummer}) and status <> 'storniert'
     limit 1
  `) as Array<{ id: string }>;
  if (da[0]) return String(da[0].id);

  /*
    Die Steuer steht in einer Summe da, nicht nach Saetzen getrennt.

    Amazon nennt die Saetze je Position; was hier zaehlt, ist der Betrag.
    Neunzehn Prozent sind der Normalfall, und wenn die Summe nicht dazu
    passt, traegt der Mensch sie beim Pruefen richtig ein. Lieber ein
    Vorschlag, den man sieht, als eine stille Erfindung.
  */
  const neunzehn =
    o.steuerCent !== null && o.nettoCent !== null && Math.abs(o.nettoCent * 0.19 - o.steuerCent) <= 2
      ? o.steuerCent
      : 0;
  const sieben = o.steuerCent !== null && neunzehn === 0 ? o.steuerCent : 0;

  const z = (await db()`
    insert into bewirtung (foto, foto_typ, foto_hash, erstellt_von, datum, restaurant, brutto_cent,
                           mwst7_cent, mwst19_cent, art, kategorie, zweck, herkunft, gesellschaft,
                           ist_rechnung, amazon_order_id, amazon_rechnungsnummer, amazon_dokumenttyp,
                           netto_cent, verkaeufer, notiz)
    values (decode(${o.pdf.toString("base64")}, 'base64'), 'application/pdf', ${o.hash},
            'Amazon Business', ${o.datum}::date, ${o.verkaeufer || "Amazon"}, ${o.bruttoCent},
            ${sieben}, ${neunzehn}, 'einkauf', '', '', 'amazon_business', 'fzt',
            true, ${o.orderId}, ${o.nummer}, ${o.dokumenttyp}, ${o.nettoCent}, ${o.verkaeufer || "Amazon"},
            ${`Automatisch von Amazon Business geholt. Bestellung ${o.orderId}, Rechnung ${o.nummer}.`})
    returning id
  `) as Array<{ id: string }>;

  return String(z[0].id);
}

/** Der ganze Lauf: suchen, merken, PDFs holen. */
export async function amazonLauf(): Promise<AmazonLauf> {
  const fehler: string[] = [];
  let gesehen = 0;
  let gemerkt = 0;

  try {
    const s = await rechnungenSuchen();
    gesehen = s.gesehen;
    gemerkt = s.gemerkt;
  } catch (f) {
    const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
    fehler.push(meldung);
    await db()`update amazon_abgleich set zuletzt_am = now(), zuletzt_fehler = ${meldung.slice(0, 400)} where id = 1`.catch(
      () => undefined,
    );
    return { gesehen, gemerkt, importiert: 0, wartenAufPdf: 0, fehler };
  }

  const p = await pdfsHolen();
  fehler.push(...p.fehler);

  return { gesehen, gemerkt, importiert: p.importiert, wartenAufPdf: p.offen, fehler };
}
