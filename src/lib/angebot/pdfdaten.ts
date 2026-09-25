/**
 * Woher das Angebots-PDF seine Daten nimmt.
 *
 * Zwei Dinge holt es sich nicht aus dem Angebot selbst:
 *
 *  - Den Absender mit allen Pflichtangaben. Der steht in der Einstellung,
 *    nicht im Code: Steuernummer, USt-IdNr. und Bankverbindung gehören
 *    nicht ins Repository (Florian, 22.09.2026).
 *  - Den Ablauf des Abends. Der steht seit jeher als Text in der
 *    Einleitung, mit Uhrzeiten in eigenen Zeilen. Hier wird er wieder in
 *    Daten zerlegt, damit das PDF ihn als Zeitachse setzen kann, ohne
 *    dass alte Angebote anders aussehen als neue.
 */

import { db } from "@/lib/db/client";
import type { AngebotDetail } from "./lesen";
import {
  angebotssumme,
  erzeugePositionen,
  FINGERFOOD_ANGEBOTSOPTIONEN,
  SCHLUSSTEXT,
  type Verpflegung,
} from "./erstellen";
import type { Vorgang } from "@/lib/domain/vorgang";
import type { Ablaufpunkt, AngebotsPdfDaten, Absender } from "./pdf";

/** Fällt die Einstellung aus, steht wenigstens das Nötigste im PDF. */
const NOTNAGEL: Absender = {
  firma: "Florian Zimmer Theater GmbH",
  strasse: "Grethe-Weiser-Str. 2/1",
  plz: "89231",
  ort: "Neu-Ulm",
  telefon: "0731 7906 110",
  email: "tickets@florianzimmer.com",
  web: "www.florianzimmer.com",
  geschaeftsfuehrer: "Florian Zimmer",
};

export async function angebotsAbsender(): Promise<Absender> {
  /*
    Faellt die Abfrage aus, steht trotzdem ein Angebot. Ein PDF ohne
    Bankverbindung ist aergerlich, gar kein PDF ist schlimmer.
  */
  const z = (await db()`select absender from wein_einstellung where id = 1`.catch(
    () => [] as Array<{ absender: Absender | null }>,
  )) as Array<{ absender: Absender | null }>;
  const a = z[0]?.absender;
  if (!a) return NOTNAGEL;
  return { ...NOTNAGEL, ...a, sitz: a.sitz ?? "Hüttisheim" };
}

/**
 * Den Ablauf aus der Einleitung herauslesen.
 *
 * Erkannt wird jede Zeile, die nur aus einer Uhrzeit besteht, mit oder
 * ohne "UHR" dahinter. Was danach bis zur nächsten Uhrzeit steht, gehört
 * dazu. Findet sich keine, bleibt der Ablauf leer und die Einleitung
 * steht unverändert im PDF.
 */
export function ablaufAusText(einleitung: string): { einleitung: string; ablauf: Ablaufpunkt[] } {
  const zeilen = einleitung.split(/\r?\n/);
  const istZeit = (z: string) => /^\s*(\d{1,2}[:.]\d{2})\s*(uhr)?\s*$/i.test(z);

  const ersteZeit = zeilen.findIndex(istZeit);
  if (ersteZeit < 0) return { einleitung: einleitung.trim(), ablauf: [] };

  const ablauf: Ablaufpunkt[] = [];
  let zeit: string | null = null;
  let text: string[] = [];

  const ablegen = () => {
    if (zeit && text.join(" ").trim()) ablauf.push({ zeit, text: text.join(" ").trim() });
    text = [];
  };

  for (const zeile of zeilen.slice(ersteZeit)) {
    if (istZeit(zeile)) {
      ablegen();
      zeit = /(\d{1,2}[:.]\d{2})/.exec(zeile)![1].replace(".", ":");
    } else {
      text.push(zeile.trim());
    }
  }
  ablegen();

  return { einleitung: zeilen.slice(0, ersteZeit).join("\n").trim(), ablauf };
}

/**
 * Die Überschrift des Angebots, wie sie oben rechts steht.
 *
 * In Lexware stand dort von Hand "Abendessen+Show". So heißt es bei uns
 * nicht: Auf der Firmenseite steht Fine Dining, und was auf den Tisch
 * kommt, ist das Magic Menü by Osman Kavak. Wer spart, nimmt Fingerfood.
 * Alles drei lässt sich an den Positionen ablesen, niemand muss es
 * eintippen (Florian, 25.09.2026).
 */
export function angebotsTitel(artikelnummern: string[]): string {
  const hat = (n: string) => artikelnummern.some((a) => a.toUpperCase().includes(n));
  const teile = [hat("FINGERFOOD") ? "Fingerfood" : "Fine Dining", "Show"];
  if (hat("AFTERSHOW") || hat("PARTY") || hat("DJ")) teile.push("Party");
  return teile.join(" + ");
}

