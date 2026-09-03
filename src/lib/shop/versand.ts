/**
 * Gutscheinversand.
 *
 * Quelle ist die Google-Tabelle, die der Shop bei jeder Gutscheinbestellung
 * befüllt: eine Zeile je Bestellung, mit Empfänger, Anschrift, Motiv und
 * der Widmung, die der Käufer eingegeben hat.
 *
 * Kevin arbeitet die Liste täglich ab: Umschlag adressieren, Gutschein und
 * Begleitschreiben hineinlegen, abschicken. Das Programm nimmt ihm zwei
 * Dinge ab, die bisher Handarbeit waren: Es druckt Adressaufkleber und
 * Begleitschreiben, und es merkt sich, was schon raus ist.
 *
 * Gelesen wird nur. In die Tabelle schreibt der Shop.
 */

import { csvZerlegen, pruefeTabelle } from "./menueliste";
import { nameOrdentlich } from "@/lib/domain/namen";

const TABELLE_ID =
  process.env.SHOP_VERSAND_ID ?? "1bZ5D0Zk5z3fxXm0zs8zoIK3AX02RTzkryY59P_fSWv8";
const BLATT_GID = process.env.SHOP_VERSAND_GID ?? "0";

export interface Sendung {
  /** Bestellnummer aus dem Shop. Stabil, deshalb unser Schlüssel. */
  bestellnummer: string;
  kaufdatum: string;
  kundenname: string;
  email: string;
  /** Bestellwert in Euro, wie er in der Tabelle steht. */
  betrag: string;
  /** "Geschenkumschlag", "Geschenkbox" oder "Selbstausdruck". */
  zustellart: string;
  /** "An mich selbst" oder direkt an die beschenkte Person. */
  versandAn: string;
  empfaenger: string;
  strasse: string;
  plz: string;
  ort: string;
  /** Wer schenkt. Steht auf dem Begleitschreiben. */
  absender: string;
  /** Der persönliche Text des Käufers. */
  widmung: string;
  motiv: string;
  ditixVariante: string;
  linkZurBestellung: string;
  /** Stand aus der Tabelle, etwa "Zu versenden" oder "Versendet". */
  status: string;
  notiz: string;
}

/**
 * Muss diese Sendung überhaupt in die Post?
 *
 * Beim Selbstausdruck bekommt der Käufer eine PDF-Datei, da ist nichts zu
 * verschicken. Alles andere geht als Umschlag oder Box raus.
 */
export function gehtInDiePost(s: Sendung): boolean {
  return !/selbstausdruck/i.test(s.zustellart);
}

/**
 * An wen geht der Umschlag?
 *
 * Nicht immer an die beschenkte Person. Steht "An mich selbst", bekommt
 * der Besteller das Kuvert und legt den Gutschein selbst unter den Baum.
 * Der Empfänger ist dann nur der Name für die Widmung.
 *
 * Das ist keine Feinheit: Im Fensterumschlag steht der falsche Name sonst
 * gut sichtbar auf der Post.
 */
export function postempfaenger(s: Sendung): string {
  if (/an mich selbst/i.test(s.versandAn)) return s.kundenname || s.empfaenger;
  return s.empfaenger || s.kundenname;
}

/** Fehlt etwas, das vor dem Verschicken geklärt werden muss? */
export function brauchtKlaerung(s: Sendung): string | null {
  if (/prüfen|pruefen/i.test(s.status)) return s.status;
  if (gehtInDiePost(s) && !s.strasse.trim()) return "Keine Anschrift hinterlegt";
  if (gehtInDiePost(s) && !s.empfaenger.trim() && !s.kundenname.trim()) {
    return "Kein Empfänger hinterlegt";
  }
  return null;
}

export async function holeSendungen(): Promise<Sendung[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${TABELLE_ID}/export` +
    `?format=csv&gid=${BLATT_GID}`;

  const antwort = await fetch(url, {
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    throw new Error(
      `Die Versandliste konnte nicht gelesen werden (${antwort.status}). ` +
        `Prüfe, ob die Google-Tabelle noch über den Link freigegeben ist.`,
    );
  }

  const inhalt = await antwort.text();
  pruefeTabelle(inhalt, "Die Versandliste");

  const zeilen = csvZerlegen(inhalt);
  if (zeilen.length < 2) return [];

  const kopf = zeilen[0].map((s) => s.trim().toLowerCase());
  const sp = (name: string) => kopf.indexOf(name.toLowerCase());
  const feld = (z: string[], name: string) => (z[sp(name)] ?? "").trim();

  if (sp("Bestellnummer") < 0) {
    throw new Error(
      "Der Versandliste fehlt die Spalte Bestellnummer. Wurde die Tabelle umgebaut?",
    );
  }

  const sendungen: Sendung[] = [];

  for (const z of zeilen.slice(1)) {
    if (!z.some((f) => f.trim())) continue;
    const nummer = feld(z, "Bestellnummer");
    if (!nummer) continue;

    sendungen.push({
      bestellnummer: nummer,
      kaufdatum: feld(z, "Kaufdatum"),
      kundenname: nameOrdentlich(feld(z, "Kundenname")),
      email: feld(z, "E-Mail"),
      betrag: feld(z, "Gesamtbetrag"),
      zustellart: feld(z, "Zustellart"),
      versandAn: feld(z, "Versand an"),
      empfaenger: nameOrdentlich(feld(z, "Empfänger")),
      strasse: feld(z, "Straße"),
      plz: feld(z, "PLZ"),
      ort: feld(z, "Ort"),
      absender: feld(z, "Absender"),
      widmung: feld(z, "Widmung"),
      motiv: feld(z, "Motiv"),
      ditixVariante: feld(z, "Ditix-Variante"),
      linkZurBestellung: feld(z, "Link zur Bestellung"),
      status: feld(z, "Status"),
      notiz: feld(z, "Notiz"),
    });
  }

  // Neueste Bestellung zuerst: Was heute reinkam, ist heute dran.
  return sendungen.sort((a, b) => b.kaufdatum.localeCompare(a.kaufdatum));
}
