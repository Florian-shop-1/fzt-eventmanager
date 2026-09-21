"use server";

/**
 * Der Foyerdienst: einteilen, Zeiten ändern, Aushilfen freigeben.
 *
 * Sarah plant. Ihre feste Mitarbeiterin trägt sie ohne Rückfrage ein,
 * jede Aushilfe geht als Anfrage an Kevin und Florian. Erst mit deren
 * Freigabe bekommt die Aushilfe ihre Mail und gilt als eingeteilt
 * (Florian, 22.09.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { datumMitWochentag } from "@/lib/zeit";
import {
  dienstSetzen,
  festSetzen,
  foyerLeute,
  freigabeSetzen,
  zeitenSetzen,
} from "@/lib/foyer/dienstplan";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

/** Sarah, das Büro und die Chefs dürfen planen. */
async function darfPlanen() {
  const b = await angemeldeterBenutzer();
  if (!b || !["chef", "team", "foyer"].includes(b.rolle)) throw new Error("Nicht erlaubt.");
  return b;
}

/** Freigeben dürfen nur Kevin und Florian. */
async function darfFreigeben() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Freigeben dürfen nur Kevin und Florian.");
  return b;
}

function zurueck(meldung: string, anker = ""): never {
  revalidatePath("/foyer/plan");
  revalidatePath("/", "layout");
  redirect(`/foyer/plan?meldung=${encodeURIComponent(meldung)}${anker}`);
}

/** Wer die Freigaben bekommt: Kevin und die Geschäftsführung. */
async function freigeber(): Promise<Array<{ name: string; email: string }>> {
  return (await db()`
    select name, email from benutzer
     where aktiv and (rolle = 'chef' or lower(email) = 'kevin.steele@florianzimmer.com')
  `) as Array<{ name: string; email: string }>;
}

export async function eintragen(f: FormData): Promise<void> {
  const b = await darfPlanen();
  const datum = text(f, "datum", 10);
  const nummer = Math.max(1, Math.min(3, Number(text(f, "nummer", 2)) || 1));
  const wert = text(f, "benutzer", 40);
  const von = text(f, "von", 5);
  const bis = text(f, "bis", 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) zurueck("Dieser Tag geht nicht.");

  if (!wert || wert === "offen") {
    await dienstSetzen({ datum, nummer, benutzerId: null, von, bis, freigabe: "nicht_noetig", von_wem: b.name });
    zurueck(`${datumMitWochentag(datum)}: Platz ${nummer} ist wieder offen.`);
  }

  const leute = await foyerLeute();
  const person = leute.find((p) => p.id === wert);
  if (!person) zurueck("Diese Person gibt es nicht.");

  const braucht = !person.fest;
  await dienstSetzen({
    datum,
    nummer,
    benutzerId: person.id,
    von,
    bis,
    freigabe: braucht ? "angefragt" : "nicht_noetig",
    von_wem: b.name,
  });

  if (braucht) {
    for (const e of await freigeber()) {
      await mailVerschicken({
        an: e.email,
        betreff: `Foyer: Aushilfe für ${datumMitWochentag(datum)} freigeben?`,
        text: [
          `Hallo ${e.name.split(" ")[0]},`,
          "",
          `${b.name} möchte ${person.name} als Aushilfe im Foyer einteilen:`,
          `${datumMitWochentag(datum)}, ${von || "?"} bis ${bis || "?"} Uhr (Platz ${nummer}).`,
          "",
          `Freigeben oder ablehnen: ${APP}/foyer/plan`,
        ].join("\n"),
      }).catch(() => undefined);
    }
    zurueck(`${person.name} ist eingetragen, die Freigabe ist bei Kevin und Florian.`);
  }

  const adresse = (await db()`select email from benutzer where id = ${person.id}`) as Array<{ email: string }>;
  await mailVerschicken({
    an: adresse[0]?.email ?? "",
    betreff: `Foyerdienst am ${datumMitWochentag(datum)}`,
    text: [
      `Hallo ${person.name.split(" ")[0]},`,
      "",
      `du bist im Foyer eingeteilt: ${datumMitWochentag(datum)}, ${von || "?"} bis ${bis || "?"} Uhr.`,
      "",
      `Der Plan steht im Eventmanager: ${APP}/foyer/plan`,
    ].join("\n"),
  }).catch(() => undefined);

  zurueck(`${person.name} ist für ${datumMitWochentag(datum)} eingeteilt.`);
}

export async function zeiten(f: FormData): Promise<void> {
  const b = await darfPlanen();
  const datum = text(f, "datum", 10);
  const nummer = Math.max(1, Math.min(3, Number(text(f, "nummer", 2)) || 1));
  await zeitenSetzen({
    datum,
    nummer,
    von: text(f, "von", 5),
    bis: text(f, "bis", 5),
    notiz: text(f, "notiz"),
    von_wem: b.name,
  });
  zurueck("Zeiten gespeichert.");
}

export async function freigeben(f: FormData): Promise<void> {
  const b = await darfFreigeben();
  const id = text(f, "id", 40);
  const ja = text(f, "wie", 10) === "ja";
  const d = await freigabeSetzen(id, ja, b.name);
  if (!d) zurueck("Diesen Eintrag gibt es nicht mehr.");

  const z = (await db()`
    select b.name, b.email from foyer_dienst d join benutzer b on b.id = d.benutzer_id where d.id = ${id}
  `) as Array<{ name: string; email: string }>;

  if (ja && z[0]) {
    await mailVerschicken({
      an: z[0].email,
      betreff: `Foyerdienst am ${datumMitWochentag(d.datum)}`,
      text: [
        `Hallo ${z[0].name.split(" ")[0]},`,
        "",
        `du bist im Foyer eingeteilt: ${datumMitWochentag(d.datum)}, ${d.von || "?"} bis ${d.bis || "?"} Uhr.`,
        "",
        `Der Plan steht im Eventmanager: ${APP}/foyer/plan`,
      ].join("\n"),
    }).catch(() => undefined);
  }

  // Sarah erfährt in jedem Fall, wie entschieden wurde.
  const planer = (await db()`
    select name, email from benutzer where aktiv and rolle = 'foyer'
  `) as Array<{ name: string; email: string }>;
  for (const p of planer) {
    await mailVerschicken({
      an: p.email,
      betreff: ja ? "Aushilfe fürs Foyer ist freigegeben" : "Aushilfe fürs Foyer wurde nicht freigegeben",
      text: [
        `Hallo ${p.name.split(" ")[0]},`,
        "",
        `${b.name} hat die Aushilfe für ${datumMitWochentag(d.datum)} ${ja ? "freigegeben" : "abgelehnt"}.`,
        "",
        `Plan ansehen: ${APP}/foyer/plan`,
      ].join("\n"),
    }).catch(() => undefined);
  }

  zurueck(ja ? "Freigegeben." : "Abgelehnt, Sarah hat Bescheid.");
}

/** Wer fest angestellt ist, legt nur das Büro fest. */
export async function festMarkieren(f: FormData): Promise<void> {
  await darfFreigeben();
  await festSetzen(text(f, "id", 40), text(f, "fest", 3) === "ja");
  zurueck("Gespeichert.", "#leute");
}
