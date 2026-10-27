/**
 * Testkarten für die Gästewand anlegen und wieder wegräumen.
 *
 *   npm run test:postkarten        legt drei Testkarten an und zeigt den Stand
 *   npm run test:postkarten -- weg löscht sie wieder
 *
 * Damit lässt sich der ganze Weg prüfen, ohne eine echte Karte zu
 * scannen: Wie sieht das Armaturenbrett aus, was kommt an der
 * öffentlichen Tür heraus, was passiert mit einer gesperrten Karte.
 *
 * Jede Testkarte trägt denselben Vermerk in der Notiz, und nur daran
 * werden sie wieder gelöscht. Echte Karten rührt dieses Skript nicht an.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db/client";
import { stand, wand } from "../src/lib/postkarte/db";

const VERMERK = "TESTKARTE (Skript test-postkarten)";

/* Ein Platzhalterbild aus dem Shop: öffentlich erreichbar, damit die Wand etwas zu zeigen hat. */
const BILD = "https://florianzimmertheater.de/images/show-ballon.jpg";

const KARTEN = [
  {
    transkript:
      "Liebes Team,\n\nwir waren gestern zum ersten Mal da und sind heute noch sprachlos.\nMein Mann hat seit Jahren nicht mehr so gelacht, und als der Hubschrauber\nauf der Bühne stand, hat der ganze Saal die Luft angehalten.\nDas war die beste Show unseres Lebens.\n\nDanke!",
    zitat:
      "Mein Mann hat seit Jahren nicht mehr so gelacht, und als der Hubschrauber auf der Bühne stand, hat der ganze Saal die Luft angehalten.",
    zusammenfassung:
      "Erster Besuch, das Paar ist überwältigt und hebt besonders die große Illusion hervor.",
    stimmung: "begeistert",
    bewertung: 10,
    themen: ["emotional", "ulmfassbar", "aussergewoehnlich"],
    show: "ULMFASSBAR",
    frei: true,
  },
  {
    transkript:
      "Unsere Kinder (6 und 9) reden seit drei Tagen von nichts anderem.\nDie Kleine zaubert jetzt jeden Morgen am Frühstückstisch.\nSo einen Nachmittag hatten wir als Familie lange nicht.",
    zitat: "Die Kleine zaubert jetzt jeden Morgen am Frühstückstisch.",
    zusammenfassung: "Familie mit zwei Kindern, die Show wirkt zu Hause weiter.",
    stimmung: "begeistert",
    bewertung: 9,
    themen: ["familie", "kinder", "flo-zirkus"],
    show: "Flo-Zirkus",
    frei: true,
  },
  {
    transkript: "War schön. Danke.\nGrüße, Familie Mustermann, Musterweg 3, 89231 Neu-Ulm",
    zitat: "",
    zusammenfassung: "Kurze freundliche Rückmeldung, dazu eine vollständige Postanschrift.",
    stimmung: "positiv",
    bewertung: 3,
    themen: [],
    show: "",
    frei: false,
  },
];

async function anlegen() {
  for (const k of KARTEN) {
    await db()`
      insert into postkarte (
        status, transkript, zitat, zusammenfassung, stimmung, bewertung, themen,
        gelesen, datenschutz, personenbezug, einwilligung, show, gescannt_von, notiz,
        bild_oeffentlich, veroeffentlicht_am, fingerabdruck
      ) values (
        ${k.frei ? "freigegeben" : "gelesen"},
        ${k.transkript}, ${k.zitat}, ${k.zusammenfassung}, ${k.stimmung}, ${k.bewertung},
        ${k.themen},
        ${JSON.stringify({ begruendung: "Testkarte aus dem Skript.", hinweis: "" })}::jsonb,
        ${k.frei ? "frei" : "gesperrt"},
        ${JSON.stringify(
          k.frei
            ? []
            : [{ art: "adresse", text: "Musterweg 3, 89231 Neu-Ulm", x: 5, y: 70, b: 70, h: 14 }],
        )}::jsonb,
        ${k.frei ? "erteilt" : "unbekannt"},
        ${k.show}, 'Testskript', ${VERMERK},
        ${k.frei ? BILD : ""},
        ${k.frei ? new Date().toISOString() : null}::timestamptz,
        ${""}
      )
    `;
  }
  console.log(`${KARTEN.length} Testkarten angelegt.`);
}

async function weg() {
  const raus = (await db()`
    delete from postkarte where notiz = ${VERMERK} returning id
  `) as Array<{ id: string }>;
  console.log(`${raus.length} Testkarten gelöscht.`);
}

async function main() {
  const loeschen = process.argv.slice(2).includes("weg");
  if (loeschen) {
    await weg();
  } else {
    await anlegen();
  }

  const z = await stand();
  console.log("\nStand:");
  console.log(`  gescannt gesamt      ${z.gesamt}`);
  console.log(`  mit 9 oder 10        ${z.geeignet}`);
  console.log(`  auf der Wand         ${z.veroeffentlicht}`);
  console.log(`  wartet auf jemanden  ${z.gelesen}`);
  console.log(`  gesperrt             ${z.gesperrt}`);

  const w = await wand({ anzahl: 10 });
  console.log(`\nWas die öffentliche Tür herausgibt (${w.length}):`);
  for (const k of w) {
    console.log(`  ${k.bewertung}/10 ${k.highlight ? "[Highlight] " : ""}„${k.zitat.slice(0, 70)}“`);
  }
  if (w.some((k) => /Mustermann|Musterweg/i.test(k.transkriptKurz))) {
    console.error("\nFEHLER: Eine gesperrte Karte ist nach draußen gelangt.");
    process.exit(1);
  }
  console.log("\nKeine gesperrte Karte in der öffentlichen Ausgabe. Gut.");
}

main().catch((f) => {
  console.error(f);
  process.exit(1);
});
