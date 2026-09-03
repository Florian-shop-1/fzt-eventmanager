/**
 * Baut die beiden Musterangebote nach und vergleicht die Summen.
 * Aufruf: npx tsx scripts/test-angebot.ts
 *
 * Wenn dieses Skript durchläuft, rechnet das Programm genauso wie
 * die Angebote, die bisher von Hand in lexoffice entstanden sind.
 */

import { angebotssumme, erzeugePositionen, positionsSumme } from "@/lib/angebot/erstellen";
import { eur } from "@/lib/domain/pricing";
import type { Vorgang } from "@/lib/domain/vorgang";

let fehler = 0;

function vorgang(name: string, personen: number): Vorgang {
  const jetzt = new Date().toISOString();
  return {
    id: "v1",
    nummer: "V-0826-001",
    status: "angebot_erstellt",
    kunde: { id: "k1", name, email: "test@example.com" },
    vorstellung: { datum: "2026-11-13", show: "ULMfassbar by Florian Zimmer" },
    gruppen: [
      {
        id: "g1",
        name,
        personen,
        herkunft: "firma",
        sicherheit: "gebucht",
        menues: { classic: personen },
      },
    ],
    angebote: [],
    zahlungen: [],
    notizen: [],
    aufgaben: [],
    quelle: "Meta-Lead",
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  };
}

function pruefe(titel: string, ist: number, soll: number) {
  const passt = ist === soll;
  if (!passt) fehler++;
  console.log(`  ${passt ? "stimmt" : "ABWEICHUNG"}: ${titel}: ${eur(ist)} (erwartet ${eur(soll)})`);
}

// ── Muster AG-0826-1168: 20 Personen, Tickets Kat. 2 mit 15 Prozent Rabatt ──
console.log("\n=== Nachbau AG-0826-1168 (Fluoron GmbH, 20 Personen) ===");
{
  const positionen = erzeugePositionen(vorgang("Fluoron GmbH", 20), null, {
    ticket: "TK2",
    ticketRabatt: 15,
    getraenkepauschalen: [],
    mitEmpfang: false,
    mitUnterbelegung: false,
  });

  for (const p of positionen) {
    const marke = p.istAlternativeZu ? "  (Alternative)" : "";
    console.log(
      `  ${p.menge}x ${p.bezeichnung} zu ${eur(p.einzelBruttoCent)}` +
        (p.rabattProzent ? ` abzüglich ${p.rabattProzent}%` : "") +
        (p.istAlternativeZu ? "" : ` = ${eur(positionsSumme(p))}`) +
        marke,
    );
  }

  const summe = angebotssumme(positionen);
  pruefe("Menü", positionsSumme(positionen[0]), 138000);
  pruefe("Tickets nach Rabatt", positionsSumme(positionen[1]), 151300);
  pruefe("Gesamtbetrag", summe.bruttoCent, 289300);

  console.log("\n  Steuerausweis nach Positionen:");
  for (const e of summe.ustNachSatz) {
    console.log(`    ${(e.satz * 100).toFixed(0)}%: netto ${eur(e.nettoCent)}, USt ${eur(e.ustCent)}`);
  }
  const ustGesamt = summe.ustNachSatz.reduce((s, e) => s + e.ustCent, 0);
  console.log(`    Summe USt: ${eur(ustGesamt)}`);
  // Menüs und Showtickets werden beide mit 7 Prozent abgerechnet, damit muss
  // der Steuerausweis exakt dem Originalangebot entsprechen.
  pruefe("Umsatzsteuer wie im Original", ustGesamt, 18926);
  pruefe("Nettobetrag wie im Original", summe.nettoCent, 270374);
}

// ── Muster AG-0826-1167: 8 Personen, Tickets Kat. 2 ohne Rabatt ──
console.log("\n=== Nachbau AG-0826-1167 (MKG-Chirurgie, 8 Personen) ===");
{
  const positionen = erzeugePositionen(vorgang("MKG-Chirurgie am Brenzpark", 8), null, {
    ticket: "TK2",
    ticketRabatt: 0,
    getraenkepauschalen: [],
    mitEmpfang: false,
    mitUnterbelegung: false,
  });
  const summe = angebotssumme(positionen);
  pruefe("Menü", positionsSumme(positionen[0]), 55200);
  pruefe("Tickets", positionsSumme(positionen[1]), 71200);
  pruefe("Gesamtbetrag", summe.bruttoCent, 126400);
}

// ── Neuer Fall: Loge mit blockierten Plätzen ──
console.log("\n=== Neu: 8 Personen in einer Loge, 2 Plätze blockiert ===");
{
  const v = vorgang("Kleinbetrieb AG", 8);
  const plan = {
    logen: [
      {
        gruppeId: "g1",
        gruppeName: "Kleinbetrieb AG",
        sicherheit: "gebucht" as const,
        logenNummern: [1],
        personen: 8,
        plaetzeGesamt: 10,
        freiePlaetze: 2,
        notstuehle: 0,
        vorhaengeOeffnen: false,
      },
    ],
    galerie: [],
    nichtPlatziert: [],
    hinweise: [],
    kosten: 0,
    begruendung: [],
    differenzGesamtCent: 33600,
    sicherheit: { gebucht: 8, reserviert: 0 },
    auslastung: {
      logen: { belegt: 8, kapazitaet: 58 },
      eventgalerie: { belegt: 0, kapazitaet: 40 },
      foyer: { belegt: 0, kapazitaet: 40 },
    },
  };

  const positionen = erzeugePositionen(v, plan, {
    ticket: "TK2",
    ticketRabatt: 0,
    getraenkepauschalen: [],
    mitEmpfang: true,
    mitUnterbelegung: true,
  });

  for (const p of positionen.filter((x) => !x.istAlternativeZu)) {
    console.log(`  ${p.menge}x ${p.bezeichnung} = ${eur(positionsSumme(p))}`);
  }
  const summe = angebotssumme(positionen);
  console.log(`  Gesamtbetrag: ${eur(summe.bruttoCent)}`);

  const exkl = positionen.find((p) => p.artikelNummer === "EXKLLOGE");
  if (!exkl) {
    console.log("  ABWEICHUNG: Position für blockierte Logenplätze fehlt");
    fehler++;
  } else {
    pruefe("Exklusivnutzung Loge", positionsSumme(exkl), 33600);
  }

  const menue = positionen.find((p) => p.artikelNummer === "4GANGLOGE");
  if (!menue || menue.menge !== 8) {
    console.log("  ABWEICHUNG: Logengäste müssen das Logenmenü zu 79 € bekommen");
    fehler++;
  }
}

console.log("\n" + (fehler === 0 ? "Alle Prüfungen bestanden." : `${fehler} Abweichung(en).`));
process.exit(fehler === 0 ? 0 : 1);
