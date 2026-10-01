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
import { ausDatei, umsaetzeUebernehmen, type RoherUmsatz } from "@/lib/rechnung/bankimport";
import { auszugsleserEingerichtet, kartenauszugLesen } from "@/lib/rechnung/kartenauszug";
import { auszugMitAbdruck, auszugVermerken, dateiAbdruck } from "@/lib/rechnung/auszuege";
import { kontoFreischalten, kontoStilllegen } from "@/lib/rechnung/konten";
import { handRechnungAnlegen } from "@/lib/rechnung/hand";
import { erinnerungVerschicken } from "@/lib/rechnung/erinnerung";

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

  /*
    Zurueck dorthin, wo hochgeladen wurde.

    Die Kreditkartenabrechnung wird auf der Seite "Belege abgleichen"
    eingelesen, und wer dort hochlaedt, will dort weiterarbeiten und
    nicht bei den Zahlungseingaengen landen (Florian, 30.09.2026).
    Angenommen wird nur ein bekannter Weg, nichts aus dem Formular
    blind weitergereicht.
  */
  const woher = String(f.get("zurueck") ?? "");
  const ziel = /^\/bewirtung\/abgleich(\?m=\d{4}-\d{2})?$/.test(woher) ? woher : "/zahlungseingaenge";

  const datei = f.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    zurueck(ziel, "Bitte eine Datei auswählen.");
  }
  if (datei.size > 8 * 1024 * 1024) zurueck(ziel, "Die Datei ist zu groß.");

  const roh = Buffer.from(await datei.arrayBuffer());

  /*
    Dieselbe Datei nicht zweimal.

    Die Umsaetze selbst koennen nicht doppelt hereinkommen, dafuer sorgt
    ihr Fingerabdruck. Der Mensch davor sieht dann aber nur "0 neue
    Umsaetze" und weiss nicht, ob er die richtige Datei erwischt hat.
    Deshalb sagt das Programm es ihm (Florian, 30.09.2026).
  */
  const abdruck = dateiAbdruck(roh);
  const schonDa = await auszugMitAbdruck(abdruck);
  if (schonDa) {
    const wann = new Date(schonDa.angelegtAm).toLocaleDateString("de-DE");
    const zeitraum =
      schonDa.vonDatum && schonDa.bisDatum
        ? ` (${schonDa.vonDatum.split("-").reverse().join(".")} bis ${schonDa.bisDatum.split("-").reverse().join(".")})`
        : "";
    zurueck(
      ziel,
      `Diese Abrechnung habe ich schon: eingelesen am ${wann}${schonDa.wer ? ` von ${schonDa.wer}` : ""}, ` +
        `${schonDa.umsaetze} Umsätze${zeitraum}. Es wurde nichts doppelt angelegt.`,
    );
  }

  /*
    CSV oder PDF, beides geht.

    Im OnlineBanking liegt die Kartenabrechnung als PDF naeher als die
    CSV, und wer sie heruntergeladen hat, soll sie hochladen koennen,
    ohne noch einmal loszuziehen (Florian, 30.09.2026). Das PDF liest
    dasselbe Modell, das auch die Belege liest.
  */
  let liste: RoherUmsatz[];
  let ausPdf = "";
  if (roh.subarray(0, 4).toString("latin1") === "%PDF") {
    if (!auszugsleserEingerichtet()) {
      zurueck(ziel, "Das Lesen von PDFs ist hier nicht eingerichtet (ANTHROPIC_API_KEY fehlt).");
    }
    try {
      const lesung = await kartenauszugLesen(roh.toString("base64"));
      liste = lesung.umsaetze;
      ausPdf = lesung.hinweis;
    } catch (f) {
      zurueck(ziel, f instanceof Error ? f.message : "Das PDF liess sich nicht lesen.");
    }
  } else {
    liste = ausDatei(roh.toString("utf8"));
  }

  if (liste.length === 0) {
    zurueck(ziel, "In dieser Datei standen keine lesbaren Umsätze.");
  }

  /*
    Zu welchem Konto die Datei gehoert.

    Die Kreditkartenumsaetze gibt die Bank ueber FinTS nicht heraus
    (gemessen am 29.09.2026), sie kommen als Monatsauszug von Hand
    hierher. Damit sie nicht mit den Kontoumsaetzen verschwimmen, waehlt
    man beim Hochladen das Konto aus.
  */
  const konto = String(f.get("konto") ?? "").trim().slice(0, 8);

  const e = await umsaetzeUebernehmen(liste, b.name, konto);

  const tage = liste.map((u) => u.buchungstag).filter(Boolean).sort();
  await auszugVermerken({
    hash: abdruck,
    dateiname: datei.name.slice(0, 200),
    konto,
    vonDatum: tage[0] ?? null,
    bisDatum: tage[tage.length - 1] ?? null,
    umsaetze: liste.length,
    neu: e.neu,
    wer: b.name,
  }).catch((f) => console.warn("[bank] Auszug nicht vermerkt:", f));
  await merken({
    rechnungId: null,
    art: "bank_import",
    text:
      `Kontoauszug eingelesen${konto ? ` (Konto ${konto})` : ""}: ` +
      `${e.neu} neue Umsätze, ${e.zugeordnet} automatisch zugeordnet`,
    wer: b.name,
  });
  zurueck(
    ziel,
    `${e.neu} neue Umsätze, davon ${e.zugeordnet} automatisch zugeordnet, ${e.offen} offen` +
      `${e.schonBekannt > 0 ? `, ${e.schonBekannt} waren schon bekannt` : ""}.` +
      /*
        Was beim Lesen unsicher war, gehoert dazu.

        Eine aus dem PDF gelesene Zeile kann falsch sein, und wer das
        erst beim Steuerbuero erfaehrt, hat den Monat schon abgehakt.
      */
      `${ausPdf ? ` Hinweis zum PDF: ${ausPdf}` : ""}`,
  );
}

