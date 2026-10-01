/**
 * Papierbögen und Papierverträge in den Eventmanager übernehmen.
 *
 * Florian, 01.10.2026: "wenn kein fragebogen im eventmanager hinterlegt
 * ist, hinterlegst du die infos hieraus (bitte selber eitragen und
 * mitarbeiter dann auch nicht mehr fragen). wenn du keinen vertrag hast
 * im system, dann hinterlegst du dir, was ich dir hier gesendet hab.
 * ausser der vertrag ist bereits abgelaufen."
 *
 * Abgetippt aus den Bögen und Verträgen, die er geschickt hat. IBAN,
 * Steuer-ID und Versicherungsnummer sind gegen ihre Prüfziffern
 * beziehungsweise ihre Form geprüft; was nicht aufgeht, wird nicht
 * abgelegt, sondern als Hinweis vermerkt. Eine abgetippte Nummer, die
 * niemand nachgerechnet hat, ist schlimmer als gar keine.
 *
 * Das Skript läuft beliebig oft: Vorhandenes wird aufgefrischt, ein
 * zweiter Vertrag entsteht nicht.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { db } from "@/lib/db/client";
import { bogenSpeichern } from "@/lib/db/personalbogen";
import { papierVertragNachtragen, vertragVon } from "@/lib/db/arbeitsvertrag";
import { ibanGueltig, steuerIdGueltig, svFormOk, type Personalbogen } from "@/lib/personal/personalbogen";

const VON = "Nachtrag aus den Papierunterlagen";

interface Eintrag {
  person: string;
  quelle: string;
  bogen: Partial<Personalbogen>;
  /** Was auf dem Papier steht, aber nicht sicher zu lesen war. */
  unsicher?: string;
  vertrag?: {
    art: "kurzfristig" | "teilzeit";
    beginn: string;
    ende: string;
    stundenlohnCent: number;
    taetigkeit: string;
    quelle: string;
  };
  /** Vertrag liegt vor, ist aber abgelaufen: nur melden, nicht anlegen. */
  abgelaufen?: string;
}

