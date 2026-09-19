/**
 * Monatsrechnung für den Magicuvée an die Gastro. Siehe migrations/046.
 *
 * Ablauf:
 *  1. Aus allen im Monat übergebenen Bestellungen die Positionen summieren.
 *  2. In Lexware Office (lexoffice) eine Rechnung anlegen und abschließen.
 *     lexoffice vergibt die fortlaufende Nummer und archiviert sie.
 *  3. Das PDF holen und mit einer eigenen Mail an Osman, Kevin und Florians
 *     Vater schicken.
 *  4. Täglich in lexoffice nachsehen, ob sie bezahlt ist. lexoffice gleicht
 *     dafür das Bankkonto ab.
 */

import { db } from "@/lib/db/client";
import { lexoffice, lexofficeDatei, lexofficeEingerichtet } from "@/lib/lexoffice/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { bestellungen, euro } from "./db";

export interface Empfaenger {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
}

export interface RechnungsEinstellung {
  empfaenger: Empfaenger;
  an: string[];
  automatisch: boolean;
  zahlungszielTage: number;
}

export interface WeinRechnung {
  id: string;
  monat: string;
  nettoCent: number;
  ustCent: number;
  bruttoCent: number;
  lexofficeId: string | null;
  nummer: string | null;
  erstelltAm: string;
  versendetAm: string | null;
  versendetAn: string[];
  status: string;
  bezahltAm: string | null;
}

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function monatsname(monat: string): string {
  const [j, m] = monat.split("-").map(Number);
  return `${MONATE[m - 1]} ${j}`;
}

/** Der Vormonat zu einem Datum, als "2026-09". */
export function vormonat(heute = new Date()): string {
  const d = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function rechnungsEinstellung(): Promise<RechnungsEinstellung> {
  const z = (await db()`
    select rechnung_empfaenger, rechnung_an, rechnung_automatisch, zahlungsziel_tage from wein_einstellung where id = 1
  `) as Array<Record<string, unknown>>;
  return {
    empfaenger: z[0].rechnung_empfaenger as Empfaenger,
    an: (z[0].rechnung_an as string[]) ?? [],
    automatisch: Boolean(z[0].rechnung_automatisch),
    zahlungszielTage: Number(z[0].zahlungsziel_tage ?? 14),
  };
}

function baue(r: Record<string, unknown>): WeinRechnung {
  const t = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(r.id),
    monat: String(r.monat),
    nettoCent: Number(r.netto_cent),
    ustCent: Number(r.ust_cent),
    bruttoCent: Number(r.brutto_cent),
    lexofficeId: (r.lexoffice_id as string) ?? null,
    nummer: (r.nummer as string) ?? null,
    erstelltAm: t(r.erstellt_am)!,
    versendetAm: t(r.versendet_am),
    versendetAn: (r.versendet_an as string[]) ?? [],
    status: String(r.status),
    bezahltAm: t(r.bezahlt_am),
  };
}

