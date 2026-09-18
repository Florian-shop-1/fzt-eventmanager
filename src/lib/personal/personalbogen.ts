/**
 * Der Personalbogen für das Lohnbüro.
 *
 * Inhalt nach Florians Vorlage "Personalfragebogen neu ab 02.2025.xlsx".
 * Ergänzt nur, was die Vorlage stillschweigend voraussetzt: die Art der
 * Beschäftigung (davon hängen die zwei Minijob-Felder ab), IBAN statt
 * Kontonummer und ein abweichender Kontoinhaber.
 *
 * Die Angaben werden nicht gespeichert, sondern einmal per Mail an das
 * Lohnbüro geschickt (siehe migrations/037_personalbogen.sql).
 */

export const FAMILIENSTAND = ["ledig", "verheiratet", "eingetragene Lebenspartnerschaft", "getrennt lebend", "geschieden", "verwitwet"];
export const BESCHAEFTIGUNG = ["Minijob", "Teilzeit", "Vollzeit", "Kurzfristige Aushilfe", "Werkstudent/in", "Auszubildende/r"];
export const STATUS_MINIJOB = [
  "Schüler/in", "Student/in", "Hausfrau/Hausmann", "Arbeitnehmer/in in Hauptbeschäftigung",
  "Selbstständig", "Beamter/Beamtin", "Rentner/in", "Arbeitslos gemeldet", "Sonstiges",
];
export const SCHULABSCHLUSS = [
  "ohne Schulabschluss", "Haupt-/Volksschulabschluss", "Mittlere Reife oder gleichwertig",
  "Abitur/Fachabitur", "Abschluss unbekannt",
];
export const AUSBILDUNG = [
  "ohne beruflichen Ausbildungsabschluss", "anerkannte Berufsausbildung", "Meister/Techniker/Fachschule",
  "Bachelor", "Diplom/Magister/Master/Staatsexamen", "Promotion", "Abschluss unbekannt",
];
export const STEUERKLASSE = ["I", "II", "III", "IV", "V", "VI", "weiß ich nicht"];
export const KONFESSION = ["keine", "evangelisch", "römisch-katholisch", "altkatholisch", "andere"];

export interface Personalbogen {
  nachname: string;
  geburtsname: string;
  vorname: string;
  strasse: string;
  plz: string;
  ort: string;
  geburtsdatum: string;
  geburtsort: string;
  familienstand: string;
  staatsangehoerigkeit: string;
  schwerbehindert: string;
  email: string;
  telefon: string;
  svNummer: string;
  iban: string;
  bic: string;
  kontoinhaber: string;
  eintrittsdatum: string;
  berufsbezeichnung: string;
  beschaeftigung: string;
  schulabschluss: string;
  ausbildung: string;
  statusMinijob: string;
  rentenbefreiung: string;
  steuerId: string;
  steuerklasse: string;
  konfession: string;
  krankenversicherung: string;
  krankenkasse: string;
}

export const LEER: Personalbogen = {
  nachname: "", geburtsname: "", vorname: "", strasse: "", plz: "", ort: "", geburtsdatum: "",
  geburtsort: "", familienstand: "", staatsangehoerigkeit: "deutsch", schwerbehindert: "nein", email: "",
  telefon: "", svNummer: "", iban: "", bic: "", kontoinhaber: "", eintrittsdatum: "", berufsbezeichnung: "",
  beschaeftigung: "", schulabschluss: "", ausbildung: "", statusMinijob: "", rentenbefreiung: "",
  steuerId: "", steuerklasse: "", konfession: "", krankenversicherung: "gesetzlich", krankenkasse: "",
};

export const istMinijob = (b: Personalbogen) => b.beschaeftigung === "Minijob";

