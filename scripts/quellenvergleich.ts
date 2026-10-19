/**
 * Alte Quelle gegen FloTix, Vorstellung für Vorstellung.
 *
 * Aufruf: npx tsx scripts/quellenvergleich.ts
 *
 * Vor dem Umschalten muss nachgewiesen sein, dass FloTix dieselben Gäste,
 * Menüs und Tickets liefert wie die Google-Tabelle. Dieses Skript holt
 * beide Quellen in einem Durchgang und stellt sie nebeneinander.
 *
 * Verglichen wird nach Datum und Uhrzeit der Vorstellung, nicht nach
 * Kennung: Die Tabelle führt die Ditix-Kennung, FloTix seine eigene. Am
 * Abend im Haus zählt der Termin, nicht die Kennung.
 *
 * Solange FloTix im Testbetrieb läuft, stehen dort nur Testkäufe. Die
 * Zahlen weichen dann naturgemäß ab. Aussagekräftig wird der Vergleich
 * erst, wenn der Shop auf FloTix verkauft.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

interface Summe {
  bestellungen: number;
  tickets: number;
  menues: number;
}

function leer(): Summe {
  return { bestellungen: 0, tickets: 0, menues: 0 };
}

async function main() {
  const schluessel = (process.env.FLOTIX_KEY ?? "").trim();
  if (!schluessel) {
    console.error("FLOTIX_KEY fehlt in .env.local. Ohne Schlüssel antwortet FloTix nicht.");
    process.exit(1);
  }

  const { holeShopGruppenRoh } = await import("../src/lib/shop/rohdaten");
  const { showtageAbHeute } = await import("../src/lib/ditix/spielplan");
  const { flotixBestellungen } = await import("../src/lib/flotix/tuer");

  // Die alte Quelle: ohne QUELLE=flotix liest sie die Tabelle.
  delete process.env.QUELLE;
  const [tabelle, spielplan] = await Promise.all([
    holeShopGruppenRoh().catch((f: Error) => {
      console.error("Tabelle:", f.message);
      return [];
    }),
    showtageAbHeute(400).catch(() => []),
  ]);

  const terminVon = new Map(spielplan.map((t) => [t.ditixEventId, `${t.datum} ${t.uhrzeit}`]));

  const alt = new Map<string, Summe>();
  for (const g of tabelle) {
    const termin = terminVon.get(g.ditixEventId);
    if (!termin) continue; // Vergangene Shows stehen nicht mehr im Spielplan.
    const s = alt.get(termin) ?? leer();
    s.bestellungen += 1;
    s.tickets += g.tickets;
    s.menues += g.menuesGesamt;
    alt.set(termin, s);
  }

  // Die neue Quelle, unabhängig von der Weiche: direkt an der Tür.
  const neu = new Map<string, Summe>();
  for (const b of await flotixBestellungen()) {
    if (b.storniertAm) continue;
    const d = new Date(b.beginn);
    const termin =
      d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) +
      " " +
      d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

    const s = neu.get(termin) ?? leer();
    s.bestellungen += 1;
    for (const pos of b.positionen) {
      const menge = Number(pos.menge) || 0;
      if (/men(ü|ue)|gang|magic dinner/i.test(pos.bezeichnung)) s.menues += menge;
      else if (pos.mitPlatz || pos.art === "admission") s.tickets += menge;
    }
    neu.set(termin, s);
  }

  const termine = [...new Set([...alt.keys(), ...neu.keys()])].sort();
  console.log("Termin             | Bestellungen   | Tickets        | Menues");
  console.log("                   | Tab.  FloTix   | Tab.  FloTix   | Tab.  FloTix");
  console.log("-".repeat(72));

  let gleich = 0;
  for (const t of termine) {
    const a = alt.get(t) ?? leer();
    const n = neu.get(t) ?? leer();
    const passt =
      a.bestellungen === n.bestellungen && a.tickets === n.tickets && a.menues === n.menues;
    if (passt) gleich += 1;
    const z = (x: number) => String(x).padStart(4);
    console.log(
      `${t.padEnd(18)} | ${z(a.bestellungen)} ${z(n.bestellungen)}     | ` +
        `${z(a.tickets)} ${z(n.tickets)}     | ${z(a.menues)} ${z(n.menues)}` +
        (passt ? "" : "   <-- weicht ab"),
    );
  }

  console.log("-".repeat(72));
  console.log(`${gleich} von ${termine.length} Terminen stimmen überein.`);
}

void main();
