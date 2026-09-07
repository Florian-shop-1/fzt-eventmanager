"use server";

/**
 * Aktionscodes: Vorräte verwalten, Codes vergeben, Codes verschicken.
 *
 * In Ditix liegen mehrere Vorräte nebeneinander, weil neu angelegte
 * Codes dort bei jeder einzelnen Show freigeschaltet werden müssen.
 * Deshalb wurden sie vorsorglich in grosser Zahl angelegt. Hier werden
 * sie ausgegeben.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "./client";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { mailVerschicken } from "@/lib/mail/versand";

export interface Aktion {
  id: string;
  name: string;
  beschreibung: string | null;
  gueltigBis: string | null;
  aktiv: boolean;
  /** Wie viele Codes insgesamt im Vorrat liegen. */
  gesamt: number;
  /** Wie viele davon noch niemandem zugesagt sind. */
  frei: number;
}

export interface Vergabe {
  code: string;
  aktion: string;
  vergebenAm: string;
  vergebenVon: string | null;
  empfaenger: string | null;
  empfaengerEmail: string | null;
  anlass: string | null;
}

/** Nur Büro und Inhaber. Freikarten sind bares Geld. */
async function verlangeBuero(): Promise<{ name: string }> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Inhaber dürfen Codes vergeben.");
  }
  return { name: benutzer.name };
}

export async function holeAktionen(): Promise<Aktion[]> {
  await verlangeBuero();
  const zeilen = (await db()`
    select a.id, a.name, a.beschreibung, a.gueltig_bis, a.aktiv,
           count(c.id)::int as gesamt,
           count(c.id) filter (where c.vergeben_am is null)::int as frei
      from code_aktion a
      left join aktionscode c on c.aktion_id = a.id
     group by a.id
     order by a.aktiv desc, a.name
  `) as Array<Record<string, unknown>>;

  return zeilen.map((z) => ({
    id: String(z.id),
    name: String(z.name),
    beschreibung: (z.beschreibung as string) ?? null,
    gueltigBis: (z.gueltig_bis as string) ?? null,
    aktiv: z.aktiv === true,
    gesamt: Number(z.gesamt),
    frei: Number(z.frei),
  }));
}

/** Die letzten Vergaben, für die Übersicht. */
export async function letzteVergaben(grenze = 50): Promise<Vergabe[]> {
  await verlangeBuero();
  const zeilen = (await db()`
    select c.code, a.name as aktion, c.vergeben_am, c.vergeben_von,
           c.empfaenger, c.empfaenger_email, c.anlass
      from aktionscode c
      join code_aktion a on a.id = c.aktion_id
     where c.vergeben_am is not null
     order by c.vergeben_am desc
     limit ${grenze}
  `) as Array<Record<string, unknown>>;

  return zeilen.map((z) => ({
    code: String(z.code),
    aktion: String(z.aktion),
    vergebenAm: new Date(z.vergeben_am as string).toISOString(),
    vergebenVon: (z.vergeben_von as string) ?? null,
    empfaenger: (z.empfaenger as string) ?? null,
    empfaengerEmail: (z.empfaenger_email as string) ?? null,
    anlass: (z.anlass as string) ?? null,
  }));
}

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

/** Legt einen Vorrat an. */
export async function aktionAnlegen(formData: FormData): Promise<void> {
  await verlangeBuero();
  const name = text(formData, "name");
  if (!name) throw new Error("Die Aktion braucht einen Namen.");

  await db()`
    insert into code_aktion (name, beschreibung, gueltig_bis)
    values (${name}, ${text(formData, "beschreibung") || null},
            ${text(formData, "gueltigBis") || null})
  `;
  revalidatePath("/codes");
}

/**
 * Fügt Codes in einen Vorrat ein.
 *
 * Das Einfügefeld nimmt, was kommt: eine Spalte aus Ditix, eine Zeile
 * mit Kommas, Leerzeichen dazwischen. Getrennt wird an allem, was kein
 * Code sein kann. Doppelte werden stillschweigend übergangen, denn beim
 * Einfügen einer langen Liste passiert das leicht.
 */
export async function codesEinfuegen(aktionId: string, formData: FormData): Promise<void> {
  await verlangeBuero();

  const roh = String(formData.get("codes") ?? "");
  const codes = [
    ...new Set(
      roh
        .split(/[^A-Za-z0-9_-]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length >= 4),
    ),
  ];

  if (codes.length === 0) {
    redirect(`/codes?meldung=${encodeURIComponent("Es waren keine Codes in dem Text.")}`);
  }

  // Ein Befehl für alle: Bei tausend Codes wären tausend Anfragen
  // sinnlos langsam.
  await db()`
    insert into aktionscode (aktion_id, code)
    select ${aktionId}::uuid, unnest(${codes}::text[])
    on conflict (aktion_id, code) do nothing
  `;

  revalidatePath("/codes");
  redirect(`/codes?eingefuegt=${codes.length}`);
}

