/**
 * Umsätze vom Konto hereinholen und zuordnen.
 *
 * Der Abruf bei der Bank läuft absichtlich NICHT hier. Auf Vercel liegt
 * kein Ort, an dem Bankzugangsdaten gut aufgehoben wären, und eine
 * FinTS-Verbindung braucht einen dauerhaften Zustand (System-Kennung,
 * TAN-Freigabe). Stattdessen holt ein kleines Programm die Umsätze dort
 * ab, wo die Zugangsdaten ohnehin hingehören (scripts/bank-abruf.py, auf
 * einem Rechner im Haus), und schickt sie hierher. Der Eventmanager
 * bekommt nie eine PIN zu sehen (Florian, 22.09.2026).
 *
 * Doppelte Buchungen sind der gefährlichste Fall: Wird derselbe Umsatz
 * zweimal verarbeitet, gilt eine Rechnung als doppelt bezahlt. Deshalb
 * trägt jeder Umsatz einen Fingerabdruck aus Konto, Tag, Betrag,
 * Verwendungszweck und Bankreferenz. Kommt er noch einmal, wird er
 * erkannt und übersprungen, egal wie oft synchronisiert wird.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { alleRechnungen, merken, syncMerken, zahlungEintragen, type BankUmsatz } from "./db";
import { entscheiden } from "./abgleich";

export interface RoherUmsatz {
  /** JJJJ-MM-TT */
  buchungstag: string;
  wertstellung?: string | null;
  /** In Cent, positiv für Eingänge. */
  betragCent: number;
  waehrung?: string;
  gegenname?: string;
  gegenIban?: string;
  verwendungszweck?: string;
  /** Referenz der Bank, falls geliefert. Macht den Fingerabdruck sicherer. */
  bankReferenz?: string | null;
  /** Kennung der Bank, falls sie eine stabile liefert. */
  transaktionsId?: string | null;
}

