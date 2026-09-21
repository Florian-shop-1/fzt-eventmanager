/**
 * Monatsrechnung an die Gastro. Siehe migrations/046 und 051.
 *
 * Der Eventmanager schreibt die Rechnung selbst:
 *  1. Alles zusammenzählen, was im Monat übergeben wurde, dazu die Ware,
 *     die sich die Gastro genommen und nicht zurückgebracht hat.
 *  2. Rechnungsnummer aus dem Erstellungsdatum bilden (RE-2026-10-01-01).
 *     Eindeutig, fortlaufend und auf einen Blick einzuordnen.
 *  3. PDF bauen (siehe pdf.ts) und unveränderbar zur Rechnung speichern.
 *  4. An Osman schicken, in Kopie an Werner, Kevin und Florian.
 *  5. Ist Lexware Office verbunden, wird die Rechnung dort als Beleg
 *     hinterlegt. Dann läuft der Abgleich mit dem Bankkonto wie gewohnt.
 */

import { db } from "@/lib/db/client";
import { lexoffice, lexofficeEingerichtet } from "@/lib/lexoffice/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { bestellungen, euro, leihen } from "./db";
import { rechnungsPdfBauen, type Absender, type RechnungsPosition } from "./pdf";

export interface Empfaenger {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
}

export interface RechnungsEinstellung {
  empfaenger: Empfaenger;
  an: string[];
  kopie: string[];
  automatisch: boolean;
  zahlungszielTage: number;
  absender: Absender;
}

export interface WeinRechnung {
  id: string;
  monat: string;
  nummer: string | null;
  nettoCent: number;
  ustCent: number;
  bruttoCent: number;
  erstelltAm: string;
  versendetAm: string | null;
  versendetAn: string[];
  status: string;
  bezahltAm: string | null;
  lexofficeId: string | null;
  hatPdf: boolean;
}

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function monatsname(monat: string): string {
  const [j, m] = monat.split("-").map(Number);
  return `${MONATE[m - 1]} ${j}`;
}

export function vormonat(heute = new Date()): string {
  const d = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function rechnungsEinstellung(): Promise<RechnungsEinstellung> {
  const z = (await db()`
    select rechnung_empfaenger, rechnung_an, rechnung_kopie, rechnung_automatisch, zahlungsziel_tage, absender
      from wein_einstellung where id = 1
  `) as Array<Record<string, unknown>>;
  return {
    empfaenger: z[0].rechnung_empfaenger as Empfaenger,
    an: (z[0].rechnung_an as string[]) ?? [],
    kopie: (z[0].rechnung_kopie as string[]) ?? [],
    automatisch: Boolean(z[0].rechnung_automatisch),
    zahlungszielTage: Number(z[0].zahlungsziel_tage ?? 14),
    absender: z[0].absender as Absender,
  };
}

/** Was auf der Rechnung fehlen würde. Leer heißt: alles da. */
export function fehlendePflichtangaben(a: Absender): string[] {
  const fehlt: string[] = [];
  if (!a.firma) fehlt.push("Firma");
  if (!a.strasse || !a.plz || !a.ort) fehlt.push("Anschrift");
  if (!a.steuernummer && !a.ustId) fehlt.push("Steuernummer oder USt-IdNr.");
  if (!a.iban) fehlt.push("IBAN");
  return fehlt;
}

function baue(r: Record<string, unknown>): WeinRechnung {
  const t = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(r.id),
    monat: String(r.monat),
    nummer: (r.nummer as string) ?? null,
    nettoCent: Number(r.netto_cent),
    ustCent: Number(r.ust_cent),
    bruttoCent: Number(r.brutto_cent),
    erstelltAm: t(r.erstellt_am)!,
    versendetAm: t(r.versendet_am),
    versendetAn: (r.versendet_an as string[]) ?? [],
    status: String(r.status),
    bezahltAm: t(r.bezahlt_am),
    lexofficeId: (r.lexoffice_id as string) ?? null,
    hatPdf: Boolean(r.hat_pdf),
  };
}

const SPALTEN = `id, monat, nummer, netto_cent, ust_cent, brutto_cent, erstellt_am, versendet_am, versendet_an,
  status, bezahlt_am, lexoffice_id, (pdf is not null) as hat_pdf`;

