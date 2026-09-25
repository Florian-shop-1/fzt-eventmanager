/**
 * Prüft den Zahlungsabgleich ohne Bank und ohne Datenbank.
 * Aufruf: npm run test:zahlungen
 *
 * Der wichtigste Test steht unten: Bei Unklarheit darf nichts automatisch
 * zugeordnet werden. Eine falsch als bezahlt markierte Rechnung merkt
 * niemand, ein liegengebliebener Zahlungseingang fällt sofort auf.
 */
import { entscheiden, namensNaehe, nummernAusText, vorschlaege } from "../src/lib/rechnung/abgleich";
import { fingerabdruck, ausCsv, ausMt940, ausCamt, ausDatei } from "../src/lib/rechnung/bankimport";
import { standRechnen, type Rechnung, type BankUmsatz } from "../src/lib/rechnung/db";

let fehler = 0;
function gleich(was: string, ist: unknown, soll: unknown) {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "ok  " : "FEHL"} ${was}${ok ? "" : `: ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
}

const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const vorTagen = (n: number) =>
  new Date(Date.parse(`${heute}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

function rechnung(o: Partial<Rechnung> & { nummer: string; betragCent: number }): Rechnung {
  const bezahltCent = o.bezahltCent ?? 0;
  return {
    id: o.id ?? o.nummer,
    nummer: o.nummer,
    quelle: "test",
    vorgangId: null,
    zuerstGeoeffnetAm: null,
    dankMailAm: null,
    kunde: o.kunde ?? "Musterfirma GmbH",
    kundeEmail: "",
    kundeIban: o.kundeIban ?? "",
    betragCent: o.betragCent,
    rechnungsdatum: o.rechnungsdatum ?? vorTagen(10),
    zahlungszielTage: 14,
    faelligAm: o.faelligAm ?? vorTagen(-4),
    leistung: "",
    status: o.status ?? "SENT",
    versendetAm: o.versendetAm ?? new Date().toISOString(),
    versendetAn: null,
    mailStatus: "gesendet",
    mailFehler: null,
    mailId: null,
    bezahltAm: null,
    storniertAm: null,
    notiz: "",
    erstelltAm: new Date().toISOString(),
    erstelltVon: "test",
    bezahltCent,
    offenCent: Math.max(0, o.betragCent - bezahltCent),
    ueberzahlungCent: bezahltCent > o.betragCent ? bezahltCent - o.betragCent : null,
    tageUeberfaellig: 0,
    zahlungen: [],
  };
}

function umsatz(o: Partial<BankUmsatz> & { betragCent: number }): BankUmsatz {
  return {
    id: o.id ?? "u1",
    fingerabdruck: "x",
    bankReferenz: null,
    buchungstag: o.buchungstag ?? heute,
    wertstellung: null,
    betragCent: o.betragCent,
    gegenname: o.gegenname ?? "",
    gegenIban: o.gegenIban ?? "",
    verwendungszweck: o.verwendungszweck ?? "",
    stand: "offen",
    ignoriertGrund: null,
    importiertAm: new Date().toISOString(),
    zuordnungen: [],
  };
}

/* Rechnungsnummern aus dem Verwendungszweck ------------------------------ */

gleich("Nummer im Text", nummernAusText("Rechnung RE-2026-10-01-01 Danke"), ["RE-2026-10-01-01"]);
gleich("Nummer ohne Bindestriche", nummernAusText("RE 2026 10 01 01"), ["RE-2026-10-01-01"]);
gleich("Vorgangsnummer", nummernAusText("Zahlung zu V-0926-012"), ["V-0926-012"]);
gleich("kein Treffer", nummernAusText("Danke fuer den schoenen Abend"), []);

/* Namen ------------------------------------------------------------------ */

gleich("Name identisch", namensNaehe("Musterfirma GmbH", "Musterfirma"), 1);
gleich("Name fremd", namensNaehe("Bäckerei Huber", "Autohaus Weber") < 0.5, true);

/* Die eigentliche Entscheidung ------------------------------------------- */

const r1 = rechnung({ nummer: "RE-2026-10-01-01", betragCent: 119000, kunde: "Gasthaus Adler GmbH" });
const r2 = rechnung({ nummer: "RE-2026-10-01-02", betragCent: 119000, kunde: "Autohaus Weber" });

const eindeutig = entscheiden(
  umsatz({ betragCent: 119000, verwendungszweck: "RE-2026-10-01-01", gegenname: "Gasthaus Adler GmbH" }),
  [r1, r2],
);
gleich("eindeutige Nummer wird zugeordnet", eindeutig.rechnung?.nummer, "RE-2026-10-01-01");

const teilzahlung = entscheiden(umsatz({ betragCent: 50000, verwendungszweck: "RE-2026-10-01-01" }), [r1]);
gleich("Teilzahlung wird zugeordnet", teilzahlung.rechnung?.nummer, "RE-2026-10-01-01");
gleich("Teilzahlung mit ihrem Betrag", teilzahlung.betragCent, 50000);

const zuViel = entscheiden(umsatz({ betragCent: 200000, verwendungszweck: "RE-2026-10-01-01" }), [r1]);
gleich("zu hoher Betrag bleibt liegen", zuViel.rechnung, null);

const zweiNummern = entscheiden(
  umsatz({ betragCent: 238000, verwendungszweck: "RE-2026-10-01-01 und RE-2026-10-01-02" }),
  [r1, r2],
);
gleich("zwei Nummern: nichts automatisch", zweiNummern.rechnung, null);

const nurBetrag = entscheiden(
  umsatz({ betragCent: 119000, gegenname: "Gasthaus Adler GmbH", verwendungszweck: "Rechnung" }),
  [r1, r2],
);
gleich("ohne Nummer: nichts automatisch", nurBetrag.rechnung, null);
gleich("ohne Nummer: aber ein Vorschlag", nurBetrag.vorschlaege[0]?.rechnung.nummer, "RE-2026-10-01-01");

const abbuchung = entscheiden(umsatz({ betragCent: -5000, verwendungszweck: "RE-2026-10-01-01" }), [r1]);
gleich("Abbuchung wird nie verrechnet", abbuchung.rechnung, null);
gleich("Abbuchung ohne Vorschläge", vorschlaege(umsatz({ betragCent: -5000 }), [r1]).length, 0);

const storniert = rechnung({ nummer: "RE-2026-10-01-03", betragCent: 5000, status: "CANCELLED" });
gleich(
  "stornierte Rechnung bleibt außen vor",
  entscheiden(umsatz({ betragCent: 5000, verwendungszweck: "RE-2026-10-01-03" }), [storniert]).rechnung,
  null,
);

/* Der Stand einer Rechnung ----------------------------------------------- */

const stand = (o: Parameters<typeof standRechnen>[0]) => standRechnen(o);
gleich(
  "voll bezahlt",
  stand({ status: "SENT", betragCent: 1000, bezahltCent: 1000, faelligAm: vorTagen(30), versendetAm: "x" }),
  "PAID",
);
gleich(
  "teilweise bezahlt schlägt überfällig",
  stand({ status: "SENT", betragCent: 1000, bezahltCent: 400, faelligAm: vorTagen(30), versendetAm: "x" }),
  "PARTIALLY_PAID",
);
gleich(
  "überfällig",
  stand({ status: "SENT", betragCent: 1000, bezahltCent: 0, faelligAm: vorTagen(1), versendetAm: "x" }),
  "OVERDUE",
);
gleich(
  "versendet, noch nicht fällig",
  stand({ status: "SENT", betragCent: 1000, bezahltCent: 0, faelligAm: vorTagen(-5), versendetAm: "x" }),
  "SENT",
);
gleich(
  "ohne Mail nur erstellt",
  stand({ status: "CREATED", betragCent: 1000, bezahltCent: 0, faelligAm: vorTagen(-5), versendetAm: null }),
  "CREATED",
);
gleich(
  "storniert bleibt storniert",
  stand({ status: "CANCELLED", betragCent: 1000, bezahltCent: 1000, faelligAm: vorTagen(-5), versendetAm: "x" }),
  "CANCELLED",
);

/* Kein Umsatz darf zweimal hereinkommen ---------------------------------- */

const roh = {
  buchungstag: "2026-09-20",
  betragCent: 119000,
  gegenname: "Gasthaus Adler GmbH",
  gegenIban: "DE02120300000000202051",
  verwendungszweck: "RE-2026-10-01-01",
  bankReferenz: "NONREF",
};
gleich("gleiche Buchung, gleicher Fingerabdruck", fingerabdruck(roh), fingerabdruck({ ...roh }));
gleich(
  "Leerzeichen ändern nichts",
  fingerabdruck(roh),
  fingerabdruck({ ...roh, verwendungszweck: "  RE-2026-10-01-01  " }),
);
gleich(
  "anderer Betrag, anderer Fingerabdruck",
  fingerabdruck(roh) === fingerabdruck({ ...roh, betragCent: 119001 }),
  false,
);

/* Die Dateiformate ------------------------------------------------------- */

const csv = [
  "Buchungstag;Wertstellung;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;Verwendungszweck;Betrag;Waehrung",
  '20.09.2026;20.09.2026;Gasthaus Adler GmbH;DE02120300000000202051;"RE-2026-10-01-01";1.190,00;EUR',
  "21.09.2026;21.09.2026;Stadtwerke;DE12500105170648489890;Abschlag;-89,50;EUR",
].join("\r\n");
const ausDerCsv = ausCsv(csv);
gleich("CSV: zwei Zeilen", ausDerCsv.length, 2);
gleich("CSV: Datum", ausDerCsv[0].buchungstag, "2026-09-20");
gleich("CSV: Betrag in Cent", ausDerCsv[0].betragCent, 119000);
gleich("CSV: Abbuchung negativ", ausDerCsv[1].betragCent, -8950);
gleich("CSV: Name", ausDerCsv[0].gegenname, "Gasthaus Adler GmbH");

const mt940 = [
  ":20:STARTUMS",
  ":25:65091040/1234567",
  ":28C:00001/001",
  ":60F:C260920EUR1000,00",
  ":61:2609200920C1190,00NTRFNONREF//POS 1",
  ":86:166?00UEBERWEISUNG?20RE-2026-10-01-01?32GASTHAUS ADLER GMBH?31DE02120300000000202051",
  ":62F:C260920EUR2190,00",
  "-",
].join("\r\n");
const ausDemMt = ausMt940(mt940);
gleich("MT940: eine Buchung", ausDemMt.length, 1);
gleich("MT940: Betrag", ausDemMt[0].betragCent, 119000);
gleich("MT940: Verwendungszweck", (ausDemMt[0].verwendungszweck ?? "").includes("RE-2026-10-01-01"), true);

const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">1190.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
<BookgDt><Dt>2026-09-20</Dt></BookgDt><ValDt><Dt>2026-09-20</Dt></ValDt>
<NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Gasthaus Adler GmbH</Nm></Dbtr>
<DbtrAcct><Id><IBAN>DE02120300000000202051</IBAN></Id></DbtrAcct></RltdPties>
<RmtInf><Ustrd>RE-2026-10-01-01</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>PDNG</Sts>
<BookgDt><Dt>2026-09-21</Dt></BookgDt></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
const ausDemCamt = ausCamt(camt);
gleich("CAMT: nur gebuchte Zeilen", ausDemCamt.length, 1);
gleich("CAMT: Betrag", ausDemCamt[0].betragCent, 119000);
gleich("CAMT: Name", ausDemCamt[0].gegenname, "Gasthaus Adler GmbH");
gleich("Format wird erkannt (CAMT)", ausDatei(camt).length, 1);
gleich("Format wird erkannt (CSV)", ausDatei(csv).length, 2);
gleich("Format wird erkannt (MT940)", ausDatei(mt940).length, 1);

console.log(fehler === 0 ? "\nAlles in Ordnung." : `\n${fehler} Fehler.`);
process.exit(fehler === 0 ? 0 : 1);