/** Der Fingerabdruck einer Buchung. Gleiche Buchung, gleicher Abdruck. */
export function fingerabdruck(u: RoherUmsatz): string {
  const teile = [
    u.transaktionsId ?? "",
    u.bankReferenz ?? "",
    u.buchungstag,
    String(u.betragCent),
    (u.gegenIban ?? "").replace(/\s/g, "").toUpperCase(),
    (u.gegenname ?? "").trim().toLowerCase(),
    (u.verwendungszweck ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
  ].join("|");
  return createHash("sha256").update(teile).digest("hex");
}

export interface ImportErgebnis {
  neu: number;
  schonBekannt: number;
  zugeordnet: number;
  offen: number;
  fehler: string[];
}

/**
 * Nimmt Umsätze entgegen, legt die neuen an und ordnet zu, was eindeutig ist.
 * Mehrfach aufgerufen passiert beim zweiten Mal nichts.
 */
export async function umsaetzeUebernehmen(
  liste: RoherUmsatz[],
  wer = "Bankabgleich",
): Promise<ImportErgebnis> {
  const ergebnis: ImportErgebnis = { neu: 0, schonBekannt: 0, zugeordnet: 0, offen: 0, fehler: [] };
  const neue: BankUmsatz[] = [];

  for (const u of liste) {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(u.buchungstag) || !Number.isFinite(u.betragCent)) {
        ergebnis.fehler.push(`Unbrauchbarer Umsatz am ${u.buchungstag}`);
        continue;
      }
      const abdruck = fingerabdruck(u);
      const z = (await db()`
        insert into bank_umsatz (fingerabdruck, bank_referenz, buchungstag, wertstellung, betrag_cent,
                                 waehrung, gegenname, gegen_iban, verwendungszweck, roh)
        values (${abdruck}, ${u.bankReferenz ?? null}, ${u.buchungstag}::date,
                ${u.wertstellung ?? null}::date, ${u.betragCent}, ${u.waehrung ?? "EUR"},
                ${u.gegenname ?? ""}, ${(u.gegenIban ?? "").replace(/\s/g, "").toUpperCase()},
                ${u.verwendungszweck ?? ""}, ${JSON.stringify(u)}::jsonb)
        on conflict (fingerabdruck) do nothing
        returning id, fingerabdruck, bank_referenz, buchungstag::text as buchungstag,
                  wertstellung::text as wertstellung, betrag_cent, gegenname, gegen_iban,
                  verwendungszweck, stand, ignoriert_grund, importiert_am
      `) as Array<Record<string, unknown>>;

      if (!z[0]) {
        ergebnis.schonBekannt++;
        continue;
      }
      ergebnis.neu++;
      neue.push({
        id: String(z[0].id),
        fingerabdruck: String(z[0].fingerabdruck),
        bankReferenz: (z[0].bank_referenz as string) ?? null,
        buchungstag: String(z[0].buchungstag),
        wertstellung: (z[0].wertstellung as string) ?? null,
        betragCent: Number(z[0].betrag_cent),
        gegenname: String(z[0].gegenname ?? ""),
        gegenIban: String(z[0].gegen_iban ?? ""),
        verwendungszweck: String(z[0].verwendungszweck ?? ""),
        stand: "offen",
        ignoriertGrund: null,
        importiertAm: new Date(z[0].importiert_am as string).toISOString(),
        zuordnungen: [],
      });
    } catch (f) {
      ergebnis.fehler.push(f instanceof Error ? f.message : "Unbekannter Fehler beim Übernehmen");
    }
  }

  // Zuordnen, immer gegen den frischen Stand der Rechnungen.
  for (const u of neue) {
    if (u.betragCent <= 0) {
      await db()`update bank_umsatz set stand = 'ignoriert', ignoriert_grund = 'Abbuchung' where id = ${u.id}`;
      continue;
    }
    const rechnungen = await alleRechnungen();
    const e = entscheiden(u, rechnungen);
    if (e.rechnung) {
      await zahlungEintragen({
        rechnungId: e.rechnung.id,
        bankUmsatzId: u.id,
        betragCent: u.betragCent,
        datum: u.buchungstag,
        herkunft: "automatisch",
        notiz: u.verwendungszweck.slice(0, 200),
        wer,
      });
      // Die IBAN des Kunden merken, dann fällt die nächste Zahlung leichter.
      if (u.gegenIban) {
        await db()`
          update rechnung set kunde_iban = ${u.gegenIban}
           where id = ${e.rechnung.id} and coalesce(kunde_iban, '') = ''
        `;
      }
      ergebnis.zugeordnet++;
    } else {
      ergebnis.offen++;
      await merken({
        rechnungId: null,
        art: "umsatz_offen",
        text: `Zahlungseingang ${(u.betragCent / 100).toFixed(2)} Euro von ${u.gegenname || "unbekannt"} konnte nicht sicher zugeordnet werden: ${e.grund}`,
        wer,
      });
    }
  }

  await syncMerken({
    umsaetze: ergebnis.neu,
    bisDatum: liste.length > 0 ? liste.map((u) => u.buchungstag).sort().slice(-1)[0] : null,
    fehler: ergebnis.fehler[0] ?? null,
  });

  return ergebnis;
}

/* ------------------------------------------------------------------ *
 * Dateien aus dem Online-Banking lesen.
 *
 * Solange der FinTS-Abruf nicht läuft, kommt man auch ohne ihn ans Ziel:
 * Im Online-Banking gibt es "Umsätze exportieren". Die drei Formate, die
 * die Volksbank anbietet, versteht das Programm.
 * ------------------------------------------------------------------ */