export async function rechnungDesMonats(monat: string): Promise<WeinRechnung | null> {
  const z = (await db().query(`select ${SPALTEN} from wein_rechnung where monat = $1`, [monat])) as Array<Record<string, unknown>>;
  return z[0] ? baue(z[0]) : null;
}

export async function alleRechnungen(): Promise<WeinRechnung[]> {
  const z = (await db().query(`select ${SPALTEN} from wein_rechnung order by monat desc limit 24`)) as Array<Record<string, unknown>>;
  return z.map(baue);
}

export async function rechnungsPdf(id: string): Promise<Buffer | null> {
  const z = (await db()`select encode(pdf, 'base64') as b from wein_rechnung where id = ${id}`) as Array<{ b: string | null }>;
  return z[0]?.b ? Buffer.from(z[0].b, "base64") : null;
}

/**
 * Alles, was in einem Monat zu berechnen ist: übergebener Wein und Ware,
 * die nicht zurückgebracht wurde. Die Preise sind Nettopreise.
 */
export async function monatsPositionen(monat: string) {
  const [j, m] = monat.split("-").map(Number);
  const von = new Date(Date.UTC(j, m - 1, 1));
  const bis = new Date(Date.UTC(j, m, 1));
  const vonIso = von.toISOString();
  const bisIso = bis.toISOString();
  const vonTag = vonIso.slice(0, 10);
  const bisTag = bisIso.slice(0, 10);

  const liste = await bestellungen({ status: "uebergeben", seit: vonIso, bis: bisIso });
  const jeSorte = new Map<string, RechnungsPosition>();
  for (const x of liste) {
    for (const p of x.positionen) {
      const k = `${p.artikelId}|${p.ekCent}`;
      const e = jeSorte.get(k) ?? { name: p.name, menge: 0, einzelCent: p.ekCent, summeCent: 0 };
      e.menge += p.menge;
      e.summeCent += p.menge * p.ekCent;
      jeSorte.set(k, e);
    }
  }

  // Ausgeliehene Ware: Marktpreis plus Aufschlag, als Nettobetrag gerechnet.
  const offeneLeihen = (await leihen({ seit: vonTag, bis: bisTag })).filter((l) => l.status === "offen");
  const jeLeihe = new Map<string, RechnungsPosition>();
  for (const l of offeneLeihen) {
    const netto = Math.round(l.preisCent / 1.19);
    const k = `${l.name}|${netto}`;
    const e = jeLeihe.get(k) ?? { name: l.name, menge: 0, einzelCent: netto, summeCent: 0 };
    e.menge += l.menge;
    e.summeCent += l.menge * netto;
    jeLeihe.set(k, e);
  }

  const positionen = [...jeSorte.values(), ...jeLeihe.values()];
  const netto = positionen.reduce((n, e) => n + e.summeCent, 0);
  const ust = Math.round(netto * 0.19);
  return {
    positionen,
    wein: [...jeSorte.values()],
    leihware: [...jeLeihe.values()],
    netto,
    ust,
    brutto: netto + ust,
    uebergaben: liste.length,
    von: vonIso,
    bis: bisIso,
    leistungszeitraum: `01.${String(m).padStart(2, "0")}.${j} bis ${new Date(bis.getTime() - 86400000)
      .toISOString()
      .slice(0, 10)
      .split("-")
      .reverse()
      .join(".")}`,
  };
}

/**
 * Die Rechnungsnummer aus dem Erstellungsdatum: RE-2026-10-01-01.
 * Der letzte Teil zählt hoch, falls an einem Tag mehrere Rechnungen entstehen.
 */