/**
 * Aus einem gelesenen Angebot die Daten fuers PDF machen.
 *
 * Steht hier und nicht in der Route, weil auch der Mailversand das PDF
 * braucht: Das Angebot geht als Anhang hinaus, nicht nur als Link
 * (Florian, 25.09.2026).
 */
export async function pdfDatenAusAngebot(a: AngebotDetail): Promise<AngebotsPdfDaten> {
  const basis = process.env.EVENTMANAGER_URL ?? "https://eventmanager.florianzimmertheater.de";
  const zerlegt = ablaufAusText(a.einleitung);
  return {
    nummer: a.nummer,
    titel: angebotsTitel(a.positionen.map((p) => p.artikelNummer)),
    erstelltAm: a.erstelltAm,
    gueltigBis: a.gueltigBis,
    einleitung: zerlegt.einleitung,
    ablauf: zerlegt.ablauf,
    schlusstext: a.schlusstext,
    positionen: a.positionen,
    kunde: a.kunde,
    vorstellung: a.vorstellung,
    link: `${basis}/ihr-angebot/${a.trackingToken}`,
    // Ohne Menü keine Menübilder.
    mitMenuebildern: !a.positionen.some((p) => p.artikelNummer === "FINGERFOOD"),
    absender: await angebotsAbsender(),
  };
}

/** Der Dateiname, unter dem der Kunde das Angebot bekommt. */
export function pdfDateiname(nummer: string): string {
  return `Angebot-${nummer}-Florian-Zimmer-Theater.pdf`;
}


/**
 * Die sparsame Fassung als Muster: 30 Gäste, Fingerfood, Kat. 3, Umtrunk.
 *
 * Die Positionen kommen aus der echten Rechnung, nicht aus einer Liste
 * von Hand. So zeigt das Muster wirklich, was der Kunde bekäme.
 */
async function probeFingerfood(): Promise<AngebotsPdfDaten> {
  const heute = new Date();
  const in7 = new Date(heute.getTime() + 7 * 86400_000);
  const personen = 30;
  const jetzt = heute.toISOString();

  const vorgang = {
    id: "muster",
    kunde: { id: "k", name: "Beispiel GmbH", email: "", ansprechpartner: null },
    vorstellung: { id: "v", datum: "2027-02-20", show: "ULMfassbar by Florian Zimmer", beginn: "20:00" },
    gruppen: [
      {
        id: "g1",
        name: "Beispiel GmbH",
        personen,
        sicherheit: "gebucht",
        menues: { classic: personen },
        bereichFixiert: "eventgalerie",
      },
    ],
    angebote: [],
    zahlungen: [],
    notizen: [],
    aufgaben: [],
    quelle: "Muster",
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  } as unknown as Vorgang;

  const positionen = erzeugePositionen(vorgang, null, FINGERFOOD_ANGEBOTSOPTIONEN);
  const summe = angebotssumme(positionen);
  const proGast = Math.round(summe.bruttoCent / personen) / 100;

  const einleitung = [
    `Ihr wollt einen Abend, der hängen bleibt, und dabei auf euer Budget achten. Das geht: ` +
      `Diese Fassung kommt auf ${proGast.toLocaleString("de-DE", { minimumFractionDigits: 2 })} Euro ` +
      "pro Gast, mit Umtrunk, Fingerfood aus unserer Küche und der ganzen Show.",
    "",
    "17:20 UHR",
    "Empfang auf unserer Eventgalerie mit einem Glas Magicuvée",
    "",
    "17:50 UHR",
    "Fingerfood by Osman Kavak auf unserer Eventgalerie. Herzhafte und süße Kleinigkeiten " +
      "auf Etageren zum Teilen, in Ruhe und im Stehen, so wie ihr mögt.",
    "",
    "20:00 UHR",
    'Das Highlight des Abends, die Magieshow "ULMfassbar by Florian Zimmer", live, hautnah und ' +
      "mit bestem Blick zur Bühne.",
    "",
    "22:30 UHR",
    "Ausklang an der Foyerbar",
  ].join("\n");

  const zerlegt = ablaufAusText(einleitung);

  return {
    nummer: "AG-0926-0002",
    titel: angebotsTitel(positionen.map((p) => p.artikelNummer)),
    erstelltAm: jetzt,
    gueltigBis: in7.toISOString().slice(0, 10),
    kundennummer: "10002",
    einleitung: zerlegt.einleitung,
    ablauf: zerlegt.ablauf,
    schlusstext: SCHLUSSTEXT,
    kunde: {
      name: "Beispiel GmbH",
      ansprechpartner: "z.Hd. Herrn Björn Kirsten",
      strasse: "Industriestraße 12",
      plz: "89231",
      ort: "Neu-Ulm",
    },
    vorstellung: { datum: "2027-02-20", show: "ULMfassbar by Florian Zimmer" },
    personen,
    link: "https://eventmanager.florianzimmertheater.de/ihr-angebot/muster",
    mitMenuebildern: false,
    absender: await angebotsAbsender(),
    positionen,
  };
}