/** CSV der VR-Banken: Buchungstag, Valuta, Name, IBAN, Verwendungszweck, Betrag. */
export function ausCsv(inhalt: string): RoherUmsatz[] {
  const zeilen = inhalt.split(/\r?\n/).filter((z) => z.trim().length > 0);
  if (zeilen.length < 2) return [];
  const trenner = (zeilen[0].match(/;/g)?.length ?? 0) >= (zeilen[0].match(/,/g)?.length ?? 0) ? ";" : ",";

  const spalten = zerlegen(zeilen[0], trenner).map((s) => s.toLowerCase().replace(/"/g, "").trim());
  const finde = (...namen: string[]) => spalten.findIndex((s) => namen.some((n) => s.includes(n)));
  const iBuchung = finde("buchungstag", "buchung");
  const iValuta = finde("valuta", "wertstellung");
  const iName = finde("name zahlungsbeteiligter", "beguenstigter", "begünstigter", "auftraggeber", "name");
  const iIban = finde("iban zahlungsbeteiligter", "iban", "kontonummer");
  const iZweck = finde("verwendungszweck", "buchungstext");
  const iBetrag = finde("betrag");
  const iWaehrung = finde("währung", "waehrung");

  const raus: RoherUmsatz[] = [];
  for (const zeile of zeilen.slice(1)) {
    const f = zerlegen(zeile, trenner).map((s) => s.replace(/^"|"$/g, "").trim());
    const tag = datumAus(f[iBuchung] ?? "");
    const betrag = betragAus(f[iBetrag] ?? "");
    if (!tag || betrag === null) continue;
    raus.push({
      buchungstag: tag,
      wertstellung: datumAus(f[iValuta] ?? "") ?? undefined,
      betragCent: betrag,
      waehrung: (f[iWaehrung] ?? "EUR") || "EUR",
      gegenname: f[iName] ?? "",
      gegenIban: f[iIban] ?? "",
      verwendungszweck: f[iZweck] ?? "",
    });
  }
  return raus;
}

/** Eine CSV-Zeile in Felder zerlegen, Anführungszeichen beachtet. */
function zerlegen(zeile: string, trenner: string): string[] {
  const raus: string[] = [];
  let feld = "";
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') {
        feld += '"';
        i++;
      } else inAnfuehrung = !inAnfuehrung;
    } else if (c === trenner && !inAnfuehrung) {
      raus.push(feld);
      feld = "";
    } else feld += c;
  }
  raus.push(feld);
  return raus;
}