export async function naechsteNummer(heute = new Date()): Promise<string> {
  const tag = heute.toISOString().slice(0, 10);
  const z = (await db()`
    select coalesce(max(right(nummer, 2)::int), 0) + 1 as n from wein_rechnung where nummer like ${"RE-" + tag + "-%"}
  `) as Array<{ n: number }>;
  return `RE-${tag}-${String(z[0]?.n ?? 1).padStart(2, "0")}`;
}

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Rechnung für einen Monat erstellen, speichern und verschicken. */
export async function rechnungErstellenUndSenden(monat: string, von: string): Promise<WeinRechnung> {
  const vorhanden = await rechnungDesMonats(monat);
  if (vorhanden?.versendetAm) return vorhanden;

  const e = await rechnungsEinstellung();
  const fehlt = fehlendePflichtangaben(e.absender);
  if (fehlt.length) throw new Error(`Für die Rechnung fehlen noch Pflichtangaben: ${fehlt.join(", ")}.`);
  if (!e.an.length) throw new Error("Es ist keine Empfängeradresse für die Rechnung hinterlegt.");

  const daten = await monatsPositionen(monat);
  if (daten.positionen.length === 0) throw new Error(`Im ${monatsname(monat)} gibt es nichts zu berechnen.`);

  const heute = new Date();
  const nummer = vorhanden?.nummer ?? (await naechsteNummer(heute));
  const datum = heute.toISOString().slice(0, 10);

  const pdf = await rechnungsPdfBauen({
    nummer,
    datum,
    leistungszeitraum: daten.leistungszeitraum,
    empfaenger: e.empfaenger,
    positionen: daten.positionen,
    nettoCent: daten.netto,
    ustCent: daten.ust,
    bruttoCent: daten.brutto,
    zahlungszielTage: e.zahlungszielTage,
    absender: e.absender,
  });

  const gespeichert = (await db().query(
    `insert into wein_rechnung (monat, empfaenger, netto_cent, ust_cent, brutto_cent, nummer, erstellt_von,
                                pdf, positionen, absender, leistungszeitraum)
     values ($1, $2::jsonb, $3, $4, $5, $6, $7, decode($8, 'base64'), $9::jsonb, $10::jsonb, $11)
     on conflict (monat) do update set nummer = excluded.nummer, netto_cent = excluded.netto_cent,
       ust_cent = excluded.ust_cent, brutto_cent = excluded.brutto_cent, pdf = excluded.pdf,
       positionen = excluded.positionen, absender = excluded.absender, leistungszeitraum = excluded.leistungszeitraum
     returning ${SPALTEN}`,
    [
      monat,
      JSON.stringify(e.empfaenger),
      daten.netto,
      daten.ust,
      daten.brutto,
      nummer,
      von,
      pdf.toString("base64"),
      JSON.stringify(daten.positionen),
      JSON.stringify(e.absender),
      daten.leistungszeitraum,
    ],
  )) as Array<Record<string, unknown>>;
  const r = baue(gespeichert[0]);

  // Mail an Osman, Kopie an Werner, Kevin und Florian.
  const zeilen = daten.positionen.map((p) => `${p.menge} × ${p.name} à ${euro(p.einzelCent)} = ${euro(p.summeCent)}`);
  const text =
    `Guten Tag,\n\nanbei die Rechnung ${nummer} für ${monatsname(monat)}:\n\n` +
    zeilen.map((z) => `- ${z}`).join("\n") +
    `\n\nNetto ${euro(daten.netto)}, zzgl. 19 % USt ${euro(daten.ust)}, Rechnungsbetrag ${euro(daten.brutto)}.` +
    `\nZahlbar innerhalb von ${e.zahlungszielTage} Tagen.\n\nVielen Dank und herzliche Grüße\nFlorian Zimmer Theater`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d1b18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#1d1b18;color:#c9a45c;padding:16px 24px;font-size:13px;letter-spacing:2px;text-transform:uppercase">Florian Zimmer Theater · Rechnung ${h(nummer)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 14px">Guten Tag,</p>
<p style="margin:0 0 14px">anbei die Rechnung für ${h(monatsname(monat))}.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 14px">
${daten.positionen.map((p) => `<tr><td style="padding:4px 0;border-bottom:1px solid #eee">${p.menge} × ${h(p.name)}</td><td align="right" style="padding:4px 0;border-bottom:1px solid #eee">${h(euro(p.summeCent))}</td></tr>`).join("")}
<tr><td style="padding:6px 0 0">Netto</td><td align="right" style="padding:6px 0 0">${h(euro(daten.netto))}</td></tr>
<tr><td>zzgl. 19 % USt</td><td align="right">${h(euro(daten.ust))}</td></tr>
<tr><td style="font-weight:bold;padding-top:4px">Rechnungsbetrag</td><td align="right" style="font-weight:bold;padding-top:4px">${h(euro(daten.brutto))}</td></tr>
</table>
<p style="margin:0 0 14px">Zahlbar innerhalb von ${e.zahlungszielTage} Tagen. Die Rechnung liegt als PDF bei.</p>
<p style="margin:18px 0 0">Vielen Dank und herzliche Grüße<br>Florian Zimmer Theater</p>
</td></tr></table></td></tr></table></body></html>`;

  await mailVerschicken({
    an: e.an,
    blindkopie: undefined,
    betreff: `Rechnung ${nummer} vom Florian Zimmer Theater, ${monatsname(monat)}`,
    text,
    html,
    antwortAn: "info@florianzimmer.com",
    anhaenge: [{ name: `${nummer}.pdf`, typ: "application/pdf", base64: pdf.toString("base64") }],
  });
  // Kopie getrennt, damit Osman nicht die internen Adressen sieht.
  if (e.kopie.length) {
    await mailVerschicken({
      an: e.kopie,
      betreff: `Kopie: Rechnung ${nummer} an ${e.empfaenger.name}, ${monatsname(monat)}`,
      text: `Kopie zur Information.\n\n${text}`,
      html,
      anhaenge: [{ name: `${nummer}.pdf`, typ: "application/pdf", base64: pdf.toString("base64") }],
    }).catch((f) => console.error("[wein] Kopie fehlgeschlagen:", f));
  }

  const fertig = (await db().query(
    `update wein_rechnung set versendet_am = now(), versendet_an = $2 where id = $1 returning ${SPALTEN}`,
    [r.id, [...e.an, ...e.kopie]],
  )) as Array<Record<string, unknown>>;

  // In Lexware Office als Beleg hinterlegen, damit der Kontoabgleich läuft.
  await inLexofficeHinterlegen(r.id, nummer, datum, daten.netto, daten.ust, e).catch((f) =>
    console.error("[wein] lexoffice:", f),
  );

  return baue(fertig[0]);
}

/**
 * Die eigene Rechnung als Beleg in Lexware Office ablegen.
 *
 * Bewusst als Beleg (voucher) und nicht als lexoffice-Rechnung: So bleibt
 * unsere Nummer die gültige, und lexoffice übernimmt nur noch den Abgleich
 * mit dem Bankkonto. Ohne Schlüssel passiert hier nichts.
 */
async function inLexofficeHinterlegen(
  id: string,
  nummer: string,
  datum: string,
  nettoCent: number,
  ustCent: number,
  e: RechnungsEinstellung,
): Promise<void> {
  if (!lexofficeEingerichtet()) return;
  const faellig = new Date(Date.parse(datum) + e.zahlungszielTage * 86400000).toISOString().slice(0, 10);
  const antwort = await lexoffice<{ id: string }>("/v1/vouchers", {
    methode: "POST",
    rumpf: {
      type: "salesinvoice",
      voucherNumber: nummer,
      voucherDate: datum,
      dueDate: faellig,
      totalGrossAmount: Number(((nettoCent + ustCent) / 100).toFixed(2)),
      totalTaxAmount: Number((ustCent / 100).toFixed(2)),
      taxType: "net",
      useCollectiveContact: true,
      remark: `Magicuvée und Ware, ${e.empfaenger.name}`,
      voucherItems: [
        {
          amount: Number(((nettoCent + ustCent) / 100).toFixed(2)),
          taxAmount: Number((ustCent / 100).toFixed(2)),
          taxRatePercent: 19,
          categoryId: "8f8664a8-fd86-11e1-a21f-0800200c9a66", // Umsatzerlöse 19 %
        },
      ],
    },
  });
  await db()`update wein_rechnung set lexoffice_id = ${antwort.id} where id = ${id}`;
}

/** Fragt bei lexoffice nach, ob offene Rechnungen inzwischen bezahlt sind. */
export async function zahlungenPruefen(): Promise<number> {
  if (!lexofficeEingerichtet()) return 0;
  const offen = (await db()`
    select id, lexoffice_id from wein_rechnung where lexoffice_id is not null and bezahlt_am is null and status <> 'voided'
  `) as Array<{ id: string; lexoffice_id: string }>;
  let bezahlt = 0;
  for (const r of offen) {
    const d = await lexoffice<{ voucherStatus?: string }>(`/v1/vouchers/${r.lexoffice_id}`).catch(() => null);
    if (!d) continue;
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
 * Vormonat, wenn die Automatik an ist, und der Blick aufs Konto.
 */
export async function taeglicherRechnungslauf(): Promise<{ erstellt: string | null; bezahlt: number }> {
  let erstellt: string | null = null;
  const e = await rechnungsEinstellung();
  const heute = new Date();
  if (e.automatisch && heute.getUTCDate() <= 5) {
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
