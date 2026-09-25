"use server";

/**
 * Rechnungen und Zahlungen von Hand: zuordnen, lösen, bezahlt setzen,
 * stornieren, Umsätze einlesen.
 *
 * Erlaubt für Büro und Geschäftsführung. Gelesen werden darf mehr als
 * geändert: Wer Zahlungen zuordnet, verschiebt Geld in den Büchern.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfKaufmaennisches } from "@/lib/auth/sitzung";
import {
  einstellungSpeichern,
  faelligkeitAendern,
  merken,
  rechnungLesen,
  stornieren,
  umsatzIgnorieren,
  umsatzLesen,
  versandMerken,
  zahlungEintragen,
  zahlungLoesen,
} from "@/lib/rechnung/db";
import { ausDatei, umsaetzeUebernehmen } from "@/lib/rechnung/bankimport";

const text = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);

async function darf() {
  const b = await angemeldeterBenutzer();
  if (!b || (!darfKaufmaennisches(b.rolle) && !darfBuchhaltung(b))) {
    throw new Error("Rechnungen dürfen nur Büro und Geschäftsführung ändern.");
  }
  return b;
}

function zurueck(pfad: string, meldung: string): never {
  revalidatePath("/rechnungen");
  revalidatePath("/zahlungseingaenge");
  redirect(`${pfad}${pfad.includes("?") ? "&" : "?"}meldung=${encodeURIComponent(meldung)}`);
}

/** Betrag wie "1.234,56" oder "1234.56" in Cent. */
function centAus(s: string): number | null {
  const t = s.replace(/\s|€/g, "").trim();
  if (!t) return null;
  const deutsch = /,\d{1,2}$/.test(t);
  const n = Number(deutsch ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Eine Zahlung von Hand eintragen, etwa Bargeld oder eine Überweisung von außen. */
export async function manuellBezahlt(f: FormData): Promise<void> {
  const b = await darf();
  const id = text(f, "id", 40);
  const r = await rechnungLesen(id);
  if (!r) zurueck("/rechnungen", "Diese Rechnung gibt es nicht mehr.");

  const betrag = centAus(text(f, "betrag", 20)) ?? r.offenCent;
  const datum = text(f, "datum", 10) || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  if (betrag <= 0) zurueck(`/rechnungen/${id}`, "Der Betrag sieht nicht richtig aus.");

  await zahlungEintragen({
    rechnungId: id,
    betragCent: betrag,
    datum,
    art: text(f, "art", 30) || "ueberweisung",
    herkunft: "manuell",
    notiz: text(f, "notiz"),
    wer: b.name,
  });
  zurueck(`/rechnungen/${id}`, "Zahlung eingetragen, als manuell gekennzeichnet.");
}

export async function zahlungEntfernen(f: FormData): Promise<void> {
  const b = await darf();
  const id = text(f, "id", 40);
  const rechnung = text(f, "rechnung", 40);
  await zahlungLoesen(id, b.name);
  zurueck(`/rechnungen/${rechnung}`, "Zuordnung gelöst.");
}

export async function rechnungStornieren(f: FormData): Promise<void> {
  const b = await darf();
  const id = text(f, "id", 40);
  const grund = text(f, "grund") || "ohne Angabe";
  await stornieren(id, grund, b.name);
  zurueck(`/rechnungen/${id}`, "Rechnung storniert.");
}

export async function faelligAendern(f: FormData): Promise<void> {
  const b = await darf();
  const id = text(f, "id", 40);
  const datum = text(f, "faellig", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) zurueck(`/rechnungen/${id}`, "Das Datum sieht nicht richtig aus.");
  await faelligkeitAendern(id, datum, b.name);
  zurueck(`/rechnungen/${id}`, "Fälligkeit geändert.");
}

/** Vermerkt einen erneuten Versand, wenn die Mail vorher steckengeblieben war. */
export async function versandNachtragen(f: FormData): Promise<void> {
  const b = await darf();
  const id = text(f, "id", 40);
  const an = text(f, "an", 120);
  if (!an.includes("@")) zurueck(`/rechnungen/${id}`, "Bitte eine Mailadresse angeben.");
  await versandMerken({ rechnungId: id, an, wer: b.name });
  zurueck(`/rechnungen/${id}`, `Als versendet an ${an} vermerkt.`);
}

/* ------------------------------------------------------------------ *
 * Zahlungseingänge
 * ------------------------------------------------------------------ */

export async function zuordnen(f: FormData): Promise<void> {
  const b = await darf();
  const umsatzId = text(f, "umsatz", 40);
  const rechnungId = text(f, "rechnung", 40);
  const u = await umsatzLesen(umsatzId);
  const r = await rechnungLesen(rechnungId);
  if (!u || !r) zurueck("/zahlungseingaenge", "Eintrag nicht gefunden.");

  const betrag = centAus(text(f, "betrag", 20)) ?? u.betragCent;
  await zahlungEintragen({
    rechnungId: r.id,
    bankUmsatzId: u.id,
    betragCent: betrag,
    datum: u.buchungstag,
    herkunft: "manuell",
    notiz: u.verwendungszweck.slice(0, 200),
    wer: b.name,
  });
  zurueck("/zahlungseingaenge", `${(betrag / 100).toFixed(2)} Euro der Rechnung ${r.nummer} zugeordnet.`);
}

export async function beiseitelegen(f: FormData): Promise<void> {
  const b = await darf();
  await umsatzIgnorieren(text(f, "umsatz", 40), text(f, "grund") || "gehört nicht zu einer Rechnung", b.name);
  zurueck("/zahlungseingaenge", "Zahlungseingang beiseitegelegt.");
}

/** Kontoauszug einlesen: CSV, CAMT.053 oder MT940 aus dem Online-Banking. */
export async function dateiEinlesen(f: FormData): Promise<void> {
  const b = await darf();
  const datei = f.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    zurueck("/zahlungseingaenge", "Bitte eine Datei auswählen.");
  }
  if (datei.size > 8 * 1024 * 1024) zurueck("/zahlungseingaenge", "Die Datei ist zu groß.");

  const inhalt = Buffer.from(await datei.arrayBuffer()).toString("utf8");
  const liste = ausDatei(inhalt);
  if (liste.length === 0) {
    zurueck("/zahlungseingaenge", "In dieser Datei standen keine lesbaren Umsätze.");
  }

  const e = await umsaetzeUebernehmen(liste, b.name);
  await merken({
    rechnungId: null,
    art: "bank_import",
    text: `Kontoauszug eingelesen: ${e.neu} neue Umsätze, ${e.zugeordnet} automatisch zugeordnet`,
    wer: b.name,
  });
  zurueck(
    "/zahlungseingaenge",
    `${e.neu} neue Umsätze, davon ${e.zugeordnet} automatisch zugeordnet, ${e.offen} offen` +
      `${e.schonBekannt > 0 ? `, ${e.schonBekannt} waren schon bekannt` : ""}.`,
  );
}

export async function zahlungszielSpeichern(f: FormData): Promise<void> {
  await darf();
  const tage = Math.max(0, Math.min(90, Number(text(f, "tage", 3)) || 14));
  await einstellungSpeichern({ zahlungszielTage: tage });
  zurueck("/rechnungen", `Standard-Zahlungsziel: ${tage} Tage.`);
}
