"use server";

/**
 * Was ein Mensch mit einer gescannten Visitenkarte macht:
 * berichtigen, übernehmen oder wegwerfen.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { karteAendern, karteLesen, karteStand, schonUebertragen } from "@/lib/visitenkarte/db";
import { karteNachBrevo } from "@/lib/visitenkarte/brevo";

const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Visitenkarten darf nur das Büro übernehmen.");
  return b;
}

function zurueck(meldung: string): never {
  revalidatePath("/visitenkarten");
  redirect(`/visitenkarten?meldung=${encodeURIComponent(meldung)}`);
}

/**
 * Berichtigen und nachschicken.
 *
 * Übertragen wird schon beim Scannen, von selbst. Hier geht es um die
 * Karten, bei denen etwas nicht stimmte: eine falsch gelesene Adresse,
 * eine fehlende, oder eine, die Brevo abgelehnt hat. Die Felder aus dem
 * Formular gelten, nicht die aus der Datenbank.
 *
 * Eine berichtigte Adresse geht noch einmal an Brevo. Die alte, falsch
 * gelesene bleibt dort stehen; sie bekommt nie eine Mail, weil es sie
 * nicht gibt, und sie fällt im Verteiler-Aufräumen als Bounce auf.
 */
export async function karteUebernehmen(f: FormData): Promise<void> {
  await zugang();
  const id = text(f, "id", 40);

  await karteAendern(id, {
    vorname: text(f, "vorname", 80),
    nachname: text(f, "nachname", 80),
    firma: text(f, "firma", 120),
    position: text(f, "position", 120),
    email: text(f, "email", 160).toLowerCase(),
    telefon: text(f, "telefon", 60),
    webseite: text(f, "webseite", 160),
    notiz: text(f, "notiz", 300),
  });

  const karte = await karteLesen(id);
  if (!karte) zurueck("Diese Karte gibt es nicht mehr.");

  if (await schonUebertragen(karte.email, id)) {
    await karteStand(id, "verworfen", "Diese Adresse war schon übertragen.");
    zurueck(`${karte.email} steht schon in den Magic News. Die Karte ist abgelegt.`);
  }

  const ergebnis = await karteNachBrevo(karte);
  if (!ergebnis.ok) {
    await karteStand(id, "neu", ergebnis.meldung);
    zurueck(ergebnis.meldung);
  }

  await karteStand(id, "uebertragen");
  zurueck(`${karte.vorname || karte.email} ist drin: ${ergebnis.meldung}`);
}

/** Nichts für uns: doppelt, unleserlich, oder jemand, den wir nicht anschreiben. */
export async function karteVerwerfen(f: FormData): Promise<void> {
  await zugang();
  const id = text(f, "id", 40);
  await karteStand(id, "verworfen", text(f, "grund", 200));
  zurueck("Karte weggelegt. Es geht keine Mail hinaus.");
}

/** Doch noch einmal ansehen: zurück in die Liste. */
export async function karteZurueckholen(f: FormData): Promise<void> {
  await zugang();
  await karteStand(text(f, "id", 40), "neu");
  zurueck("Die Karte liegt wieder zum Prüfen bereit.");
}
