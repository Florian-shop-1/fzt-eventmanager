import { NextResponse } from "next/server";
import { svErinnerungen } from "@/lib/personal/sv-erinnerung";
import { amazonEingerichtet } from "@/lib/amazon/api";
import { amazonLauf } from "@/lib/amazon/sync";
import { faelligeErinnerungen } from "@/lib/rechnung/erinnerung";

import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import { automatischZuordnen } from "@/lib/bewirtung/abgleich";
import { postAbholen } from "@/lib/bewirtung/posteingang";
import { postlaufMerken } from "@/lib/bewirtung/eingangsrechnung";
import { abbrecherLauf } from "@/lib/abbrecher/lauf";
import { taeglicherBewertungslauf } from "@/lib/bewertung/lauf";
import { taeglicheErinnerung } from "@/lib/dienstplan/laden";
import { taeglicherLauf } from "@/lib/mail/vorfreudelauf";
import { nachtlauf as scannerlauf } from "@/lib/scanner/ablauf";
import { taeglicheMenuepruefung } from "@/lib/shop/menuepruefung";
import { parkplatzMahnung } from "@/lib/shop/parkplatz-wache";
import { zauberstabLauf } from "@/lib/shop/zauberstab-lauf";
import { langeSchichtenPruefen, nachtabschluss, pausenPflichtPruefen } from "@/lib/stempel/wache";
import { taeglicherRechnungslauf } from "@/lib/wein/rechnung";

/**
 * Alle täglichen Läufe in zwei Aufrufen statt in acht.
 *
 * Der Grund ist nüchtern: Vercel erlaubt im Hobby-Tarif nur zwei
 * Cronjobs. In der vercel.json standen acht, und das hiess, dass sechs
 * davon schlicht nie liefen. Gemerkt hat es niemand, denn ein Lauf, der
 * nicht stattfindet, schreibt auch keinen Fehler: Das Protokoll des
 * Postfachlaufs stand seit dem ersten Tag auf leer (gefunden am
 * 30.09.2026 beim Durchsehen).
 *
 * Deshalb hier zwei Sammelläufe, die nacheinander abarbeiten, was
 * vorher einzeln geplant war:
 *
 *   nacht (1:30 Uhr)  Kartenscanner abschicken, Stempeluhr abschliessen
 *   morgen (6:15 Uhr) Kartenscanner abholen, Weinrechnung, Dienstplan,
 *                     Belege aus dem Postfach, Vorfreude- und
 *                     Bewertungsmails, Abbrecher, Zauberstab-Erinnerung
 *
 * Jeder Teil läuft für sich: Scheitert einer, laufen die übrigen
 * trotzdem. Was schiefging, steht in der Antwort und im Protokoll, statt
 * den ganzen Morgen mitzureissen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Teil = { name: string; tun: () => Promise<unknown> };

const NACHT: Teil[] = [
  /*
    Der Scanner macht beides in einem Durchgang: abholen, was fertig
    ist, und neu abschicken. Nachts laeuft er einmal, morgens noch
    einmal, damit die Ergebnisse der Nacht frueh da sind.
  */
  { name: "scanner", tun: () => scannerlauf() },
  /*
    Hängen die Parkplatzschilder für heute? Um 1:30 Uhr ist der Showtag
    schon angebrochen, und wer morgens um sechs die Meldung liest, kann
    noch reagieren, bevor der erste Gast auf den Hof fährt.
  */
  { name: "parkplaetze", tun: () => parkplatzMahnung() },
  {
    name: "stempeluhr",
    tun: async () => ({
      lange: await langeSchichtenPruefen(),
      pausen: await pausenPflichtPruefen(),
      abschluss: await nachtabschluss(),
    }),
  },
];

const MORGEN: Teil[] = [
  { name: "scanner", tun: () => scannerlauf() },
  { name: "wein", tun: () => taeglicherRechnungslauf() },
  { name: "dienstplan", tun: () => taeglicheErinnerung() },
  {
    name: "belege",
    tun: async () => {
      const lauf = await postAbholen({ tage: 7, wer: "Posteingang" });
      await postlaufMerken({
        gesehen: lauf.gesehen,
        neu: lauf.neu,
        ohneAnhang: lauf.ohneAnhang,
        fehlerAnzahl: lauf.fehler,
        letzterFehler: lauf.meldungen[0] ?? "",
      });
      const auto = await automatischZuordnen();
      return { ...lauf, zugeordnet: auto.zugeordnet };
    },
  },
  {
    name: "vorfreude",
    tun: async () => ({
      mails: await taeglicherLauf(),
      menues: await taeglicheMenuepruefung(),
    }),
  },
  /*
    Die freundliche Erinnerung an offene Rechnungen.

    Morgens, nachdem die Kontoumsaetze da sind: Wer gestern Abend bezahlt
    hat, bekommt heute frueh keine Mahnung mehr (Florian, 01.10.2026).
  */
  { name: "rechnungserinnerung", tun: () => faelligeErinnerungen() },
  // Nachhaken, wo die Sozialversicherungsnummer noch fehlt.
  { name: "sv_nummer", tun: () => svErinnerungen() },
  /*
    Die Amazon-Rechnungen.

    Laeuft morgens mit, nach den Belegen aus dem Postfach. Was Amazon noch
    kein PDF gegeben hat, bleibt stehen und wird morgen wieder versucht
    (Florian, 01.10.2026).
  */
  { name: "amazon", tun: () => (amazonEingerichtet().bereit ? amazonLauf() : Promise.resolve({ aus: true })) },
  {
    name: "bewertung",
    tun: async () => ({
      bewertungen: await taeglicherBewertungslauf(),
      abbrecher: await abbrecherLauf(),
      zauberstaebe: await zauberstabLauf(),
    }),
  },
];

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  const vonDerUhr = geheimnis && request.headers.get("authorization") === `Bearer ${geheimnis}`;

  // Von Hand darf ihn die Buchhaltung anstossen, etwa zum Ausprobieren.
  if (!vonDerUhr && !darfBuchhaltung(await angemeldeterBenutzer())) {
    return NextResponse.json({ ok: false, fehler: "nicht erlaubt" }, { status: 401 });
  }

  const welcher = new URL(request.url).searchParams.get("teil") === "nacht" ? "nacht" : "morgen";
  const teile = welcher === "nacht" ? NACHT : MORGEN;

  const ergebnis: Record<string, unknown> = {};
  const fehler: string[] = [];

  for (const t of teile) {
    try {
      ergebnis[t.name] = await t.tun();
    } catch (f) {
      const meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
      fehler.push(`${t.name}: ${meldung}`);
      console.error(`[nachtlauf] ${t.name}:`, meldung);
    }
  }

  console.log(`[nachtlauf] ${welcher}: ${teile.length - fehler.length} von ${teile.length} gelaufen`);
  return NextResponse.json({ ok: fehler.length === 0, teil: welcher, ergebnis, fehler });
}