/**
 * Vergibt Codes und verschickt sie.
 *
 * Reihenfolge mit Absicht: erst reservieren, dann verschicken. Ginge die
 * Mail zuerst hinaus und das Vermerken danach schief, stünde ein Code
 * beim Kunden, den das Programm noch für frei hält. Schlägt umgekehrt
 * der Versand fehl, werden die Codes wieder freigegeben.
 */
export async function codesVerschicken(formData: FormData): Promise<void> {
  const { name: bearbeiter } = await verlangeBuero();

  const empfaenger = text(formData, "empfaenger");
  const email = text(formData, "email");
  const anlass = text(formData, "anlass");
  const betreff = text(formData, "betreff");
  const einleitung = text(formData, "einleitung");

  // Je Aktion die gewünschte Anzahl, aus Feldern namens "anzahl:<id>".
  const wuensche: Array<{ aktionId: string; anzahl: number }> = [];
  for (const [feld, wert] of formData.entries()) {
    if (!feld.startsWith("anzahl:")) continue;
    const anzahl = Number(String(wert));
    if (Number.isFinite(anzahl) && anzahl > 0) {
      wuensche.push({ aktionId: feld.slice("anzahl:".length), anzahl: Math.min(anzahl, 20) });
    }
  }

  const fehler = (m: string) => `/codes?fehler=${encodeURIComponent(m.slice(0, 300))}`;
  let ziel = `/codes?verschickt=${encodeURIComponent(email)}`;

  if (!email) redirect(fehler("Ohne Mailadresse geht nichts hinaus."));
  if (wuensche.length === 0) redirect(fehler("Es wurde keine Aktion ausgewählt."));

  const vergeben: Array<{ aktion: string; codes: string[] }> = [];

  try {
    for (const w of wuensche) {
      /*
        Reservieren und Zuteilen in einem Befehl. Zwei Befehle
        nacheinander könnten sich zwei Mitarbeiter in die Quere kommen
        und denselben Code zweimal vergeben.
      */
      const zeilen = (await db()`
        update aktionscode
           set vergeben_am = now(), vergeben_von = ${bearbeiter},
               empfaenger = ${empfaenger || null}, empfaenger_email = ${email},
               anlass = ${anlass || null}
         where id in (
           select id from aktionscode
            where aktion_id = ${w.aktionId}::uuid and vergeben_am is null
            order by angelegt_am, code
            limit ${w.anzahl}
            for update skip locked
         )
        returning code, (select name from code_aktion where id = ${w.aktionId}::uuid) as aktion
      `) as Array<{ code: string; aktion: string }>;

      if (zeilen.length < w.anzahl) {
        throw new Error(
          `Im Vorrat "${zeilen[0]?.aktion ?? "der gewählten Aktion"}" liegen nicht genug freie Codes.`,
        );
      }
      vergeben.push({ aktion: zeilen[0].aktion, codes: zeilen.map((z) => z.code) });
    }

    const zeilenText = vergeben.flatMap((v) => [
      v.aktion + ":",
      ...v.codes.map((c) => "   " + c),
      "",
    ]);

    await mailVerschicken({
      an: email,
      betreff: betreff || "Ein Geschenk vom Florian Zimmer Theater",
      text: [einleitung, "", ...zeilenText].join(UMBRUCH).trim(),
    });
  } catch (f) {
    // Die schon reservierten Codes wieder freigeben, sonst sind sie
    // verbrannt, ohne dass jemand sie bekommen hat.
    const zurueck = vergeben.flatMap((v) => v.codes);
    if (zurueck.length > 0) {
      await db()`
        update aktionscode
           set vergeben_am = null, vergeben_von = null, empfaenger = null,
               empfaenger_email = null, anlass = null
         where code = any(${zurueck}::text[]) and empfaenger_email = ${email}
      `;
    }
    ziel = fehler(f instanceof Error ? f.message : "Unbekannter Fehler");
  }

  revalidatePath("/codes");
  redirect(ziel);
}

/** Zeilenumbruch als Konstante, damit kein Rückstrich nötig ist. */
const UMBRUCH = String.fromCharCode(10);
