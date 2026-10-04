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
import { angemeldeterBenutzer, darfEinladen, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { datumMitWochentag } from "@/lib/zeit";
import { dienstSetzen, dienstWeg, festSetzen, foyerDienstLesen, foyerLeute, zeitenSetzen } from "@/lib/foyer/dienstplan";
import { uebernahmeAnbieten, uebernahmeEntscheiden, uebernahmeLesen } from "@/lib/dienstplan/uebernahme";

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
 * Trägt alle Plätze eines Tages in einem Rutsch ein.
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

  /*
    Welche Plaetze das Formular geschickt hat.

    Frueher lief die Schleife fest von 1 bis 3. Seit es beliebig viele
    weitere Plaetze gibt, zaehlt das Formular: Jede Zeile schickt ihr
    eigenes Feld benutzerN mit (Florian, 04.10.2026).
  */
  const nummern = [...f.keys()]
    .map((k) => /^benutzer(\d+)$/.exec(k)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .filter((n) => n >= 1 && n <= 20)
    .sort((a, b) => a - b);

  for (const nummer of new Set(nummern)) {
    const wert = text(f, `benutzer${nummer}`, 40);
    const von = text(f, `von${nummer}`, 5);
    const bis = text(f, `bis${nummer}`, 5);
    const person = wert && wert !== "offen" ? leute.find((p) => p.id === wert) : undefined;

    // Ein zusaetzlicher Platz ohne Person verschwindet wieder, sonst
    // waechst die Liste bei jedem Speichern um eine leere Zeile.
    if (!person && nummer > 2) {
      await dienstWeg(datum, nummer);
      continue;
    }

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
            `${datumMitWochentag(datum)}, ${von || "?"} bis ${bis || "?"} Uhr.`,
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

/**
 * Eine besetzte Schicht übernehmen, um die Person zu entlasten. Gehört sie
 * einer Aushilfe, gilt das sofort. Gehört sie jemand Festangestelltem,
 * entscheiden erst Florian oder Kevin (Florian, 28.09.2026).
 */
export async function foyerUebernehmenAnbieten(f: FormData): Promise<void> {
  const b = await darfPlanen();
  const id = text(f, "id", 40);
  const dienst = await foyerDienstLesen(id);
  if (!dienst || !dienst.benutzerId) zurueck("Diese Schicht gibt es nicht mehr.");
  if (dienst.benutzerId === b.id) zurueck("Das ist schon deine Schicht.");

  const leute = await foyerLeute();
  const bisheriger = leute.find((p) => p.id === dienst.benutzerId);
  if (!bisheriger) zurueck("Diese Person arbeitet nicht mehr im Foyer.");

  if (!bisheriger.fest) {
    await dienstSetzen({
      datum: dienst.datum,
      nummer: dienst.nummer,
      benutzerId: b.id,
      von: dienst.von,
      bis: dienst.bis,
      freigabe: "nicht_noetig",
      von_wem: b.name,
    });
    await uebernahmeAnbieten({
      bereich: "foyer",
      foyerDienstId: dienst.id,
      bisherigerId: bisheriger.id,
      bisherigerName: bisheriger.name,
      anbieterId: b.id,
      anbieterName: b.name,
      sofortAngenommen: true,
    });
    await mailVerschicken({
      an: bisheriger.email,
      betreff: `${b.name} übernimmt deinen Foyerdienst am ${datumMitWochentag(dienst.datum)}`,
      text: [
        `Hallo ${bisheriger.name.split(" ")[0]},`,
        "",
        `gute Nachricht: ${b.name} übernimmt für dich: ${datumMitWochentag(dienst.datum)}, ${dienst.von || "?"} bis ${dienst.bis || "?"} Uhr. Du hast an diesem Termin frei.`,
        "",
        `Plan ansehen: ${APP}/foyer/plan`,
      ].join("\n"),
    }).catch(() => undefined);
    zurueck(`Danke! Du hast den Foyerdienst übernommen, ${bisheriger.name.split(" ")[0]} ist entlastet.`);
  }

  await uebernahmeAnbieten({
    bereich: "foyer",
    foyerDienstId: dienst.id,
    bisherigerId: bisheriger.id,
    bisherigerName: bisheriger.name,
    anbieterId: b.id,
    anbieterName: b.name,
    sofortAngenommen: false,
  });
  for (const e of await zuInformieren()) {
    await mailVerschicken({
      an: e.email,
      betreff: `Freigabe nötig: ${b.name} will ${bisheriger.name}s Foyerdienst übernehmen`,
      text: [
        `Hallo ${e.name.split(" ")[0]},`,
        "",
        `${b.name} möchte ${bisheriger.name}s Foyerdienst übernehmen, um ihn oder sie zu entlasten.`,
        `${bisheriger.name} ist fest angestellt, deshalb braucht die Übernahme erst eure Freigabe.`,
        "",
        `${datumMitWochentag(dienst.datum)}, ${dienst.von || "?"} bis ${dienst.bis || "?"} Uhr.`,
        "",
        `Im Eventmanager entscheiden: ${APP}/foyer/plan#uebernahme`,
      ].join("\n"),
    }).catch(() => undefined);
  }
  zurueck(`Angefragt. ${bisheriger.name.split(" ")[0]} ist fest angestellt, deshalb entscheiden erst Florian oder Kevin.`, "#uebernahme");
}

/** Florian oder Kevin entscheiden über eine Übernahme-Anfrage einer festen Schicht. */
export async function foyerUebernahmeEntscheiden(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b || (b.rolle !== "chef" && !darfEinladen(b))) throw new Error("Das dürfen nur Florian und Kevin.");

  const id = text(f, "id", 40);
  const angenommen = text(f, "status", 20) === "angenommen";
  const antrag = await uebernahmeLesen(id);
  if (!antrag || antrag.status !== "offen" || antrag.bereich !== "foyer" || !antrag.foyerDienstId) {
    zurueck("Diese Anfrage ist nicht mehr offen.");
  }

  const dienst = await foyerDienstLesen(antrag.foyerDienstId);
  const leute = await foyerLeute();
  const anbieter = leute.find((p) => p.id === antrag.anbieterId);

  if (angenommen && dienst) {
    await dienstSetzen({
      datum: dienst.datum,
      nummer: dienst.nummer,
      benutzerId: antrag.anbieterId,
      von: dienst.von,
      bis: dienst.bis,
      freigabe: "nicht_noetig",
      von_wem: b.name,
    });
  }
  if (dienst && anbieter) {
    await mailVerschicken({
      an: anbieter.email,
      betreff: angenommen
        ? `Angenommen: du übernimmst den Foyerdienst am ${datumMitWochentag(dienst.datum)}`
        : `Abgelehnt: Foyerdienst am ${datumMitWochentag(dienst.datum)}`,
      text: [
        `Hallo ${anbieter.name.split(" ")[0]},`,
        "",
        angenommen
          ? `deine Anfrage ist angenommen, du bist jetzt eingeteilt: ${datumMitWochentag(dienst.datum)}, ${dienst.von || "?"} bis ${dienst.bis || "?"} Uhr.`
          : `deine Anfrage, ${antrag.bisherigerName}s Foyerdienst zu übernehmen, wurde abgelehnt.`,
        "",
        `Plan ansehen: ${APP}/foyer/plan`,
      ].join("\n"),
    }).catch(() => undefined);
  }

  await uebernahmeEntscheiden(id, angenommen ? "angenommen" : "abgelehnt", "", b.name);
  zurueck(angenommen ? "Übernahme freigegeben." : "Übernahme abgelehnt.", "#uebernahme");
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