/** "22.09.2026" oder "22.09.26" oder "2026-09-22" zu "2026-09-22". */
function datumAus(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (!m) return null;
  const jahr = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${jahr}-${m[2]}-${m[1]}`;
}

/** "1.234,56" oder "-1234.56" zu Cent. */
function betragAus(s: string): number | null {
  const t = s.replace(/\s|€|EUR/gi, "").trim();
  if (!t) return null;
  const deutsch = /,\d{1,2}$/.test(t);
  const zahl = deutsch ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(zahl);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * CAMT.053 (XML) der Banken. Gelesen werden nur gebuchte Umsätze (BOOK).
 * Ohne XML-Bibliothek: Die Struktur ist flach genug für reguläre Ausdrücke,
 * und eine Abhängigkeit weniger ist in einem Programm, das Geld anfasst,
 * mehr wert als Eleganz.
 */
export function ausCamt(xml: string): RoherUmsatz[] {
  const raus: RoherUmsatz[] = [];
  for (const m of xml.matchAll(/<Ntry>([\s\S]*?)<\/Ntry>/g)) {
    const e = m[1];
    const status = e.match(/<Sts>(?:<Cd>)?([A-Z]+)/)?.[1] ?? "";
    if (status && status !== "BOOK") continue;
    const betrag = Number(e.match(/<Amt[^>]*>([\d.]+)<\/Amt>/)?.[1] ?? "NaN");
    const richtung = e.match(/<CdtDbtInd>([A-Z]+)<\/CdtDbtInd>/)?.[1] ?? "CRDT";
    const buchung = e.match(/<BookgDt>\s*<Dt>([\d-]+)<\/Dt>/)?.[1];
    const valuta = e.match(/<ValDt>\s*<Dt>([\d-]+)<\/Dt>/)?.[1];
    if (!Number.isFinite(betrag) || !buchung) continue;

    const vorzeichen = richtung === "DBIT" ? -1 : 1;
    const zweck = [...e.matchAll(/<Ustrd>([\s\S]*?)<\/Ustrd>/g)].map((x) => x[1]).join(" ");
    const name =
      e.match(/<RltdPties>[\s\S]*?<Dbtr>[\s\S]*?<Nm>([\s\S]*?)<\/Nm>/)?.[1] ??
      e.match(/<RltdPties>[\s\S]*?<Cdtr>[\s\S]*?<Nm>([\s\S]*?)<\/Nm>/)?.[1] ??
      "";
    const iban =
      e.match(/<DbtrAcct>[\s\S]*?<IBAN>([A-Z0-9]+)<\/IBAN>/)?.[1] ??
      e.match(/<CdtrAcct>[\s\S]*?<IBAN>([A-Z0-9]+)<\/IBAN>/)?.[1] ??
      "";
    const referenz = e.match(/<AcctSvcrRef>([\s\S]*?)<\/AcctSvcrRef>/)?.[1] ?? null;

    raus.push({
      buchungstag: buchung,
      wertstellung: valuta ?? null,
      betragCent: Math.round(betrag * 100) * vorzeichen,
      gegenname: entschaerfen(name),
      gegenIban: iban,
      verwendungszweck: entschaerfen(zweck),
      bankReferenz: referenz ? entschaerfen(referenz) : null,
    });
  }
  return raus;
}

function entschaerfen(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** MT940, das alte Kontoauszugsformat. :61: ist die Buchung, :86: der Text. */
export function ausMt940(inhalt: string): RoherUmsatz[] {
  const raus: RoherUmsatz[] = [];
  const zeilen = inhalt.split(/\r?\n/);
  let offen: RoherUmsatz | null = null;
  let text = "";

  const abschliessen = () => {
    if (!offen) return;
    const zweck = text.replace(/\?\d{2}/g, " ").replace(/\s+/g, " ").trim();
    const name = text.match(/\?3[23]([^?]*)/g)?.map((s) => s.slice(3)).join(" ").trim() ?? "";
    const iban = text.match(/\?3[01]([A-Z0-9]+)/)?.[1] ?? "";
    raus.push({ ...offen, verwendungszweck: zweck, gegenname: name, gegenIban: iban });
    offen = null;
    text = "";
  };

  for (const z of zeilen) {
    if (z.startsWith(":61:")) {
      abschliessen();
      const m = z.match(/^:61:(\d{6})(\d{4})?(C|D|RC|RD)([\d,.]+)/);
      if (!m) continue;
      const jahr = `20${m[1].slice(0, 2)}`;
      const tag = `${jahr}-${m[1].slice(2, 4)}-${m[1].slice(4, 6)}`;
      const betrag = Number(m[4].replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(betrag)) continue;
      const negativ = m[3].startsWith("D") || m[3] === "RC";
      offen = {
        buchungstag: tag,
        betragCent: Math.round(betrag * 100) * (negativ ? -1 : 1),
        verwendungszweck: "",
      };
    } else if (z.startsWith(":86:")) {
      text = z.slice(4);
    } else if (offen && !z.startsWith(":")) {
      text += z;
    }
  }
  abschliessen();
  return raus;
}

/** Erkennt das Format am Inhalt und liest die Umsätze. */
export function ausDatei(inhalt: string): RoherUmsatz[] {
  const anfang = inhalt.trimStart().slice(0, 200);
  if (anfang.startsWith("<?xml") || anfang.includes("<Document")) return ausCamt(inhalt);
  if (anfang.includes(":20:") || anfang.includes(":61:")) return ausMt940(inhalt);
  return ausCsv(inhalt);
}
