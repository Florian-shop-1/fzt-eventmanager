/**
 * Prüft den Anfragen-Eingang ohne echte Datenbank (PGlite, Postgres im Arbeitsspeicher).
 * Aufruf: npx tsx scripts/test-anfragen.ts
 * Die Anfragen unten sind ausgedacht, echte Kundendaten stehen hier nicht.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { anfrageAnnehmen, anfragenAusDatenbank, ausTabelleUebernehmen, deutschesDatum, firmaAus, TABELLE_DDL, type Abfrage } from "../src/lib/db/anfragen";
import { leadSchluessel, type Lead } from "../src/lib/shop/leads";

let fehler = 0;
function pruefe(bedingung: boolean, text: string, ist?: unknown) {
  if (bedingung) console.log(`  stimmt: ${text}`);
  else {
    console.log(`  FEHLER: ${text}${ist === undefined ? "" : ` (ist: ${JSON.stringify(ist)})`}`);
    fehler++;
  }
}

function alsAbfrage(pg: PGlite): Abfrage {
  return async (teile, ...werte) => {
    const sql = teile.reduce((q, t, i) => q + t + (i < werte.length ? `$${i + 1}` : ""), "");
    return (await pg.query(sql, werte as unknown[])).rows as unknown[];
  };
}

async function main() {
  const pg = new PGlite();
  const sql = alsAbfrage(pg);

  console.log("=== Migrationen einspielen ===");
  const ordner = join(process.cwd(), "migrations");
  for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(ordner, datei), "utf8"));
  }
  console.log("  alle eingespielt");

  console.log("\n=== Tabelle aus dem Code gleicht der Migration ===");
  const ausCode = new PGlite();
  for (const a of TABELLE_DDL) await ausCode.exec(a);
  for (const a of TABELLE_DDL) await ausCode.exec(a); // zweiter Lauf folgenlos
  const spalten = async (p: PGlite) =>
    (await p.query<{ c: string }>(`select column_name || ':' || data_type as c from information_schema.columns where table_name = 'anfrage' order by column_name`)).rows.map((r) => r.c).join(",");
  pruefe((await spalten(pg)) === (await spalten(ausCode)), "gleiche Spalten");

  console.log("\n=== Website-Anfrage annehmen ===");
  const jetzt = new Date("2026-10-20T15:30:00Z");
  const web = {
    typ: "Loge", name: "Erika Beispiel", email: "erika@example.org", telefon: "+49 151 1234567",
    teilnehmerzahl: "", wunschdatum: "", kommentar: "Gern im Dezember",
    quelle_source: "google", quelle_medium: "organic", quelle_campaign: "", quelle_content: "", quelle_term: "",
  };
  const a1 = await anfrageAnnehmen(web, jetzt, sql);
  pruefe(a1.neu, "neu angelegt");
  pruefe(a1.schluessel === leadSchluessel(deutschesDatum(jetzt), web.email, web.name), "Schlüssel wie aus der Tabelle", a1.schluessel);
  pruefe(deutschesDatum(jetzt) === "20.10.2026", "Eingangsdatum in Berliner Zeit");

  console.log("\n=== Dieselbe Meldung nochmal (Make wiederholt) ===");
  const a2 = await anfrageAnnehmen(web, jetzt, sql);
  pruefe(!a2.neu && a2.schluessel === a1.schluessel, "nicht doppelt angelegt");

  console.log("\n=== Zweite Anfrage derselben Person am selben Tag ===");
  const a3 = await anfrageAnnehmen({ ...web, kommentar: "Doch lieber Januar" }, jetzt, sql);
  pruefe(a3.neu && a3.schluessel === `${a1.schluessel}#2`, "eigener Schlüssel mit #2", a3.schluessel);

  console.log("\n=== Meta-Lead ===");
  const meta = await anfrageAnnehmen({ typ: "Event", name: "Max Muster", email: "max@example.org", teilnehmerzahl: "11-50", company_name: "Muster GmbH", quelle_source: "fb", quelle_medium: "paid" }, jetzt, sql);
  const [kanal] = (await sql`select kanal, teilnehmer from anfrage where schluessel = ${meta.schluessel}`) as Array<{ kanal: string; teilnehmer: string }>;
  pruefe(kanal?.kanal === "meta" && kanal.teilnehmer === "11-50", "als Meta erkannt, Teilnehmerzahl übernommen", kanal);

  console.log("\n=== Lesen wie bisher aus der Tabelle ===");
  const leads = await anfragenAusDatenbank(sql);
  pruefe(leads.length === 3, "drei Anfragen", leads.length);
  const erika = leads.find((l) => l.schluessel === a1.schluessel);
  pruefe(erika?.status === "Anfrage eingegangen" && erika?.anfragetyp === "Loge" && erika?.herkunft === "google", "Felder passen", erika);
  pruefe(erika?.firma === "", "ohne Firma bleibt das Feld leer", erika?.firma);
  const max = leads.find((l) => l.schluessel === meta.schluessel);
  pruefe(max?.firma === "Muster GmbH", "Firma aus dem Meta-Feld company_name", max?.firma);
  pruefe(firmaAus({ firma: "  Beispiel AG " }) === "Beispiel AG" && firmaAus({ firmenname: "X" }) === "X" && firmaAus(null) === "", "Firma auch unter anderen Feldnamen");

  console.log("\n=== Übernahme aus der Google-Tabelle ===");
  const alt: Lead = {
    schluessel: leadSchluessel("12.10.2026", "alt@example.org", "Alte Anfrage"), eingang: "12.10.2026", name: "Alte Anfrage", firma: "",
    telefon: "", email: "alt@example.org", teilnehmer: "51-200", wunschdatum: "", anfragetyp: "Event", status: "Angebot",
    ablehnungsgrund: "", kommentar: "", umsatz: "", herkunft: "ig · Eventanfragen",
  };
  pruefe((await ausTabelleUebernehmen([alt], sql)) === 1, "eine übernommen");
  pruefe((await ausTabelleUebernehmen([alt], sql)) === 0, "zweiter Lauf übernimmt nichts doppelt");
  const altGelesen = (await anfragenAusDatenbank(sql)).find((l) => l.schluessel === alt.schluessel);
  pruefe(altGelesen?.status === "Angebot" && altGelesen?.herkunft === "ig · Eventanfragen", "Status und Herkunft übernommen", altGelesen);

  console.log(fehler ? `\n${fehler} FEHLER` : "\nAlles stimmt.");
  process.exit(fehler ? 1 : 0);
}

main().catch((f) => {
  console.error(f);
  process.exit(1);
});
