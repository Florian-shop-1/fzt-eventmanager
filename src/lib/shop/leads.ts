/**
 * Anfragen aus Meta und dem Webshop.
 *
 * Quelle ist die Google-Tabelle, in die jede Anfrage geschrieben wird.
 * Kommt eine herein, geht zusätzlich eine Mail an Kevin. Bisher führte
 * diese Mail in die Tabelle, künftig soll sie hierher führen.
 *
 * Der Stand der Bearbeitung wird nicht in die Tabelle zurückgeschrieben,
 * dafür hat das Programm keinen Schreibzugriff. Stattdessen merkt sich der
 * Eventmanager seinen eigenen Stand und zeigt ihn statt des Werts aus der
 * Tabelle an, sobald jemand hier etwas ändert. Die Tabelle bleibt damit
 * unangetastet und bleibt der Ursprung.
 */

import { csvZerlegen, pruefeTabelle } from "./menueliste";
import { nameOrdentlich } from "@/lib/domain/namen";

const TABELLE_ID =
  process.env.SHOP_LEADS_ID ?? "1GRNxgQSZuu4jjZGEj3h1zhFVWlgbTdq2lH61XOnnJfc";
const BLATT_GID = process.env.SHOP_LEADS_GID ?? "0";

/**
 * Stationen einer Anfrage, in der Reihenfolge des Ablaufs.
 * Genau die Werte, die in der Tabelle vorkommen, damit nichts umgedeutet
 * werden muss.
 */
export const LEAD_STATUS = [
  "Anfrage eingegangen",
  "Kontakt hergestellt",
  "Nicht erreichbar",
  "Termin vereinbart",
  "Angebot",
  "Gewonnen",
  "Verloren",
  "Abgelehnt",
  "Telefon - Passt nicht",
] as const;

export type LeadStatus = (typeof LEAD_STATUS)[number] | string;

/**
 * Was auf einer Altanfrage steht, die in einem Rutsch abgehakt wurde.
 *
 * Bewusst kein "Verloren" und kein "Abgelehnt" (Florian, 28.10.2026): Bei diesen Anfragen weiß niemand mehr, was
 * aus ihnen geworden ist. Viele wurden damals per Mail erledigt, ohne dass hier je ein Stand gesetzt wurde. Das
 * ehrlich hinzuschreiben ist besser, als eine Entscheidung zu behaupten, die es nie gab.
 *
 * Steht bewusst nicht in LEAD_STATUS: Von Hand soll das niemand auswählen, es entsteht nur über den Knopf.
 */
export const ABGEHAKT = "Altbestand abgehakt";

/**
 * Störungsmeldungen aus dem Shop.
 *
 * Seit dem Vorfall vom 4. September hat der Shop einen Notausgang: Laesst
 * sich der Saalplan nicht laden, kann der Besucher statt in der Sackgasse
 * zu stehen einen Rueckruf anfordern. Diese Meldungen gehen ueber
 * denselben Webhook wie die Anfragen und landen deshalb in derselben
 * Tabelle, erkennbar am Anfragetyp.
 *
 * Sie gehoeren aber nicht in den Vertrieb: Da will jemand ein Ticket
 * kaufen und konnte nicht. Deshalb werden sie hier getrennt.
 */
const STOERUNG = /st(ö|oe)rung/i;

/** Ist das eine Stoerungsmeldung und keine Verkaufsanfrage? */
export function istStoerung(l: Lead): boolean {
  return STOERUNG.test(l.anfragetyp);
}

/*
  Barrierefreie Plaetze laufen durch dieselbe Tabelle.

  Der Knopf steht im Buchungsfenster bei der Platzwahl: Wer einen
  barrierefreien Platz braucht, kann ihn nicht selbst im Saalplan
  waehlen und fragt deshalb an. Das ist ein Gast, der ein Ticket
  kaufen will, kein Firmenevent.

  "anfragen für barrierefreiheit sollten nicht bei den events landen"
  (Florian, 29.10.2026). Sie verstopfen die Vertriebsliste und bringen
  den Gespraechsleitfaden fuers Firmengeschaeft mit, der hier nichts zu
  suchen hat: Niemand fragt einen Rollstuhlfahrer, ob er exklusiv das
  ganze Haus mieten moechte.

  Gemeldet werden sie weiterhin per Mail, sobald sie hereinkommen,
  siehe lib/shop/lead-meldung.ts. Das ist ab jetzt der einzige Weg, auf
  dem jemand davon erfaehrt, deshalb darf diese Meldung nicht
  wegfallen.
*/
const BARRIEREFREI = /barrierefrei/i;

/** Ist das die Anfrage nach einem barrierefreien Platz? */
export function istBarrierefrei(l: Lead): boolean {
  return BARRIEREFREI.test(l.anfragetyp);
}

/** Gehoert die Anfrage in den Vertrieb, also auf die Leads-Seite? */
export function istVertrieb(l: Lead): boolean {
  return !istStoerung(l) && !istBarrierefrei(l);
}

/**
 * Stationen einer Stoerungsmeldung. Kurz gehalten: Es geht nur darum,
 * ob jemand zurueckgerufen hat.
 */
export const STOERUNG_STATUS = ["Neu", "Zurückgerufen", "Erledigt"] as const;

/** Wie eine Anfrage einzuordnen ist: offen, gewonnen oder erledigt. */
export function lageDesLeads(status: string): "offen" | "gewonnen" | "erledigt" {
  if (/gewonnen/i.test(status)) return "gewonnen";
  if (/verloren|abgelehnt|passt nicht|abgehakt/i.test(status)) return "erledigt";
  return "offen";
}