/**
 * Ein Musterangebot zum Anschauen des Layouts, ohne echten Vorgang.
 *
 * Beide Fassungen: das Magic Menü und die sparsame Variante mit
 * Fingerfood, die auf 110 Euro pro Gast kommt.
 */
export async function probeAngebot(
  verpflegung: Verpflegung = "finedining",
): Promise<AngebotsPdfDaten> {
  if (verpflegung === "fingerfood") return probeFingerfood();

  const heute = new Date();
  const in7 = new Date(heute.getTime() + 7 * 86400_000);
  const einleitung = [
    "Euer Event bei uns, ein Erlebnis für alle Sinne.",
    "",
    "17:20 UHR",
    "Magicuvée-Empfang auf unserer Eventgalerie",
    "",
    "17:50 UHR",
    "4-Gang-Menü (Classic, Sea oder Veggy, gerne angepasst an besondere Wünsche) auf unserer " +
      "Eventgalerie, oder soweit verfügbar geselliges Beisammensein in eurer stilvollen Loge im Showroom.",
    "",
    "20:00 UHR",
    'Das Highlight des Abends, die Magieshow "ULMfassbar by Florian Zimmer", live, hautnah und mit ' +
      "bestem Blick zur Bühne auf den VIP-Plätzen der Empore.",
    "",
    "22:30 UHR",
    "Ausklang an der Foyerbar",
  ].join("\n");

  const zerlegt = ablaufAusText(einleitung);

  return {
    nummer: "AG-0926-0001",
    titel: "Abendessen + Show + Party",
    erstelltAm: heute.toISOString(),
    gueltigBis: in7.toISOString().slice(0, 10),
    kundennummer: "10001",
    einleitung: zerlegt.einleitung,
    ablauf: zerlegt.ablauf,
    schlusstext: SCHLUSSTEXT,
    kunde: {
      name: "Mustermann Maschinenbau GmbH",
      ansprechpartner: "z.Hd. Frau Elena Kalani",
      strasse: "Karlstraße 3",
      plz: "89073",
      ort: "Ulm",
    },
    vorstellung: { datum: "2027-01-15", show: "ULMfassbar by Florian Zimmer" },
    personen: 130,
    link: "https://eventmanager.florianzimmertheater.de/ihr-angebot/muster",
    absender: await angebotsAbsender(),
    positionen: [
      {
        id: "p1",
        artikelNummer: "4GANG",
        bezeichnung: "Magic Menü by Osman Kavak (Classic, Sea oder Veggy)",
        beschreibung:
          "Vier Gänge Fine Dining inklusive Welcome-Drink, serviert an eurem Tisch.",
        menge: 130,
        einheit: "Stück",
        einzelBruttoCent: 6900,
        ust: 0.07,
      },
      {
        id: "p2",
        artikelNummer: "TK2",
        bezeichnung: "Ticket Kat. 2",
        beschreibung: "Tickets in Reihe sechs bis acht nach Verfügbarkeit",
        menge: 130,
        einheit: "Stück",
        einzelBruttoCent: 8900,
        ust: 0.07,
        rabattProzent: 30,
      },
      {
        id: "p3",
        artikelNummer: "AFTERSHOW",
        bezeichnung: "Aftershow Party",
        beschreibung: "Exklusive Aftershow auf unserer modernen Eventgalerie mit DJ",
        menge: 1,
        einheit: "Stück",
        einzelBruttoCent: 100000,
        ust: 0.19,
      },
      {
        id: "p4",
        artikelNummer: "FLATSOFT",
        bezeichnung: "Softdrink-Flat (bis einschließlich Pause)",
        beschreibung: "Ensinger Gourmet Wasser, Burkhardt Fruchtsäfte und Softdrinks by Coca-Cola",
        menge: 130,
        einheit: "Stück",
        einzelBruttoCent: 1900,
        ust: 0.19,
        istAlternativeZu: "p1",
      },
      {
        id: "p5",
        artikelNummer: "FLATALL",
        bezeichnung: "ALL-INKLUSIVE-FLAT",
        beschreibung:
          "ALLE Getränke bis nach der Show inklusive (außer Champagner und Kaffeespezialitäten). " +
          "Nur diese Getränkeflat gilt auch nach der Show.",
        menge: 130,
        einheit: "Stück",
        einzelBruttoCent: 8800,
        ust: 0.19,
        rabattProzent: 20,
        istAlternativeZu: "p1",
      },
      {
        id: "p6",
        artikelNummer: "LEDFASSADE",
        bezeichnung: "Bespielen der LED-Fassade",
        beschreibung:
          "Beeindruckendes Branding und unvergessliche Fotos: Auf Wunsch erstrahlt euer Firmenlogo " +
          "oder eure persönliche Botschaft auf unserer funkelnden LED-Fassade.",
        menge: 1,
        einheit: "Stunde",
        einzelBruttoCent: 35000,
        ust: 0.19,
        istAlternativeZu: "p3",
      },
    ],
  };
}