export async function zahlungszielSpeichern(f: FormData): Promise<void> {
  await darf();
  const tage = Math.max(0, Math.min(90, Number(text(f, "tage", 3)) || 14));
  await einstellungSpeichern({ zahlungszielTage: tage });
  zurueck("/rechnungen", `Standard-Zahlungsziel: ${tage} Tage.`);
}

/**
 * Ein Konto des Bankzugangs freischalten oder stilllegen.
 *
 * Meldet der Bankabruf ein Konto, das noch nicht bekannt ist, liegt es
 * gesperrt da, bis ein Mensch es freischaltet. Das ist die Stelle dafuer
 * (Florian, 29.09.2026).
 */
export async function kontoUmschalten(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b) && !darfKaufmaennisches(b?.rolle ?? "team")) {
    throw new Error("Nur die Buchhaltung darf Konten freischalten.");
  }

  const endetAuf = String(f.get("endetAuf") ?? "").trim().slice(0, 8);
  if (!endetAuf) throw new Error("Es fehlt das Konto.");

  if (String(f.get("was")) === "stilllegen") {
    await kontoStilllegen(endetAuf);
  } else {
    await kontoFreischalten(endetAuf, String(f.get("bezeichnung") ?? "Konto"));
  }

  revalidatePath("/zahlungseingaenge");
  redirect("/zahlungseingaenge?meldung=" + encodeURIComponent("Gespeichert."));
}

/**
 * Eine Ausgangsrechnung von Hand anlegen.
 *
 * Fuer alles, was nicht aus einem Angebot kommt. Sie bekommt dieselbe
 * Nummer aus demselben Kreis und denselben Hausbrief, und ab da laeuft
 * sie den gewohnten Weg: verschicken, Zahlungseingang abgleichen,
 * erinnern (Florian, 01.10.2026).
 */
export async function handRechnungErstellen(f: FormData): Promise<void> {
  const b = await darf();

  const positionen = [];
  for (let i = 0; i < 8; i++) {
    const bezeichnung = text(f, `bezeichnung${i}`, 200);
    if (!bezeichnung) continue;
    const menge = Number(text(f, `menge${i}`, 10).replace(",", ".")) || 0;
    const preis = centAus(text(f, `preis${i}`, 20)) ?? 0;
    const ust = Number(text(f, `ust${i}`, 5)) || 0;
    positionen.push({
      bezeichnung,
      menge,
      einheit: text(f, `einheit${i}`, 20) || "Stück",
      einzelBruttoCent: preis,
      ust,
    });
  }

  try {
    const r = await handRechnungAnlegen({
      kunde: text(f, "kunde", 200),
      ansprechpartner: text(f, "ansprechpartner", 120),
      email: text(f, "email", 200),
      strasse: text(f, "strasse", 200),
      plz: text(f, "plz", 10),
      ort: text(f, "ort", 120),
      leistung: text(f, "leistung", 300),
      leistungszeitraum: text(f, "leistungszeitraum", 100),
      rechnungsdatum: text(f, "rechnungsdatum", 10) || undefined,
      zahlungszielTage: Number(text(f, "zahlungsziel", 4)) || undefined,
      notiz: text(f, "notiz", 300),
      positionen,
      von: b.name ?? "Büro",
    });
    zurueck(`/rechnungen/${r.id}`, `Rechnung ${r.nummer} angelegt. Sieh sie dir an und verschick sie.`);
  } catch (fehler) {
    if (fehler instanceof Error && !("digest" in fehler)) {
      zurueck("/rechnungen", fehler.message);
    }
    throw fehler;
  }
}

/** Die freundliche Erinnerung von Hand ausloesen. */
export async function erinnerungSenden(f: FormData): Promise<void> {
  const b = await darf();
  const id = text(f, "id", 40);
  try {
    const an = await erinnerungVerschicken(id, b.name ?? "Büro");
    zurueck(`/rechnungen/${id}`, `Erinnerung an ${an} verschickt.`);
  } catch (fehler) {
    if (fehler instanceof Error && !("digest" in fehler)) {
      zurueck(`/rechnungen/${id}`, `Die Erinnerung ging nicht raus: ${fehler.message}`);
    }
    throw fehler;
  }
}