const LEUTE: Eintrag[] = [
  {
    person: "Christian Schettler",
    quelle: "Papierbogen, Foto vom 01.10.2026",
    unsicher:
      "Steuer-ID auf dem Bogen zwölfstellig notiert (617325883091), Prüfziffer geht nicht auf. Nicht übernommen.",
    bogen: {
      nachname: "Schettler",
      geburtsname: "Harnisch",
      vorname: "Christian",
      strasse: "Ortstraße 11",
      plz: "89231",
      ort: "Neu-Ulm / Offenhausen",
      geburtsdatum: "1991-10-22",
      geburtsort: "Ehingen",
      familienstand: "ledig",
      staatsangehoerigkeit: "deutsch",
      schwerbehindert: "nein",
      email: "cschettler45@gmail.com",
      svNummer: "63221091S010",
      iban: "DE75110101015373622894",
      bic: "SOBKDEB2XXX",
      eintrittsdatum: "2026-03-01",
      berufsbezeichnung: "Spülkraft",
      beschaeftigung: "Kurzfristige Aushilfe",
      schulabschluss: "Mittlere Reife oder gleichwertig",
      ausbildung: "ohne beruflichen Ausbildungsabschluss",
      steuerklasse: "VI",
      konfession: "römisch-katholisch",
      krankenversicherung: "gesetzlich",
      krankenkasse: "AOK Ulm",
      rentenbefreiung: "ja",
    },
    vertrag: {
      art: "kurzfristig",
      beginn: "2026-03-01",
      ende: "2026-12-31",
      stundenlohnCent: 1400,
      taetigkeit: "Mitarbeiter",
      quelle: "SchettlerVertrag.pdf, auf Papier unterschrieben",
    },
  },
  {
    person: "Mario Fröchtenicht",
    quelle: "Papierbogen, Foto vom 01.10.2026",
    bogen: {
      nachname: "Fröchtenicht",
      vorname: "Mario",
      strasse: "Südweg 12",
      plz: "89233",
      ort: "Neu-Ulm / Hausen",
      geburtsdatum: "1975-05-15",
      geburtsort: "Ulm",
      familienstand: "verheiratet",
      staatsangehoerigkeit: "deutsch",
      schwerbehindert: "nein",
      email: "mariofroechtenicht@web.de",
      svNummer: "21150575F005",
      iban: "DE56650910400717365000",
      bic: "GENODES1LEU",
      schulabschluss: "Haupt-/Volksschulabschluss",
      ausbildung: "anerkannte Berufsausbildung",
      berufsbezeichnung: "Bauzeichner",
      steuerId: "42965833076",
      konfession: "keine",
      krankenversicherung: "privat",
      krankenkasse: "Württembergische",
    },
  },
  {
    person: "Evelyn Ermisch",
    quelle: "Papierbogen, Foto vom 01.10.2026",
    bogen: {
      nachname: "Ermisch",
      vorname: "Evelyn",
      strasse: "Karlsbader Straße 16",
      plz: "89231",
      ort: "Neu-Ulm",
      geburtsdatum: "2008-08-08",
      geburtsort: "Ulm",
      familienstand: "ledig",
      staatsangehoerigkeit: "deutsch",
      schwerbehindert: "nein",
      email: "ermisch.j@yahoo.com",
      iban: "DE06730500000441232550",
      bic: "BYLADEM1NUL",
      eintrittsdatum: "2025-11-01",
      beschaeftigung: "Kurzfristige Aushilfe",
      schulabschluss: "Mittlere Reife oder gleichwertig",
      ausbildung: "ohne beruflichen Ausbildungsabschluss",
      konfession: "evangelisch",
      krankenversicherung: "gesetzlich",
      krankenkasse: "AOK",
    },
    vertrag: {
      art: "kurzfristig",
      beginn: "2025-11-01",
      ende: "2026-11-01",
      stundenlohnCent: 1300,
      taetigkeit: "Mitarbeiterin",
      quelle: "Ermisch Arbeitsvertrag.pdf, auf Papier unterschrieben",
    },
  },
  {
    person: "Julian Scherer",
    quelle: "Papierbogen, Scan Scherer.pdf",
    bogen: {
      nachname: "Scherer",
      geburtsname: "Schlicker",
      vorname: "Julian",
      strasse: "Georg-Pressmar-Straße 7",
      plz: "73312",
      ort: "Geislingen",
      geburtsdatum: "2007-09-27",
      geburtsort: "Laichingen",
      familienstand: "ledig",
      staatsangehoerigkeit: "deutsch",
      schwerbehindert: "nein",
      email: "julianscherer214@gmail.com",
      svNummer: "23270907S119",
      iban: "DE29610605000603432000",
      bic: "GENODES1VGP",
      eintrittsdatum: "2025-10-05",
      berufsbezeichnung: "Techniker",
      beschaeftigung: "Minijob",
      schulabschluss: "Mittlere Reife oder gleichwertig",
      ausbildung: "ohne beruflichen Ausbildungsabschluss",
      statusMinijob: "Auszubildende/r",
      steuerId: "47856329157",
      konfession: "evangelisch",
      krankenversicherung: "gesetzlich",
      krankenkasse: "WMF BKK",
      rentenbefreiung: "ja",
    },
  },
  {
    person: "Levi Walter",
    quelle: "Papierbogen und eigener Bogen vom 21.09.2026",
    bogen: {
      nachname: "Walter",
      geburtsname: "Walter",
      vorname: "Levi",
      strasse: "Lichtensteinstraße 7",
      plz: "89160",
      ort: "Dornstadt",
      geburtsdatum: "2010-10-02",
      geburtsort: "Ulm",
      familienstand: "ledig",
      staatsangehoerigkeit: "deutsch",
      schwerbehindert: "nein",
      email: "walterlevi709@gmail.com",
      svNummer: "63021010W014",
      iban: "DE27630500001011545553",
      bic: "SOLADES1ULM",
      kontoinhaber: "Levi Walter",
      eintrittsdatum: "2026-05-14",
      berufsbezeichnung: "Licht- und Tontechniker",
      beschaeftigung: "Minijob",
      schulabschluss: "ohne Schulabschluss",
      ausbildung: "ohne beruflichen Ausbildungsabschluss",
      statusMinijob: "Schüler/in",
      rentenbefreiung: "ja",
      steuerId: "76081359822",
      steuerklasse: "weiß ich nicht",
      konfession: "keine",
      krankenversicherung: "gesetzlich",
      krankenkasse: "securvita",
    },
    vertrag: {
      art: "kurzfristig",
      beginn: "2026-05-14",
      ende: "2027-05-13",
      stundenlohnCent: 1400,
      taetigkeit: "Show-Assistent",
      quelle: "Walter Levi Vertrag.docx, auf Papier unterschrieben",
    },
  },
  {
    person: "Leeven Drews",
    quelle: "Vertrag vom 18.09.2026, kein Bogen vorhanden",
    bogen: {},
    vertrag: {
      art: "kurzfristig",
      beginn: "2026-09-18",
      ende: "2027-07-04",
      stundenlohnCent: 1500,
      taetigkeit: "Licht- und Tontechniker",
      quelle: "20260918-Arbeitsvertrag Leeven Drews.docx, auf Papier unterschrieben",
    },
  },
  {
    person: "Sabah Cekaj",
    quelle: "Personalbogen_Sabah_Cekaj_Final.pdf",
    abgelaufen: "Vertrag vom 15.12.2025 lief am 15.06.2026 aus. Nicht übernommen, es braucht einen neuen.",
    bogen: {
      nachname: "Cekaj",
      geburtsname: "Cekaj",
      vorname: "Sabah",
      strasse: "Am Funken 14",
      plz: "89269",
      ort: "Vöhringen",
      geburtsdatum: "1994-04-16",
      geburtsort: "Kullaj, Shkodër",
      familienstand: "verheiratet",
      staatsangehoerigkeit: "albanisch",
      schwerbehindert: "nein",
      email: "cekajsabah7@gmail.com",
      svNummer: "M269555921",
      iban: "DE56730611910000591866",
      bic: "GENODEF1NU1",
      eintrittsdatum: "2025-12-01",
      berufsbezeichnung: "Lagerist",
      beschaeftigung: "Kurzfristige Aushilfe",
      schulabschluss: "Abitur/Fachabitur",
      ausbildung: "ohne beruflichen Ausbildungsabschluss",
      steuerId: "33418065729",
      steuerklasse: "III",
      konfession: "keine",
      krankenversicherung: "gesetzlich",
      krankenkasse: "AOK Baden-Württemberg",
      rentenbefreiung: "ja",
    },
  },
  {
    person: "Benjamin Shchudlo",
    quelle: "Personalfragebogen.pdf",
    bogen: {
      nachname: "Shchudlo",
      vorname: "Benjamin",
      strasse: "Syrlinstraße 8",
      plz: "89233",
      ort: "Neu-Ulm",
      geburtsdatum: "1993-11-20",
      geburtsort: "Toronto",
      familienstand: "ledig",
      staatsangehoerigkeit: "kanadisch",
      email: "benshchudlo@gmail.com",
      iban: "DE08100110012378878304",
      bic: "NTSBDEB1XXX",
      eintrittsdatum: "2026-01-31",
      berufsbezeichnung: "Backstage-Hilfe",
      schulabschluss: "Abschluss unbekannt",
      ausbildung: "Abschluss unbekannt",
      steuerId: "32075541569",
      steuerklasse: "I",
      konfession: "keine",
      krankenversicherung: "privat",
      krankenkasse: "Care Concept",
      rentenbefreiung: "ja",
    },
  },
  {
    person: "Olena Danylovych",
    quelle: "Danylovych Fragebogen.xlsx",
    bogen: {
      nachname: "Danylovych",
      geburtsname: "Jewtuschenko",
      vorname: "Olena",
      strasse: "Illertisser Straße 70",
      plz: "89281",
      ort: "Altenstadt",
      geburtsdatum: "1977-09-23",
      geburtsort: "Jalta, Krim, Ukraine",
      familienstand: "geschieden",
      staatsangehoerigkeit: "ukrainisch",
      email: "elenadanylovych77@gmail.com",
      svNummer: "63230977J500",
      iban: "DE13630500001011597312",
      statusMinijob: "Arbeitslos gemeldet",
      steuerId: "71690335438",
      konfession: "keine",
      krankenversicherung: "gesetzlich",
      krankenkasse: "BARMER",
      rentenbefreiung: "ja",
    },
  },
];