export async function rechnungDesMonats(monat: string): Promise<WeinRechnung | null> {
  const z = (await db()`select * from wein_rechnung where monat = ${monat}`) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

export async function alleRechnungen(): Promise<WeinRechnung[]> {
  const z = (await db()`select * from wein_rechnung order by monat desc limit 24`) as Array<Record<string, unknown>>;
  return z.map(baue);
}

/** Summen je Sorte und Preis für einen Monat, aus den übergebenen Bestellungen. */
export async function monatsPositionen(monat: string) {
  const [j, m] = monat.split("-").map(Number);
  const von = new Date(Date.UTC(j, m - 1, 1)).toISOString();
  const bis = new Date(Date.UTC(j, m, 1)).toISOString();
  const liste = await bestellungen({ status: "uebergeben", seit: von, bis });
  const jeSorte = new Map<string, { name: string; menge: number; ekCent: number; summe: number }>();
  for (const x of liste) {
    for (const p of x.positionen) {
      const k = `${p.artikelId}|${p.ekCent}`;
      const e = jeSorte.get(k) ?? { name: p.name, menge: 0, ekCent: p.ekCent, summe: 0 };
      e.menge += p.menge;
      e.summe += p.menge * p.ekCent;
      jeSorte.set(k, e);
    }
  }
  const positionen = [...jeSorte.values()];
  const netto = positionen.reduce((n, e) => n + e.summe, 0);
  const ust = Math.round(netto * 0.19);
  return { positionen, netto, ust, brutto: netto + ust, uebergaben: liste.length, von, bis };
}

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Rechnung für einen Monat anlegen (in lexoffice) und verschicken.
 * Gibt es für den Monat schon eine, wird nichts doppelt angelegt.
 */
export async function rechnungErstellenUndSenden(monat: string, von: string): Promise<WeinRechnung> {
  if (!lexofficeEingerichtet()) throw new Error("Lexware Office ist noch nicht verbunden (LEXOFFICE_API_KEY fehlt).");
  const vorhanden = await rechnungDesMonats(monat);
  if (vorhanden?.versendetAm) return vorhanden;

  const e = await rechnungsEinstellung();
  const daten = await monatsPositionen(monat);
  if (daten.positionen.length === 0) throw new Error(`Im ${monatsname(monat)} wurde nichts übergeben.`);

  let r = vorhanden;
  if (!r) {
    const letzterTag = new Date(new Date(daten.bis).getTime() - 86400000);
    const angelegt = await lexoffice<{ id: string }>("/v1/invoices?finalize=true", {
      methode: "POST",
      rumpf: {
        archived: false,
        voucherDate: new Date().toISOString().replace("Z", "+00:00"),
        address: {
          name: e.empfaenger.name,
          street: e.empfaenger.strasse,
          zip: e.empfaenger.plz,
          city: e.empfaenger.ort,
          countryCode: "DE",
        },
        lineItems: daten.positionen.map((p) => ({
          type: "custom",
          name: p.name,
          description: `Magicuvée, 0,75 l, Lieferung ${monatsname(monat)}`,
          quantity: p.menge,
          unitName: "Flasche",
          unitPrice: { currency: "EUR", netAmount: p.ekCent / 100, taxRatePercentage: 19 },
          discountPercentage: 0,
        })),
        totalPrice: { currency: "EUR" },
        taxConditions: { taxType: "net" },
        paymentConditions: {
          paymentTermLabel: `Zahlbar innerhalb von ${e.zahlungszielTage} Tagen ohne Abzug.`,
          paymentTermDuration: e.zahlungszielTage,
        },
        shippingConditions: {
          shippingType: "serviceperiod",
          shippingDate: daten.von.replace("Z", "+00:00"),
          shippingEndDate: letzterTag.toISOString().replace("Z", "+00:00"),
        },
        title: "Rechnung",
        introduction: `Wie vereinbart berechnen wir Ihnen den im ${monatsname(monat)} gelieferten Magicuvée.`,
        remark: "Vielen Dank für die gute Zusammenarbeit!",
      },
    });
    const details = await lexoffice<{ voucherNumber?: string; voucherStatus?: string }>(`/v1/invoices/${angelegt.id}`);
    const z = (await db()`
      insert into wein_rechnung (monat, empfaenger, netto_cent, ust_cent, brutto_cent, lexoffice_id, nummer, erstellt_von, status)
      values (${monat}, ${JSON.stringify(e.empfaenger)}::jsonb, ${daten.netto}, ${daten.ust}, ${daten.brutto},
              ${angelegt.id}, ${details.voucherNumber ?? null}, ${von}, ${details.voucherStatus ?? "open"})
      returning *
    `) as Array<Record<string, unknown>>;
    r = baue(z[0]);
  }

  // PDF holen und verschicken.
  const pdf = await rechnungsPdf(r.lexofficeId!);
  const nummer = r.nummer ?? "";
  const betreff = `Rechnung ${nummer} Magicuvée ${monatsname(monat)}, Florian Zimmer Theater`;
  const zeilen = daten.positionen.map((p) => `${p.menge} × ${p.name} à ${euro(p.ekCent)} = ${euro(p.summe)}`);
  const text =
    `Guten Tag,\n\nanbei die Rechnung ${nummer} für den Magicuvée im ${monatsname(monat)}:\n\n` +
    zeilen.map((z) => `- ${z}`).join("\n") +
    `\n\nNetto ${euro(daten.netto)}, zzgl. 19 % USt ${euro(daten.ust)}, Rechnungsbetrag ${euro(daten.brutto)}.` +
    `\nZahlbar innerhalb von ${e.zahlungszielTage} Tagen.\n\nVielen Dank und herzliche Grüße\nFlorian Zimmer Theater`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d1b18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#1d1b18;color:#c9a45c;padding:16px 24px;font-size:13px;letter-spacing:2px;text-transform:uppercase">Florian Zimmer Theater · Rechnung ${h(nummer)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 14px">Guten Tag,</p>
<p style="margin:0 0 14px">anbei die Rechnung für den Magicuvée im ${h(monatsname(monat))}.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 14px">
${daten.positionen.map((p) => `<tr><td style="padding:4px 0;border-bottom:1px solid #eee">${p.menge} × ${h(p.name)}</td><td align="right" style="padding:4px 0;border-bottom:1px solid #eee">${h(euro(p.summe))}</td></tr>`).join("")}
<tr><td style="padding:6px 0 0">Netto</td><td align="right" style="padding:6px 0 0">${h(euro(daten.netto))}</td></tr>
<tr><td>zzgl. 19 % USt</td><td align="right">${h(euro(daten.ust))}</td></tr>
<tr><td style="font-weight:bold;padding-top:4px">Rechnungsbetrag</td><td align="right" style="font-weight:bold;padding-top:4px">${h(euro(daten.brutto))}</td></tr>
</table>
<p style="margin:0 0 14px">Zahlbar innerhalb von ${e.zahlungszielTage} Tagen. Die Rechnung liegt als PDF bei.</p>
<p style="margin:18px 0 0">Vielen Dank und herzliche Grüße<br>Florian Zimmer Theater</p>
</td></tr></table></td></tr></table></body></html>`;

  await mailVerschicken({
    an: e.an,
    betreff,
    text,
    html,
    antwortAn: "info@florianzimmer.com",
    anhaenge: [{ name: `Rechnung-${nummer || monat}.pdf`, typ: "application/pdf", base64: pdf.toString("base64") }],
  });
  const z = (await db()`
    update wein_rechnung set versendet_am = now(), versendet_an = ${e.an} where id = ${r.id} returning *
  `) as Array<Record<string, unknown>>;
  return baue(z[0]);
}

/** Das PDF zur Rechnung aus lexoffice. */
export async function rechnungsPdf(lexofficeId: string): Promise<Buffer> {
  try {
    return await lexofficeDatei(`/v1/invoices/${lexofficeId}/file`);
  } catch {
    // Ältere Variante: erst das Dokument rendern lassen, dann die Datei holen.
    const d = await lexoffice<{ documentFileId: string }>(`/v1/invoices/${lexofficeId}/document`);
    return lexofficeDatei(`/v1/files/${d.documentFileId}`);
  }
}

/** Fragt bei lexoffice nach, ob offene Rechnungen inzwischen bezahlt sind. */
export async function zahlungenPruefen(): Promise<number> {
  if (!lexofficeEingerichtet()) return 0;
  const offen = (await db()`
    select id, lexoffice_id from wein_rechnung where lexoffice_id is not null and bezahlt_am is null and status not in ('voided')
  `) as Array<{ id: string; lexoffice_id: string }>;
  let bezahlt = 0;
  for (const r of offen) {
    const d = await lexoffice<{ voucherStatus?: string }>(`/v1/invoices/${r.lexoffice_id}`);
    const status = d.voucherStatus ?? "open";
    const istBezahlt = status === "paid" || status === "paidoff";
    if (istBezahlt) bezahlt++;
    await db()`
      update wein_rechnung set status = ${status}, status_geprueft_am = now(),
             bezahlt_am = case when ${istBezahlt} then now() else bezahlt_am end
       where id = ${r.id}
    `;
  }
  return bezahlt;
}

/**
 * Der tägliche Lauf: in den ersten Tagen des Monats die Rechnung für den
 * Vormonat, wenn Florian die Automatik eingeschaltet hat, und immer der
 * Blick aufs Konto.
 */
export async function taeglicherRechnungslauf(): Promise<{ erstellt: string | null; bezahlt: number }> {
  let erstellt: string | null = null;
  const e = await rechnungsEinstellung();
  const heute = new Date();
  if (e.automatisch && heute.getUTCDate() <= 5 && lexofficeEingerichtet()) {
    const monat = vormonat(heute);
    const r = await rechnungDesMonats(monat);
    const daten = await monatsPositionen(monat);
    if (!r?.versendetAm && daten.positionen.length > 0) {
      const neu = await rechnungErstellenUndSenden(monat, "automatisch");
      erstellt = neu.nummer;
    }
  }
  const bezahlt = await zahlungenPruefen();
  return { erstellt, bezahlt };
}
