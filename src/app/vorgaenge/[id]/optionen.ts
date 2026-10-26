"use server";

/**
 * Plätze für eine Firmenanfrage optionieren, verlängern, freigeben.
 *
 * Gehalten werden sie in FloTix, dort stehen die Plätze. Hier steht nur
 * die Entscheidung: wie viele und wie lange.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { optionAufheben, optionSetzen, optionVerlaengern, HOECHSTENS_TAGE } from "@/lib/flotix/option";

const zahl = (f: FormData, k: string) => Math.round(Number(String(f.get(k) ?? "")) || 0);

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) {
    throw new Error("Plätze optionieren dürfen nur Florian und das Büro.");
  }
  return b;
}

function zurueck(vorgangId: string, meldung: string): never {
  revalidatePath(`/vorgaenge/${vorgangId}`);
  redirect(`/vorgaenge/${vorgangId}?meldung=${encodeURIComponent(meldung)}`);
}

/** Die Kennung der Vorstellung in FloTix, dazu die Vorgangsnummer. */
async function vorgangsdaten(vorgangId: string) {
  const [z] = (await db()`
    select v.nummer,
           coalesce(s.ditix_event_id, '') as vorstellung_id,
           coalesce(k.name, 'Firmenanfrage') as firma
      from vorgang v
      left join vorstellung s on s.id = v.vorstellung_id
      left join kunde k on k.id = v.kunde_id
     where v.id = ${vorgangId}::uuid
  `) as Array<{ nummer: string; vorstellung_id: string; firma: string }>;
  return z;
}

export async function plaetzeOptionieren(vorgangId: string, formData: FormData): Promise<void> {
  await zugang();
  const daten = await vorgangsdaten(vorgangId);
  if (!daten) zurueck(vorgangId, "Diesen Vorgang gibt es nicht mehr.");
  if (!daten.vorstellung_id) {
    zurueck(vorgangId, "Erst den Abend festlegen, dann lassen sich Plätze optionieren.");
  }

  const tage = Math.max(1, Math.min(HOECHSTENS_TAGE, zahl(formData, "tage") || 3));
  const bis = new Date(Date.now() + tage * 24 * 60 * 60 * 1000);

  /*
    Die angeklickten Plaetze, als "Reihe|Platz" durch Komma getrennt.

    Hat Kevin welche ausgesucht, gelten genau die. Sonst zaehlt die
    Anzahl, und FloTix nimmt die besten freien von vorne
    (Florian, 26.10.2026).
  */
  const gewaehlt = String(formData.get("plaetze") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 400)
    .map((x) => {
      const [reihe, platz] = x.split("|");
      return { reihe: (reihe ?? "").trim(), platz: (platz ?? "").trim() };
    })
    .filter((x) => x.reihe && x.platz);

  const anzahl =
    gewaehlt.length > 0 ? gewaehlt.length : Math.max(1, Math.min(400, zahl(formData, "anzahl")));

  try {
    const e = await optionSetzen({
      vorstellungId: daten.vorstellung_id,
      anzahl,
      firma: daten.firma,
      vorgang: daten.nummer,
      bis,
      plaetze: gewaehlt.length > 0 ? gewaehlt : undefined,
    });
    const bisText = bis.toLocaleDateString("de-DE");
    if (e.fehlende > 0) {
      zurueck(
        vorgangId,
        `${e.gesetzt} Plätze optioniert bis ${bisText}. ${e.fehlende} waren nicht mehr frei.`,
      );
    }
    zurueck(vorgangId, `${e.gesetzt} Plätze optioniert bis ${bisText}.`);
  } catch (f) {
    if (f && typeof f === "object" && "digest" in f) throw f;
    zurueck(vorgangId, f instanceof Error ? f.message : "Die Option hat nicht geklappt.");
  }
}

export async function optionLaengerHalten(vorgangId: string, formData: FormData): Promise<void> {
  await zugang();
  const daten = await vorgangsdaten(vorgangId);
  if (!daten) zurueck(vorgangId, "Diesen Vorgang gibt es nicht mehr.");

  const tage = Math.max(1, Math.min(HOECHSTENS_TAGE, zahl(formData, "tage") || 3));
  const bis = new Date(Date.now() + tage * 24 * 60 * 60 * 1000);

  try {
    await optionVerlaengern(daten.nummer, bis);
    zurueck(vorgangId, `Option verlängert bis ${bis.toLocaleDateString("de-DE")}.`);
  } catch (f) {
    if (f && typeof f === "object" && "digest" in f) throw f;
    zurueck(vorgangId, f instanceof Error ? f.message : "Das Verlängern hat nicht geklappt.");
  }
}

export async function optionFreigeben(vorgangId: string): Promise<void> {
  await zugang();
  const daten = await vorgangsdaten(vorgangId);
  if (!daten) zurueck(vorgangId, "Diesen Vorgang gibt es nicht mehr.");

  try {
    const e = await optionAufheben(daten.nummer);
    zurueck(vorgangId, `${e.freigegeben} Plätze sind wieder frei.`);
  } catch (f) {
    if (f && typeof f === "object" && "digest" in f) throw f;
    zurueck(vorgangId, f instanceof Error ? f.message : "Das Freigeben hat nicht geklappt.");
  }
}
