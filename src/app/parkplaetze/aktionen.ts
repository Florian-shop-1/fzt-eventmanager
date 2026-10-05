"use server";

/**
 * Parkplätze von Hand vergeben und wieder zurücknehmen.
 *
 * Betrifft nur unsere eigene Liste. An der Tabelle des Ticketshops ändert
 * sich nichts, dort wird weiterhin ausschließlich gelesen.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  darfParkplatzEintragen,
  parkplatzVonHand,
  parkplatzWeg,
} from "@/lib/shop/parkplatz-hand";
import { alsGedrucktMerken, druckvermerkWeg } from "@/lib/shop/parkplatz-gedruckt";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfParkplatzEintragen(b)) {
    throw new Error("Parkplätze vergeben dürfen nur Florian, Kevin und das Foyer.");
  }
  return b!;
}

function zurueck(abend: string, meldung: string): never {
  revalidatePath("/parkplaetze");
  redirect(`/parkplaetze?abend=${encodeURIComponent(abend)}&meldung=${encodeURIComponent(meldung)}`);
}

export async function parkplatzEintragen(f: FormData): Promise<void> {
  const b = await zugang();
  const abend = text(f, "abend");

  try {
    await parkplatzVonHand({
      datum: text(f, "datum"),
      name: text(f, "name"),
      email: text(f, "email"),
      anzahl: Number(text(f, "anzahl")) || 1,
      notiz: text(f, "notiz"),
      erfasstVon: b.name,
    });
  } catch (fehler) {
    if (fehler && typeof fehler === "object" && "digest" in fehler) throw fehler;
    zurueck(abend, fehler instanceof Error ? fehler.message : "Das hat nicht geklappt.");
  }

  zurueck(abend, `${text(f, "name")} hat einen Parkplatz. Das Schild wird mitgedruckt.`);
}

export async function parkplatzLoeschen(f: FormData): Promise<void> {
  await zugang();
  await parkplatzWeg(text(f, "id"));
  zurueck(text(f, "abend"), "Parkplatz wieder entfernt.");
}

/**
 * Ein Schild abhaken, oder den Haken zuruecknehmen.
 *
 * Der Haken heisst: gedruckt UND draussen am Platz aufgehaengt
 * (Florian, 05.10.2026). Deshalb von Hand und nicht beim Drucken, denn
 * ein Stapel im Buero hilft dem Gast nicht. Zuruecknehmen geht jederzeit,
 * ein Fehlklick soll niemanden festhalten.
 */
export async function schildAbhaken(f: FormData): Promise<void> {
  const b = await zugang();
  const abend = text(f, "abend");
  const datum = text(f, "datum");
  const orderId = text(f, "orderId");
  const name = text(f, "name");

  if (!datum || !orderId) zurueck(abend, "Dieses Schild gibt es nicht.");

  if (text(f, "an") === "nein") {
    await druckvermerkWeg(datum, orderId);
    zurueck(abend, `${name || "Das Schild"} gilt wieder als offen.`);
  }

  await alsGedrucktMerken({ datum, orderId, von: b.name });
  zurueck(abend, `${name || "Schild"}: hängt draußen, abgehakt.`);
}