async function personSuchen(name: string): Promise<{ id: string; name: string } | null> {
  const z = (await db()`
    select id, name from benutzer where aktiv and lower(name) = lower(${name})
  `) as Array<{ id: string; name: string }>;
  return z[0] ?? null;
}

async function main(): Promise<void> {
  const meldungen: string[] = [];

  for (const e of LEUTE) {
    const person = await personSuchen(e.person);
    if (!person) {
      meldungen.push(`${e.person}: im Eventmanager nicht gefunden, nichts übernommen.`);
      continue;
    }

    // Was die Prüfziffern nicht hergeben, wird nicht abgelegt.
    const daten: Partial<Personalbogen> = { ...e.bogen };
    const warnungen: string[] = [];
    if (daten.iban && !ibanGueltig(daten.iban)) {
      warnungen.push(`IBAN ${daten.iban} nicht plausibel`);
      delete daten.iban;
    }
    if (daten.steuerId && !steuerIdGueltig(daten.steuerId)) {
      warnungen.push(`Steuer-ID ${daten.steuerId} nicht plausibel`);
      delete daten.steuerId;
    }
    if (daten.svNummer && !svFormOk(daten.svNummer)) {
      warnungen.push(`Versicherungsnummer ${daten.svNummer} hat eine ungewöhnliche Form`);
    }

    if (Object.keys(daten).length > 0) {
      const quelle = [e.quelle, e.unsicher, ...warnungen].filter(Boolean).join(" | ");
      await bogenSpeichern({ benutzerId: person.id, daten, quelle, von: VON });
      await db()`
        update benutzer set personalbogen_am = coalesce(personalbogen_am, now()) where id = ${person.id}
      `;
      meldungen.push(`${person.name}: Bogen abgelegt${warnungen.length ? ` (${warnungen.join("; ")})` : ""}.`);
    }

    if (e.abgelaufen) meldungen.push(`${person.name}: ${e.abgelaufen}`);

    if (e.vertrag) {
      const vorhanden = await vertragVon(person.id);
      if (vorhanden) {
        meldungen.push(`${person.name}: hat schon einen Vertrag im System, Papiervertrag nicht angelegt.`);
      } else {
        const name = [e.bogen.vorname, e.bogen.nachname].filter(Boolean).join(" ") || person.name;
        const anschrift = [e.bogen.strasse, [e.bogen.plz, e.bogen.ort].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ");
        await papierVertragNachtragen({
          benutzerId: person.id,
          art: e.vertrag.art,
          taetigkeit: e.vertrag.taetigkeit,
          aufgaben: "",
          position: e.vertrag.taetigkeit,
          beginn: e.vertrag.beginn,
          ende: e.vertrag.ende,
          stundenlohnCent: e.vertrag.stundenlohnCent,
          personalien: {
            name,
            anschrift,
            geburtsdatum: e.bogen.geburtsdatum ? e.bogen.geburtsdatum.split("-").reverse().join(".") : "",
          },
          angelegtVon: VON,
          quelle: e.vertrag.quelle,
        });
        meldungen.push(
          `${person.name}: Papiervertrag nachgetragen, ${e.vertrag.beginn} bis ${e.vertrag.ende}, ${(
            e.vertrag.stundenlohnCent / 100
          ).toFixed(2)} Euro je Stunde.`,
        );
      }
    }
  }

  for (const m of meldungen) console.log(m);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