export function ibanSauber(iban: string): string {
  return iban.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Prüfziffer nach ISO 13616 (mod 97). Fängt Zahlendreher und Tippfehler sicher ab. */
export function ibanGueltig(iban: string): boolean {
  const s = ibanSauber(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  if (s.startsWith("DE") && s.length !== 22) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const z of umgestellt) {
    const wert = z >= "A" ? String(z.charCodeAt(0) - 55) : z;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

/** IBAN in Viererblöcken, wie auf der Bankkarte. */
export function ibanLesbar(iban: string): string {
  return ibanSauber(iban).replace(/(.{4})/g, "$1 ").trim();
}

/** Steuer-ID: 11 Ziffern mit Prüfziffer nach ISO 7064 (MOD 11,10). */
export function steuerIdGueltig(id: string): boolean {
  const s = id.replace(/\D/g, "");
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  let produkt = 10;
  for (let i = 0; i < 10; i++) {
    let summe = (Number(s[i]) + produkt) % 10;
    if (summe === 0) summe = 10;
    produkt = (summe * 2) % 11;
  }
  const pruef = (11 - produkt) % 10;
  return pruef === Number(s[10]);
}

/** Sozialversicherungsnummer: 2 Ziffern, Geburtsdatum TTMMJJ, Buchstabe, 3 Ziffern. */
export function svFormOk(sv: string): boolean {
  return /^\d{8}[A-Z]\d{3}$/.test(sv.toUpperCase().replace(/\s/g, ""));
}

/**
 * Passt die SV-Nummer zum Geburtsdatum und zum Anfangsbuchstaben des
 * Geburtsnamens? Nur ein Hinweis, kein Hindernis: Es gibt Sonderfälle.
 */
export function svHinweis(b: Personalbogen): string | null {
  const sv = b.svNummer.toUpperCase().replace(/\s/g, "");
  if (!svFormOk(sv)) return null;
  const [j, m, t] = b.geburtsdatum.split("-");
  if (j && m && t && sv.slice(2, 8) !== `${t}${m}${j.slice(2)}`) {
    return "Die Ziffern 3 bis 8 sind normalerweise dein Geburtsdatum (TTMMJJ). Bitte kurz vergleichen.";
  }
  const name = (b.geburtsname || b.nachname).trim().toUpperCase().replace("Ä", "A").replace("Ö", "O").replace("Ü", "U");
  if (name && sv[8] !== name[0]) {
    return "Der Buchstabe ist normalerweise der Anfangsbuchstabe deines Geburtsnamens. Bitte kurz vergleichen.";
  }
  return null;
}

/** Pflichtfelder und harte Fehler. Leeres Objekt heißt: alles in Ordnung. */
export function pruefen(b: Personalbogen): Record<string, string> {
  const f: Record<string, string> = {};
  const pflicht: Array<keyof Personalbogen> = [
    "nachname", "vorname", "strasse", "plz", "ort", "geburtsdatum", "geburtsort", "familienstand",
    "staatsangehoerigkeit", "email", "svNummer", "iban", "beschaeftigung", "schulabschluss",
    "ausbildung", "steuerId", "steuerklasse", "konfession", "krankenversicherung", "krankenkasse",
  ];
  for (const k of pflicht) if (!String(b[k] ?? "").trim()) f[k] = "Bitte ausfüllen";
  if (istMinijob(b)) {
    if (!b.statusMinijob) f.statusMinijob = "Bitte auswählen";
    if (!b.rentenbefreiung) f.rentenbefreiung = "Bitte auswählen";
  }
  if (b.plz && !/^\d{5}$/.test(b.plz.trim()) && b.staatsangehoerigkeit.toLowerCase().startsWith("deutsch")) {
    f.plz = "Fünf Ziffern, zum Beispiel 89231";
  }
  if (b.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b.email.trim())) f.email = "Bitte eine gültige E-Mail-Adresse";
  if (b.iban && !ibanGueltig(b.iban)) f.iban = "Diese IBAN stimmt nicht. Bitte noch einmal von der Bankkarte abschreiben.";
  if (b.svNummer && !svFormOk(b.svNummer)) f.svNummer = "12 Zeichen, zum Beispiel 65 170839 J 003";
  if (b.steuerId && !/^\d{11}$/.test(b.steuerId.replace(/\s/g, ""))) f.steuerId = "Die Steuer-ID hat genau 11 Ziffern";
  else if (b.steuerId && !steuerIdGueltig(b.steuerId)) f.steuerId = "Diese Steuer-ID kann nicht stimmen. Bitte noch einmal prüfen.";
  if (b.geburtsdatum && (b.geburtsdatum < "1930-01-01" || b.geburtsdatum > new Date().toISOString().slice(0, 10))) {
    f.geburtsdatum = "Bitte das Geburtsdatum prüfen";
  }
  return f;
}

function datum(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/** Die Zeilen für Mail und Zusammenfassung, in der Reihenfolge der Vorlage. */
export function zeilen(b: Personalbogen): Array<{ gruppe: string; felder: Array<[string, string]> }> {
  return [
    {
      gruppe: "Person",
      felder: [
        ["Name", b.nachname],
        ["Geburtsname", b.geburtsname || b.nachname],
        ["Vorname", b.vorname],
        ["Straße", b.strasse],
        ["Postleitzahl", b.plz],
        ["Ort", b.ort],
        ["Geburtsdatum", datum(b.geburtsdatum)],
        ["Geburtsort", b.geburtsort],
        ["Familienstand", b.familienstand],
        ["Staatsangehörigkeit", b.staatsangehoerigkeit],
        ["Schwerbehindert", b.schwerbehindert],
        ["E-Mail", b.email],
        ["Telefon", b.telefon],
      ],
    },
    {
      gruppe: "Sozialversicherung und Bank",
      felder: [
        ["Versicherungsnummer", b.svNummer.toUpperCase().replace(/\s/g, "")],
        ["IBAN", ibanLesbar(b.iban)],
        ["BIC", b.bic.toUpperCase()],
        ["Kontoinhaber", b.kontoinhaber || `${b.vorname} ${b.nachname}`],
      ],
    },
    {
      gruppe: "Beschäftigung",
      felder: [
        ["Eintrittsdatum", datum(b.eintrittsdatum)],
        ["Berufsbezeichnung", b.berufsbezeichnung],
        ["Art der Beschäftigung", b.beschaeftigung],
        ["Höchster Schulabschluss", b.schulabschluss],
        ["Höchste Berufsausbildung", b.ausbildung],
        ...(istMinijob(b)
          ? ([
              ["Status bei Beginn der Beschäftigung", b.statusMinijob],
              ["Rentenbefreiung", b.rentenbefreiung],
            ] as Array<[string, string]>)
          : []),
      ],
    },
    {
      gruppe: "Steuer und Krankenversicherung",
      felder: [
        ["Steuer-Identifikationsnummer", b.steuerId.replace(/\s/g, "")],
        ["Steuerklasse", b.steuerklasse],
        ["Konfession", b.konfession],
        ["Krankenversicherung", b.krankenversicherung],
        ["Name der Krankenkasse", b.krankenkasse],
      ],
    },
  ];
}
