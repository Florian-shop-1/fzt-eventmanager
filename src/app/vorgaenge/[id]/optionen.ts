"use server";

/**
 * Plätze für eine Firmenanfrage blockieren, verlängern, freigeben.
 *
 * Zwei verschiedene Plätze, zwei verschiedene Orte. Der Showplatz liegt
 * in FloTix: Golden Seats, Kat. 1 bis 3, VIP-Empore. Der Platz am Tisch
 * liegt hier, denn Loge und Eventgalerie kennt FloTix nicht
 * (siehe lib/db/essplatz.ts).
 *
 * Beides hängt am selben Knopf und an derselben Frist, damit niemand
 * das eine blockiert und das andere vergisst.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { optionAufheben, optionSetzen, optionVerlaengern, HOECHSTENS_TAGE } from "@/lib/flotix/option";
import { BEREICH_NAME, sperreAufheben, sperreSetzen, type Essbereich } from "@/lib/db/essplatz";

const zahl = (f: FormData, k: string) => Math.round(Number(String(f.get(k) ?? "")) || 0);

async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) {
    throw new Error("Plätze blockieren dürfen nur Florian und das Büro.");
  }
  return b;
}

/**
 * Vermerkt die blockierten Plaetze am juengsten offenen Angebot.
 *
 * Die Kundenseite liest sie von dort, damit sie dafuer nicht bei FloTix
 * anklopfen muss. Seit dem 28.10.2026 blockiert das Erstellen eines
 * Angebots nichts mehr von selbst, also wird es hier nachgetragen.
 */
async function amAngebotVermerken(
  vorgangId: string,
  plaetze: number,
  bis: Date | null,
): Promise<void> {
  await db()`
    update angebot
       set plaetze_gehalten = ${plaetze},
           plaetze_bis = ${bis ? bis.toISOString() : null}
     where id = (
       select a.id from angebot a
        where a.vorgang_id = ${vorgangId}::uuid
          and a.abgelehnt_am is null and a.angenommen_am is null
        order by a.erstellt_am desc limit 1
     )
  `.catch((f) => console.warn("[option] Plaetze nicht am Angebot vermerkt:", f));
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
    zurueck(vorgangId, "Erst den Abend festlegen, dann lassen sich Plätze blockieren.");
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

  /*
    Der Platz am Tisch, falls Kevin einen Bereich gewählt hat.

    "du musst auch Plätze auf eventgalerie oder loge blockieren können.
    auch wenn nicht feststeht wieviele menüs das sind" (Florian,
    28.10.2026). Ohne eigene Zahl gilt dieselbe Anzahl wie bei den
    Showplätzen: Wer kommt, sitzt auch am Tisch.
  */
  const roherBereich = String(formData.get("essbereich") ?? "").trim();
  const essbereich: Essbereich | null =
    roherBereich === "logen" || roherBereich === "eventgalerie" ? roherBereich : null;
  const essplaetze = Math.max(0, Math.min(400, zahl(formData, "essplaetze"))) || anzahl;

  let essText = "";
  if (essbereich) {
    const benutzer = await angemeldeterBenutzer();
    await sperreSetzen({
      vorgangId,
      bereich: essbereich,
      plaetze: essplaetze,
      bis,
      von: benutzer?.name ?? "",
    });
    essText = ` Dazu ${essplaetze} Plätze ${
      essbereich === "logen" ? "in der Loge" : "auf der Eventgalerie"
    }.`;
  }

  try {
    const e = await optionSetzen({
      vorstellungId: daten.vorstellung_id,
      anzahl,
      firma: daten.firma,
      vorgang: daten.nummer,
      bis,
      plaetze: gewaehlt.length > 0 ? gewaehlt : undefined,
    });
    await amAngebotVermerken(vorgangId, e.gesetzt, bis);
    const bisText = bis.toLocaleDateString("de-DE");
    if (e.fehlende > 0) {
      zurueck(
        vorgangId,
        `${e.gesetzt} Plätze blockiert bis ${bisText}. ${e.fehlende} waren nicht mehr frei.${essText}`,
      );
    }
    zurueck(vorgangId, `${e.gesetzt} Plätze blockiert bis ${bisText}.${essText}`);
  } catch (f) {
    if (f && typeof f === "object" && "digest" in f) throw f;
    zurueck(vorgangId, f instanceof Error ? f.message : "Das Blockieren hat nicht geklappt.");
  }
}

export async function optionLaengerHalten(vorgangId: string, formData: FormData): Promise<void> {
  await zugang();
  const daten = await vorgangsdaten(vorgangId);
  if (!daten) zurueck(vorgangId, "Diesen Vorgang gibt es nicht mehr.");

  const tage = Math.max(1, Math.min(HOECHSTENS_TAGE, zahl(formData, "tage") || 3));
  const bis = new Date(Date.now() + tage * 24 * 60 * 60 * 1000);

  try {
    const e = await optionVerlaengern(daten.nummer, bis);
    await amAngebotVermerken(vorgangId, e.plaetze, bis);
    zurueck(vorgangId, `Blockierung verlängert bis ${bis.toLocaleDateString("de-DE")}.`);
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
    await amAngebotVermerken(vorgangId, 0, null);
    // Der Tisch geht mit: Wer die Showplätze freigibt, hält niemandem
    // mehr einen Platz in der Loge frei.
    await sperreAufheben(vorgangId);
    zurueck(vorgangId, `${e.freigegeben} Plätze sind wieder frei, auch die am Tisch.`);
  } catch (f) {
    if (f && typeof f === "object" && "digest" in f) throw f;
    zurueck(vorgangId, f instanceof Error ? f.message : "Das Freigeben hat nicht geklappt.");
  }
}

/**
 * Nur die Plaetze am Tisch, ohne Showplaetze.
 *
 * Es gibt Abende, an denen die Showplaetze laengst stehen und sich nur
 * die Zahl am Tisch aendert, etwa wenn zehn Leute mehr mitessen.
 */
export async function essplaetzeBlockieren(vorgangId: string, formData: FormData): Promise<void> {
  const benutzer = await zugang();
  const roh = String(formData.get("essbereich") ?? "").trim();
  if (roh !== "logen" && roh !== "eventgalerie") {
    zurueck(vorgangId, "Bitte Loge oder Eventgalerie wählen.");
  }
  const bereich = roh as Essbereich;
  const plaetze = Math.max(1, Math.min(400, zahl(formData, "essplaetze")));
  const tage = Math.max(1, Math.min(HOECHSTENS_TAGE, zahl(formData, "tage") || 3));
  const bis = new Date(Date.now() + tage * 24 * 60 * 60 * 1000);

  await sperreSetzen({ vorgangId, bereich, plaetze, bis, von: benutzer.name });
  zurueck(
    vorgangId,
    `${plaetze} Plätze ${BEREICH_NAME[bereich] === "Loge" ? "in der Loge" : "auf der Eventgalerie"} blockiert bis ${bis.toLocaleDateString("de-DE")}.`,
  );
}

/** Einen einzelnen Bereich wieder freigeben. */
export async function essplaetzeFreigeben(
  vorgangId: string,
  bereich: Essbereich,
): Promise<void> {
  await zugang();
  await sperreAufheben(vorgangId, bereich);
  zurueck(vorgangId, `Die Plätze ${bereich === "logen" ? "in der Loge" : "auf der Eventgalerie"} sind wieder frei.`);
}
