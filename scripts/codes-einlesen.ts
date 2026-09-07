/**
 * Liest eine Ditix-Codeliste in einen Vorrat ein.
 *
 * Aufruf:
 *   npm run codes:einlesen -- "C:\Pfad\Codes für VIP-Parkplatz.csv" "VIP-Parkplatz"
 *   npm run codes:einlesen -- liste.csv "Souvenirglas" --beschreibung "Ein Glas gratis" --gueltig-bis 31.12.2032
 *
 * Der Vorrat wird angelegt, falls es ihn noch nicht gibt. Ein zweiter
 * Durchlauf derselben Datei fügt nichts doppelt ein, sondern meldet nur,
 * wie viele Codes schon dalagen. Das ist Absicht: Ditix liefert bei jedem
 * Export wieder die ganze Liste, und beim Nachschieben neuer Codes soll
 * niemand vorher aussortieren müssen.
 *
 * Über die Weboberfläche geht dasselbe (Codes einfügen auf /codes). Für
 * mehrere tausend Codes ist der Weg über die Datei angenehmer, weil der
 * Browser an so einem Einfügefeld hängt.
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: [".env.local", ".env"], quiet: true });

interface Zeile {
  code: string;
  /** Was in der Spalte "Letzte Einlösung" stand. "-" heisst: noch frei. */
  einloesung: string;
}

/**
 * Zerlegt den Dateiinhalt.
 *
 * Ditix exportiert mit Semikolon und Anführungszeichen und stellt der
 * Datei ein unsichtbares Zeichen voran (BOM), das sonst am ersten Code
 * kleben bliebe. Andere Trennzeichen kommen vor, wenn jemand die Liste
 * zwischendurch durch Excel geschoben hat, deshalb wird an allem
 * getrennt, was kein Code sein kann.
 */
function zerlegen(inhalt: string): Zeile[] {
  const zeilen: Zeile[] = [];

  for (const roh of inhalt.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const felder = roh.split(/[;,\t]/).map((f) => f.trim().replace(/^"|"$/g, ""));
    const code = (felder[0] ?? "").toUpperCase();

    // Kopfzeile und alles, was kein Code sein kann.
    if (!/^[A-Z0-9_-]{4,}$/.test(code) || code === "CODE") continue;

    zeilen.push({ code, einloesung: (felder[1] ?? "-").trim() });
  }

  return zeilen;
}

async function main() {
  const argumente = process.argv.slice(2);
  const datei = argumente[0];
  const name = argumente[1];

  const wert = (flagge: string): string | null => {
    const i = argumente.indexOf(flagge);
    return i >= 0 && argumente[i + 1] ? argumente[i + 1] : null;
  };

  if (!datei || !name) {
    console.error('Aufruf: npm run codes:einlesen -- <datei.csv> "<Name des Vorrats>"');
    console.error("        [--beschreibung <text>] [--gueltig-bis <text>]");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL fehlt. Siehe README, Abschnitt Datenbank einrichten.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const gelesen = zerlegen(readFileSync(datei, "utf8"));

  /*
    Schon eingelöste Codes bleiben draussen. Sie stehen im Export mit
    Datum in der zweiten Spalte, und ein verschenkter Code, der beim
    Kunden nicht mehr funktioniert, ist ärgerlicher als ein Code zu wenig
    im Vorrat.
  */
  const eingeloest = gelesen.filter((z) => z.einloesung !== "-" && z.einloesung !== "");
  const frei = [...new Set(gelesen.filter((z) => !eingeloest.includes(z)).map((z) => z.code))];

  console.log(`Datei:   ${datei}`);
  console.log(`Gelesen: ${gelesen.length} Zeilen, davon ${eingeloest.length} schon eingelöst`);

  if (frei.length === 0) {
    console.log("Nichts einzufügen.");
    return;
  }

  // Vorrat suchen oder anlegen.
  const vorhanden = (await sql`select id from code_aktion where name = ${name}`) as Array<{
    id: string;
  }>;

  const aktionId =
    vorhanden[0]?.id ??
    (
      (await sql`
        insert into code_aktion (name, beschreibung, gueltig_bis)
        values (${name}, ${wert("--beschreibung")}, ${wert("--gueltig-bis")})
        returning id
      `) as Array<{ id: string }>
    )[0].id;

  console.log(`Vorrat:  ${name} (${vorhanden[0] ? "vorhanden" : "neu angelegt"})`);

  /*
    In Häppchen, nicht auf einen Schlag: Neon spricht über HTTP, und eine
    Anfrage mit mehreren tausend Werten läuft in die Größengrenze.
  */
  let neu = 0;
  const haeppchen = 500;

  for (let i = 0; i < frei.length; i += haeppchen) {
    const teil = frei.slice(i, i + haeppchen);
    const eingefuegt = (await sql`
      insert into aktionscode (aktion_id, code)
      select ${aktionId}::uuid, unnest(${teil}::text[])
      on conflict (aktion_id, code) do nothing
      returning id
    `) as unknown[];
    neu += eingefuegt.length;
  }

  console.log(`Eingefügt: ${neu} neu, ${frei.length - neu} lagen schon im Vorrat`);

  const stand = (await sql`
    select count(*)::int as gesamt,
           count(*) filter (where vergeben_am is null)::int as frei
      from aktionscode where aktion_id = ${aktionId}::uuid
  `) as Array<{ gesamt: number; frei: number }>;

  console.log(`Stand:   ${stand[0].gesamt} Codes im Vorrat, davon ${stand[0].frei} frei`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
