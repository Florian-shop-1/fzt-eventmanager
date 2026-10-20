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
import { ortFehlt, orteZurPlz } from "./plzort";
import { flotixQuelle, flotixSendungen, type FlotixSendung } from "@/lib/flotix/tuer";

const TABELLE_ID =
  process.env.SHOP_VERSAND_ID ?? "1bZ5D0Zk5z3fxXm0zs8zoIK3AX02RTzkryY59P_fSWv8";
const BLATT_GID = process.env.SHOP_VERSAND_GID ?? "0";

export interface Sendung {
  /** Bestellnummer aus dem Shop. Stabil, deshalb unser Schlüssel. */
  bestellnummer: string;
  /** Aus welchem Ticketing die Sendung kommt. Siehe shop/rohdaten.ts. */
  quelle: "ditix" | "flotix";
  /**
   * Der Gutscheincode, soweit die Quelle ihn kennt.
   *
   * FloTix liefert ihn mit. Bei den alten Ditix-Sendungen ist er leer und
   * wird im Eventmanager von Hand nachgetragen.
   */
  gutscheincode: string | null;
  /** Ablaufdatum, falls gesetzt. Bei uns meist leer. */
  gueltigBis: string | null;
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
  /**
   * Was in der Bestellung als Ort stand, wenn der Ort aus der Postleitzahl
   * ergänzt wurde (dort stand etwa "Bayern" oder "-"). Sonst leer.
   */
  ortVorher: string;
  /** Die Postleitzahl gehört zu mehreren Orten, bitte prüfen. */
  ortMehrdeutig: string[];
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
  if (!flotixQuelle()) return nachbereiten(await ausTabelle());

  /*
    Beide Quellen. Ein Gutschein, der über Ditix verkauft wurde und noch
    nicht in der Post ist, darf nicht aus Kevins Liste verschwinden
    (Florian, 20.10.2026).
  */
  const [neu, alt] = await Promise.all([
    flotixSendungen().catch(() => []),
    ausTabelle().catch(() => [] as Sendung[]),
  ]);

  return nachbereiten([...ausFlotix(neu), ...alt]);
}

/** Die alte Quelle: die Versandtabelle. */
async function ausTabelle(): Promise<Sendung[]> {
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
      quelle: "ditix",
      // Ditix gibt den Code nicht heraus, er wird von Hand nachgetragen.
      gutscheincode: null,
      gueltigBis: null,
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
      ortVorher: "",
      ortMehrdeutig: [],
      absender: feld(z, "Absender"),
      widmung: feld(z, "Widmung"),
      motiv: feld(z, "Motiv"),
      ditixVariante: feld(z, "Ditix-Variante"),
      linkZurBestellung: feld(z, "Link zur Bestellung"),
      status: feld(z, "Status"),
      notiz: feld(z, "Notiz"),
    });
  }

  return sendungen;
}

/**
 * Was für beide Quellen gilt: fehlende Orte nachtragen, neueste zuerst.
 */
async function nachbereiten(sendungen: Sendung[]): Promise<Sendung[]> {
  // Steht als Ort ein Bundesland oder nichts, den Ort aus der PLZ holen.
  await Promise.all(
    sendungen
      .filter((s) => ortFehlt(s.ort))
      .map(async (s) => {
        const orte = await orteZurPlz(s.plz);
        if (orte.length === 0) return;
        s.ortVorher = s.ort || "(leer)";
        s.ort = orte[0];
        if (orte.length > 1) s.ortMehrdeutig = orte;
      }),
  );

  // Neueste Bestellung zuerst: Was heute reinkam, ist heute dran.
  return sendungen.sort((a, b) => b.kaufdatum.localeCompare(a.kaufdatum));
}

/**
 * Dieselben Sendungen, nur aus FloTix.
 *
 * FloTix schickt von sich aus nur, was bezahlt ist und per Post geht. Der
 * Selbstausdruck taucht hier also gar nicht auf, und ein Status "prüfen"
 * gibt es nicht: Steht eine Anschrift nicht vollständig drin, merkt das
 * brauchtKlaerung() genauso wie bisher.
 *
 * Die Adresszeile ist in FloTix immer die des eingetragenen Empfängers,
 * deshalb bleibt "Versand an" leer. postempfaenger() nimmt dann den
 * Empfänger und, wenn keiner eingetragen ist, den Käufer.
 */
function ausFlotix(sendungen: FlotixSendung[]): Sendung[] {
  const euro = (cent: number) => (cent / 100).toFixed(2).replace(".", ",");
  const zustellart = (z: string) =>
    z === "box" ? "Geschenkbox" : z === "umschlag" ? "Umschlag" : z;

  return sendungen.map((g) => ({
    bestellnummer: g.bestellnummer,
    quelle: "flotix" as const,
    gutscheincode: g.gutscheincode?.trim() || null,
    gueltigBis: g.gueltigBis?.trim() || null,
    kaufdatum: (g.bezahltAm ?? g.kaufdatum).slice(0, 10),
    kundenname: nameOrdentlich(`${g.vorname ?? ""} ${g.nachname ?? ""}`.trim()),
    email: (g.email ?? "").toLowerCase(),
    betrag: euro(g.betragCents + g.versandCents),
    zustellart: zustellart(g.zustellung),
    versandAn: "",
    empfaenger: nameOrdentlich(g.empfaenger ?? ""),
    strasse: g.strasse ?? "",
    plz: g.plz ?? "",
    ort: g.ort ?? "",
    ortVorher: "",
    ortMehrdeutig: [],
    absender: g.von ?? "",
    widmung: g.widmung ?? "",
    motiv: g.motiv,
    ditixVariante: "",
    linkZurBestellung: "",
    status: "",
    notiz: g.notiz ?? "",
  }));
}