export interface Lead {
  /**
   * Eigener Schlüssel. Die Tabelle hat keine Nummer, deshalb aus Datum,
   * Mailadresse und Name gebildet. Solange diese drei stehen, bleibt der
   * Schlüssel gleich, auch wenn Zeilen umsortiert werden.
   */
  schluessel: string;
  eingang: string;
  name: string;
  /** Firma, falls angegeben (Meta-Formular „Name des Unternehmens“). */
  firma: string;
  telefon: string;
  email: string;
  teilnehmer: string;
  wunschdatum: string;
  anfragetyp: string;
  status: LeadStatus;
  ablehnungsgrund: string;
  kommentar: string;
  umsatz: string;
  /** Woher die Anfrage kam, falls die Kampagne es mitgeliefert hat. */
  herkunft: string | null;
}

/** Bildet den Schlüssel einer Anfrage. */
export function leadSchluessel(eingang: string, email: string, name: string): string {
  return [eingang, email, name]
    .map((t) => t.trim().toLowerCase())
    .join("|")
    .replace(/\s+/g, " ");
}

/**
 * Woher die Anfragen kommen (Julian, 20.10.2026).
 *
 * ANFRAGEN_QUELLE=datenbank: aus der eigenen Tabelle anfrage, befüllt über
 * /api/anfrage. Sonst wie bisher aus der Google-Tabelle. So lässt sich am
 * Umschalttag umlegen und notfalls in einer Minute zurück.
 */
export function anfragenAusDatenbankAktiv(): boolean {
  return (process.env.ANFRAGEN_QUELLE ?? "").trim().toLowerCase() === "datenbank";
}

export async function holeLeads(): Promise<Lead[]> {
  if (anfragenAusDatenbankAktiv()) {
    const { anfragenAusDatenbank } = await import("@/lib/db/anfragen");
    return anfragenAusDatenbank();
  }
  return holeLeadsAusTabelle();
}

/** Die Anfragen aus der Google-Tabelle (bisheriger Weg, auch für die einmalige Übernahme). */
export async function holeLeadsAusTabelle(): Promise<Lead[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${TABELLE_ID}/export` +
    `?format=csv&gid=${BLATT_GID}`;

  const antwort = await fetch(url, {
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(20000),
  });

  if (!antwort.ok) {
    throw new Error(
      `Die Anfragenliste konnte nicht gelesen werden (${antwort.status}). ` +
        `Prüfe, ob die Google-Tabelle noch über den Link freigegeben ist.`,
    );
  }

  const inhalt = await antwort.text();
  pruefeTabelle(inhalt, "Die Anfragenliste");

  const zeilen = csvZerlegen(inhalt);
  if (zeilen.length < 2) return [];

  const kopf = zeilen[0].map((s) => s.trim().toLowerCase());
  const sp = (name: string) => kopf.indexOf(name.toLowerCase());
  const feld = (z: string[], name: string) => (z[sp(name)] ?? "").trim();

  if (sp("Name") < 0 || sp("Status") < 0) {
    throw new Error(
      "Der Anfragenliste fehlen Spalten (Name oder Status). Wurde die Tabelle umgebaut?",
    );
  }

  const leads: Lead[] = [];
  // Zwei Anfragen können an einem Tag von derselben Adresse kommen, etwa
  // wenn jemand das Formular zweimal abschickt. Dann bekäme die zweite
  // denselben Schlüssel und würde die erste überschreiben. Deshalb zählt
  // ein Zähler mit und hängt bei Wiederholungen eine Nummer an.
  const gesehen = new Map<string, number>();

  for (const z of zeilen.slice(1)) {
    if (!z.some((f) => f.trim())) continue;
    const name = feld(z, "Name");
    const eingang = feld(z, "Eingangsdatum");
    if (!name && !eingang) continue;

    const quelle = feld(z, "utm_source");
    const kampagne = feld(z, "utm_campaign");

    const basis = leadSchluessel(eingang, feld(z, "E-Mail"), name);
    const wievielte = (gesehen.get(basis) ?? 0) + 1;
    gesehen.set(basis, wievielte);

    leads.push({
      schluessel: wievielte === 1 ? basis : `${basis}#${wievielte}`,
      eingang,
      name: nameOrdentlich(name),
      firma: feld(z, "Firma"),
      telefon: feld(z, "Mobilnummer"),
      email: feld(z, "E-Mail"),
      teilnehmer: feld(z, "Teilnehmerzahl"),
      wunschdatum: feld(z, "Wunschdatum"),
      anfragetyp: feld(z, "Anfragetyp"),
      status: feld(z, "Status"),
      ablehnungsgrund: feld(z, "Grund für Ablehnung"),
      kommentar: feld(z, "Kommentar"),
      umsatz: feld(z, "Gewonnener Umsatz"),
      herkunft: quelle ? [quelle, kampagne].filter(Boolean).join(" · ") : null,
    });
  }

  return leads.sort((a, b) => sortierdatum(b.eingang) - sortierdatum(a.eingang));
}

/**
 * Macht aus "12.02.2026" eine sortierbare Zahl.
 * Unlesbare Angaben landen hinten, nicht mittendrin.
 */
function sortierdatum(deutsch: string): number {
  const t = deutsch.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!t) return 0;
  return Number(t[3]) * 10000 + Number(t[2]) * 100 + Number(t[1]);
}
