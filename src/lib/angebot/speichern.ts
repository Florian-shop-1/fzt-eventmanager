"use server";

/**
 * Angebote erzeugen, verschicken und verfolgen.
 *
 * Der Ablauf:
 *   1. Angebot aus dem Vorgang erzeugen. Positionen kommen aus dem
 *      Artikelstamm, die Menüsorte richtet sich danach, ob die Gruppe in
 *      einer Loge sitzt.
 *   2. Das Angebot bekommt einen langen Zufallsschlüssel. Damit entsteht
 *      ein persönlicher Link für den Kunden, der ohne Anmeldung
 *      funktioniert und nicht zu erraten ist.
 *   3. Jeder Aufruf dieses Links wird protokolliert. So sieht das Team,
 *      wann und wie oft der Kunde hineingeschaut hat.
 *   4. Der Kunde kann über denselben Link zusagen.
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { holeVorgang } from "@/lib/db/vorgaenge";
import { planeAbend } from "@/lib/seating/abend";
import { abendpreise } from "@/lib/ditix/preise";
import {
  SCHLUSSTEXT,
  angebotsnummer,
  einleitungstext,
  erzeugePositionen,
  gueltigBis,
  type AngebotsOptionen,
} from "./erstellen";
import type { Vorgang } from "@/lib/domain/vorgang";

async function verlangeTeam(): Promise<string> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  if (!darfKaufmaennisches(benutzer.rolle)) {
    throw new Error("Für Angebote fehlt die Berechtigung.");
  }
  return benutzer.name;
}

/** Nächste freie Angebotsnummer im Format AG-MMJJ-NNNN. */
async function naechsteNummer(): Promise<string> {
  const jetzt = new Date();
  const praefix = angebotsnummer(jetzt, 0).slice(0, -4);
  const zeilen = (await db()`
    select nummer from angebot where nummer like ${praefix + "%"} order by nummer desc limit 1
  `) as Array<{ nummer: string }>;

  const letzte = zeilen.length > 0 ? Number(zeilen[0].nummer.split("-")[2]) : 1167;
  return angebotsnummer(jetzt, letzte + 1);
}

/**
 * Erzeugt ein Angebot für einen Vorgang.
 * Gibt es schon eines, entsteht ein weiteres: so bleibt nachvollziehbar,
 * was dem Kunden in welcher Fassung vorlag.
 */
export async function angebotErzeugen(
  vorgangId: string,
  optionen: AngebotsOptionen,
): Promise<{ angebotId: string }> {
  await verlangeTeam();

  const vorgang = await holeVorgang(vorgangId);
  if (!vorgang) throw new Error("Vorgang nicht gefunden.");

  // Der Sitzplan bestimmt, wer in der Loge sitzt und wie viele Plätze
  // blockiert bleiben. Ohne Termin gibt es keinen Plan, dann rechnet das
  // Angebot ohne Logenzuschlag.
  const plan = vorgang.vorstellung?.ditixEventId
    ? ((await planeAbend(vorgang.vorstellung.ditixEventId)).varianten[0] ?? null)
    : null;

  const fuerRechnung: Vorgang = {
    id: vorgang.id,
    nummer: vorgang.nummer,
    status: vorgang.status,
    kunde: { id: vorgang.kunde.id, name: vorgang.kunde.name, email: vorgang.kunde.email },
    vorstellung: vorgang.vorstellung
      ? { datum: vorgang.vorstellung.datum, show: vorgang.vorstellung.show }
      : { datum: new Date().toISOString().slice(0, 10), show: "Termin noch offen" },
    gruppen: vorgang.gruppen,
    angebote: [],
    zahlungen: [],
    notizen: [],
    aufgaben: [],
    quelle: vorgang.quelle ?? "",
    erstelltAm: vorgang.erstelltAm,
    geaendertAm: vorgang.erstelltAm,
  };

  // Die Preise dieser Vorstellung aus dem Ticketshop. Ohne Termin oder
  // bei nicht erreichbarem Shop bleibt es beim Artikelstamm, dann steht
  // der Hinweis darauf im Vorgang.
  let preise: Map<string, number> | undefined;
  if (vorgang.vorstellung?.ditixEventId) {
    try {
      preise = (await abendpreise(vorgang.vorstellung.ditixEventId)).cent;
    } catch {
      preise = undefined;
    }
  }

  const positionen = erzeugePositionen(fuerRechnung, plan, { ...optionen, preise });
  const nummer = await naechsteNummer();
  const jetzt = new Date();

  const angelegt = (await db()`
    insert into angebot (vorgang_id, nummer, gueltig_bis, einleitung, schlusstext, tracking_token)
    values (${vorgangId}, ${nummer}, ${gueltigBis(jetzt)},
            ${einleitungstext(fuerRechnung)}, ${SCHLUSSTEXT},
            ${randomBytes(24).toString("base64url")})
    returning id
  `) as Array<{ id: string }>;

  const angebotId = angelegt[0].id;

  // Positionen in zwei Durchgängen: erst die Hauptpositionen, damit die
  // Alternativen darauf verweisen können.
  const idZuordnung = new Map<string, string>();
  let sortierung = 0;

  for (const p of positionen.filter((x) => !x.istAlternativeZu)) {
    const zeile = (await db()`
      insert into position (angebot_id, artikel_nummer, bezeichnung, beschreibung, menge,
                            einheit, einzel_brutto_cent, ust, rabatt_prozent, sortierung)
      values (${angebotId}, ${p.artikelNummer}, ${p.bezeichnung}, ${p.beschreibung ?? null},
              ${p.menge}, ${p.einheit}, ${p.einzelBruttoCent}, ${p.ust},
              ${p.rabattProzent ?? null}, ${sortierung++})
      returning id
    `) as Array<{ id: string }>;
    idZuordnung.set(p.id, zeile[0].id);
  }

  for (const p of positionen.filter((x) => x.istAlternativeZu)) {
    await db()`
      insert into position (angebot_id, artikel_nummer, bezeichnung, beschreibung, menge,
                            einheit, einzel_brutto_cent, ust, rabatt_prozent,
                            ist_alternative_zu, sortierung)
      values (${angebotId}, ${p.artikelNummer}, ${p.bezeichnung}, ${p.beschreibung ?? null},
              ${p.menge}, ${p.einheit}, ${p.einzelBruttoCent}, ${p.ust},
              ${p.rabattProzent ?? null}, ${idZuordnung.get(p.istAlternativeZu!) ?? null},
              ${sortierung++})
    `;
  }

  await db()`
    update vorgang set status = 'angebot_erstellt', geaendert_am = now()
     where id = ${vorgangId} and status in ('anfrage', 'in_klaerung')
  `;

  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/vorgaenge");
  return { angebotId };
}

/** Markiert ein Angebot als verschickt. */
export async function angebotVersendet(angebotId: string, vorgangId: string): Promise<void> {
  await verlangeTeam();
  await db()`
    update angebot set versendet_am = coalesce(versendet_am, now()) where id = ${angebotId}
  `;
  await db()`
    update vorgang set status = 'angebot_versendet', geaendert_am = now()
     where id = ${vorgangId} and status = 'angebot_erstellt'
  `;
  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/vorgaenge");
}

/** Löscht ein Angebot, etwa nach einem Fehler beim Erstellen. */
export async function angebotLoeschen(angebotId: string, vorgangId: string): Promise<void> {
  await verlangeTeam();
  await db()`delete from angebot where id = ${angebotId}`;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}
