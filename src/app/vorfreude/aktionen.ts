"use server";

/**
 * Die Knöpfe auf der Vorfreude-Seite.
 *
 * Der tägliche Lauf macht seine Arbeit von selbst. Trotzdem braucht es beides
 * von Hand: einen Versand, wenn die Uhr geschwiegen hat oder ein Tag nachgeholt
 * werden muss, und eine Probemail an die eigene Adresse, um zu sehen, was beim
 * Gast ankommt.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { buchungenFuerTag } from "@/lib/db/shop-buchungen";
import { widerspruchEintragen, widerspruchLoeschen } from "@/lib/db/werbewiderspruch";
import { baueVorfreudemail } from "@/lib/mail/vorfreude";
import { mailVerschicken } from "@/lib/mail/versand";
import { vorfreudeVerschicken } from "@/lib/mail/vorfreudelauf";

/** Nur Büro und Inhaber. Hier gehen Mails an Gäste raus. */
async function berechtigt() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Inhaber dürfen Gästemails verschicken.");
  }
  return benutzer;
}

function zurueck(datum: string, meldung: string): never {
  revalidatePath("/vorfreude");
  redirect(`/vorfreude?tag=${encodeURIComponent(datum)}&meldung=${encodeURIComponent(meldung)}`);
}

/** Verschickt die Mails für einen Showtag, jetzt. */
export async function jetztVerschicken(formular: FormData): Promise<void> {
  await berechtigt();
  const datum = String(formular.get("datum") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) zurueck("", "Kein gültiger Tag.");

  let meldung: string;
  try {
    const e = await vorfreudeVerschicken(datum);
    const teile = [`${e.verschickt.length} Mail(s) verschickt`];
    if (e.uebersprungen.length > 0) teile.push(`${e.uebersprungen.length} übersprungen`);
    if (e.fehler.length > 0) teile.push(`${e.fehler.length} fehlgeschlagen: ${e.fehler[0].meldung}`);
    meldung = teile.join(", ") + ".";
  } catch (f) {
    meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
  }
  zurueck(datum, meldung);
}

/**
 * Schickt die Mail eines Gastes an die eigene Adresse.
 *
 * Genau die Mail, die dieser Gast bekäme, mit seinen Bausteinen und seinen
 * Links. Nur eben an uns. Der Gast wird dabei NICHT als angeschrieben markiert.
 */
export async function probemailSchicken(formular: FormData): Promise<void> {
  const benutzer = await berechtigt();
  const datum = String(formular.get("datum") ?? "");
  const buchungId = String(formular.get("buchung") ?? "");

  let meldung: string;
  try {
    const buchung = (await buchungenFuerTag(datum)).find((b) => b.id === buchungId);
    if (!buchung) throw new Error("Diese Buchung gibt es nicht mehr.");
    const mail = baueVorfreudemail(buchung);
    await mailVerschicken({
      an: benutzer.email,
      betreff: `[Probe] ${mail.betreff}`,
      text: mail.text,
    });
    meldung = `Probemail an ${benutzer.email} ist raus.`;
  } catch (f) {
    meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
  }
  zurueck(datum, meldung);
}

/** Trägt einen Widerspruch von Hand ein, etwa nach einem Anruf. */
export async function widerspruchVonHand(formular: FormData): Promise<void> {
  await berechtigt();
  const email = String(formular.get("email") ?? "");
  const datum = String(formular.get("datum") ?? "");
  let meldung: string;
  try {
    await widerspruchEintragen(email, "hand");
    meldung = `${email.trim()} bekommt keine Werbemails mehr.`;
  } catch (f) {
    meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
  }
  zurueck(datum, meldung);
}

/** Nimmt einen Widerspruch zurück, wenn jemand ausdrücklich darum bittet. */
export async function widerspruchAufheben(formular: FormData): Promise<void> {
  await berechtigt();
  const email = String(formular.get("email") ?? "");
  const datum = String(formular.get("datum") ?? "");
  let meldung: string;
  try {
    await widerspruchLoeschen(email);
    meldung = `${email.trim()} steht nicht mehr auf der Liste.`;
  } catch (f) {
    meldung = f instanceof Error ? f.message : "Unbekannter Fehler";
  }
  zurueck(datum, meldung);
}
