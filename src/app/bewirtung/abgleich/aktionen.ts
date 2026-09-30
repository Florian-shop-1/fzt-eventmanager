"use server";

/**
 * Belege und Abbuchungen zusammenbringen.
 *
 * Alles hier ist eine Zuordnung, keine Zahlung: Das Konto wird
 * ausschliesslich gelesen, geaendert wird nur, was im Eventmanager steht.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung } from "@/lib/auth/sitzung";
import {
  belegLoesen,
  belegZuordnen,
  keinBelegNoetig,
  regelAnlegen,
  regelLoeschen,
} from "@/lib/bewirtung/abgleich";

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfBuchhaltung(b)) throw new Error("Nur für die Buchhaltung.");
  return b!;
}

function zurueck(monat: string, meldung: string): never {
  revalidatePath("/bewirtung/abgleich");
  redirect(`/bewirtung/abgleich?m=${monat}&meldung=${encodeURIComponent(meldung)}`);
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function zuordnen(f: FormData): Promise<void> {
  const b = await zugang();
  await belegZuordnen(text(f, "umsatzId"), text(f, "belegId"), b.name);
  zurueck(text(f, "monat"), "Beleg zugeordnet.");
}

export async function loesen(f: FormData): Promise<void> {
  await zugang();
  await belegLoesen(text(f, "umsatzId"));
  zurueck(text(f, "monat"), "Wieder offen.");
}

export async function ohneBeleg(f: FormData): Promise<void> {
  const b = await zugang();
  const grund = text(f, "grund") || "braucht keinen Beleg";
  await keinBelegNoetig(text(f, "umsatzId"), grund, b.name);

  /*
    Auf Wunsch gilt der Grund auch beim naechsten Mal.

    Ein Gehalt, die Miete, der Strom: Dieselbe Abbuchung kommt jeden
    Monat wieder, und Werner hat den Grund bisher jedes Mal neu
    geschrieben. Das Haekchen macht daraus eine Regel auf den Namen des
    Empfaengers, und ab dann ist die Buchung von allein erledigt
    (Florian, 30.09.2026).

    Angelegt wird nur, was der Mensch angehakt hat. Eine Regel blendet
    kuenftige Buchungen aus der Liste aus, und das darf nie nebenbei
    passieren.
  */
  const muster = text(f, "muster");
  if (f.get("merken") && muster.length >= 3) {
    await regelAnlegen(muster, grund, b.name).catch(() => undefined);
    zurueck(
      text(f, "monat"),
      `Abgehakt. Gemerkt: Alles mit "${muster}" braucht künftig keinen Beleg.`,
    );
  }

  zurueck(text(f, "monat"), "Abgehakt.");
}

/**
 * Eine Regel fuer alles, was so heisst.
 *
 * Damit ist die Stromrechnung ein fuer alle Mal erledigt, statt jeden
 * Monat neu (Florian, 29.09.2026).
 */
export async function regelSpeichern(f: FormData): Promise<void> {
  const b = await zugang();
  try {
    await regelAnlegen(text(f, "muster"), text(f, "grund"), b.name);
  } catch (fehler) {
    zurueck(text(f, "monat"), fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.");
  }
  zurueck(text(f, "monat"), `Regel gespeichert: alles mit "${text(f, "muster")}" braucht keinen Beleg.`);
}

export async function regelWeg(f: FormData): Promise<void> {
  await zugang();
  await regelLoeschen(text(f, "id"));
  zurueck(text(f, "monat"), "Regel gelöscht.");
}
