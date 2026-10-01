/**
 * Die Papierunterlagen in die Ablage legen.
 *
 * Florian, 01.10.2026: "bitte wenn man auf mitarbeiter klickt auch
 * möglich machen, dass man diese alten verträge angucken kann, die ich
 * dir gegeben hab." Also wandern die Dateien, die er geschickt hat, zur
 * jeweiligen Person, unverändert.
 *
 * Das Skript läuft beliebig oft: Gleicher Dateiname bei derselben Person
 * ersetzt die ältere Fassung.
 */

import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { db } from "@/lib/db/client";
import { unterlageAblegen } from "@/lib/db/unterlagen";

const ORDNER = join(process.env.USERPROFILE ?? "C:/Users/info", "Downloads");
const VON = "Nachtrag aus den Papierunterlagen";

const TYPEN: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const DATEIEN: Array<{ person: string; datei: string; art: "vertrag" | "bogen"; titel: string; notiz?: string }> = [
  { person: "Christian Schettler", datei: "SchettlerVertrag.pdf", art: "vertrag", titel: "Arbeitsvertrag 01.03.2026 bis 31.12.2026" },
  { person: "Evelyn Ermisch", datei: "Ermisch Arbeitsvertrag.pdf", art: "vertrag", titel: "Arbeitsvertrag 01.11.2025 bis 01.11.2026", notiz: "Enthält auf der letzten Seite auch den Personalbogen." },
  { person: "Levi Walter", datei: "Walter Levi Vertrag.docx", art: "vertrag", titel: "Arbeitsvertrag 14.05.2026 bis 13.05.2027" },
  { person: "Levi Walter", datei: "Walter Fragebogen.pdf", art: "bogen", titel: "Personalbogen" },
  { person: "Levi Walter", datei: "20260921 Fragebogen.pdf", art: "bogen", titel: "Personalbogen aus dem Eventmanager, 21.09.2026" },
  { person: "Leeven Drews", datei: "20260918-Arbeitsvertrag _Leeven Drews.docx", art: "vertrag", titel: "Arbeitsvertrag 18.09.2026 bis 04.07.2027" },
  { person: "Sabah Cekaj", datei: "Cekaj Sabah Vertrag.pdf", art: "vertrag", titel: "Arbeitsvertrag 15.12.2025 bis 15.06.2026", notiz: "Abgelaufen am 15.06.2026, deshalb nicht als geltender Vertrag hinterlegt." },
  { person: "Sabah Cekaj", datei: "Personalbogen_Sabah_Cekaj_Final.pdf", art: "bogen", titel: "Personalbogen" },
  { person: "Julian Scherer", datei: "Scherer.pdf", art: "bogen", titel: "Personalbogen", notiz: "Handschriftlich vermerkt: Techniker, Minijob, 13 Euro, 70-Tage-Vertrag." },
  { person: "Benjamin Shchudlo", datei: "Personalfragebogen .pdf", art: "bogen", titel: "Personalbogen" },
  { person: "Olena Danylovych", datei: "Danylovych Fragebogen.xlsx", art: "bogen", titel: "Personalbogen" },
];

async function main(): Promise<void> {
  for (const e of DATEIEN) {
    const pfad = join(ORDNER, e.datei);
    if (!existsSync(pfad)) {
      console.log(`${e.person}: Datei nicht gefunden, übersprungen: ${e.datei}`);
      continue;
    }
    const z = (await db()`
      select id, name from benutzer where aktiv and lower(name) = lower(${e.person})
    `) as Array<{ id: string; name: string }>;
    if (!z[0]) {
      console.log(`${e.person}: im Eventmanager nicht gefunden.`);
      continue;
    }

    const endung = (e.datei.split(".").pop() ?? "").toLowerCase();
    await unterlageAblegen({
      benutzerId: z[0].id,
      art: e.art,
      titel: e.titel,
      dateiname: basename(e.datei).trim(),
      typ: TYPEN[endung] ?? "application/octet-stream",
      inhalt: readFileSync(pfad),
      notiz: e.notiz ?? "",
      von: VON,
    });
    console.log(`${z[0].name}: ${e.titel} abgelegt (${e.datei}).`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
