"use server";

/**
 * Der Foyerdienst: einteilen, Zeiten ändern.
 *
 * Sarah plant. Ihre festen Mitarbeiterinnen trägt sie ohne Rückfrage ein,
 * jede Aushilfe genauso, Kevin und Florian bekommen nur noch eine
 * Info-Mail, keine Freigabe mehr nötig (Florian, 25.09.2026).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { datumMitWochentag } from "@/lib/zeit";
import { dienstSetzen, festSetzen, foyerLeute, zeitenSetzen } from "@/lib/foyer/dienstplan";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

/** Sarah, das Büro und die Chefs dürfen planen. */
async function darfPlanen() {
  const b = await angemeldeterBenutzer();
  if (!b || !["chef", "team", "foyer"].includes(b.rolle)) throw new Error("Nicht erlaubt.");
  return b;
}

/** Wer fest angestellt ist, legt nur das Büro fest. */
async function darfBuero() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Das dürfen nur Kevin und Florian.");
  return b;
}

function zurueck(meldung: string, anker = ""): never {
  revalidatePath("/foyer/plan");
  revalidatePath("/", "layout");
  redirect(`/foyer/plan?meldung=${encodeURIComponent(meldung)}${anker}`);
}

/** Wer die Info-Mail zu Aushilfen bekommt: Kevin und die Geschäftsführung. */
async function zuInformieren(): Promise<Array<{ name: string; email: string }>> {
  return (await db()`
    select name, email from benutzer
     where aktiv and (rolle = 'chef' or lower(email) = 'kevin.steele@florianzimmer.com')
  `) as Array<{ name: string; email: string }>;
}

/**
 * Trägt alle drei Plätze eines Tages in einem Rutsch ein.
 *
 * Vorher hatte jeder Platz sein eigenes Formular mit eigenem Knopf. Änderte
 * Sarah mehrere Plätze und klickte nur bei einem "Eintragen", gingen die
 * anderen Änderungen beim Neuladen der Seite verloren, ohne dass sie es
 * bemerkte: die Person "fiel raus" (Sarah, 25.09.2026). Ein Formular für
 * den ganzen Tag mit einem Knopf macht das unmöglich.
 */
export async function tagEintragen(f: FormData): Promise<void> {
  const b = await darfPlanen();
  const datum = text(f, "datum", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) zurueck("Dieser Tag geht nicht.");

  const leute = await foyerLeute();
  const bestehend = (await db()`
    select nummer, benutzer_id from foyer_dienst where datum = ${datum}::date
  `) as Array<{ nummer: number; benutzer_id: string | null }>;
  const vorher = new Map(bestehend.map((r) => [r.nummer, r.benutzer_id]));

  const eingeteilt: string[] = [];

  for (let nummer = 1; nummer <= 3; nummer++) {
    const wert = text(f, `benutzer${nummer}`, 40);
    const von = text(f, `von${nummer}`, 5);
    const bis = text(f, `bis${nummer}`, 5);
    const person = wert && wert !== "offen" ? leute.find((p) => p.id === wert) : undefined;

    await dienstSetzen({
      datum,
      nummer,
      benutzerId: person?.id ?? null,
      von,
      bis,
      freigabe: "nicht_noetig",
      von_wem: b.name,
    });

    // Nur bei einer echten Änderung Mails schicken, sonst bekäme jeder
    // unveränderte Platz bei jedem Speichern erneut eine Mail.
    if (!person || vorher.get(nummer) === person.id) continue;
    eingeteilt.push(person.name);

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

    // Keine Freigabe mehr nötig, Kevin und Florian bekommen nur noch Bescheid.
    if (!person.fest) {
      for (const e of await zuInformieren()) {
        await mailVerschicken({
          an: e.email,
          betreff: `Foyer: Aushilfe für ${datumMitWochentag(datum)} eingeteilt`,
          text: [
            `Hallo ${e.name.split(" ")[0]},`,
            "",
            `${b.name} hat ${person.name} als Aushilfe im Foyer eingeteilt:`,
            `${datumMitWochentag(datum)}, ${von || "?"} bis ${bis || "?"} Uhr (Platz ${nummer}).`,
            "",
            `Nur zur Info, keine Aktion nötig: ${APP}/foyer/plan`,
          ].join("\n"),
        }).catch(() => undefined);
      }
    }
  }

  zurueck(
    eingeteilt.length > 0
      ? `${datumMitWochentag(datum)}: ${eingeteilt.join(", ")} eingetragen.`
      : `${datumMitWochentag(datum)} gespeichert.`,
  );
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

/** Wer fest angestellt ist, legt nur das Büro fest. */
export async function festMarkieren(f: FormData): Promise<void> {
  await darfBuero();
  await festSetzen(text(f, "id", 40), text(f, "fest", 3) === "ja");
  zurueck("Gespeichert.", "#leute");
}
