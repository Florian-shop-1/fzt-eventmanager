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
import { artikel } from "@/lib/domain/artikel";
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
import type { Variante } from "./ablaufplan";
import type { Vorgang } from "@/lib/domain/vorgang";
import { vormerkungNachziehen } from "@/lib/kueche/vormerkung";

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

  /*
    Die Preise dieser Vorstellung aus dem Ticketshop.

    Steht noch kein Termin fest, wird fuer einen Wochentag angeboten.
    Dann gelten die Preise der naechsten Vorstellung an genau diesem
    Wochentag: "so dass der Kunde sieht, dass es Donnerstag guenstiger
    waere als Freitag oder Samstag" (Florian, 15.10.2026). Ohne alles
    bleibt es beim Artikelstamm.
  */
  let preise: Map<string, number> | undefined;
  let preisHerkunft: { datum: string; show: string } | null = null;

  if (typeof optionen.wochentag === "number") {
    try {
      const { showtageAbHeute } = await import("@/lib/ditix/spielplan");
      const passend = (await showtageAbHeute(400)).find((t) => {
        const wochentag = new Date(`${t.datum}T12:00:00Z`).getUTCDay();
        if (wochentag !== optionen.wochentag) return false;
        // Nachmittag heisst: Vorstellung vor 17 Uhr.
        return optionen.tageszeit === "nachmittag" ? t.uhrzeit < "17:00" : t.uhrzeit >= "17:00";
      });
      if (passend) {
        preise = (await abendpreise(passend.ditixEventId)).cent;
        preisHerkunft = { datum: passend.datum, show: passend.name };
      }
    } catch {
      preise = undefined;
    }
  } else if (vorgang.vorstellung?.ditixEventId) {
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
            ${einleitungstext(fuerRechnung, {
              variante: optionen.variante ?? (optionen.verpflegung === "fingerfood" ? "fingerfood" : "menue"),
              tageszeit: optionen.tageszeit,
              showzeit: optionen.showzeit,
              wochentag: optionen.wochentag,
              zeitraum: optionen.zeitraum,
              terminSteht: Boolean(vorgang.vorstellung?.datum) && optionen.wochentag == null,
            })}, ${
              preisHerkunft
                ? `${SCHLUSSTEXT}${String.fromCharCode(10)}${String.fromCharCode(10)}Die Preise entsprechen einer Vorstellung am ${
                    preisHerkunft.datum.split("-").reverse().join(".")
                  }. An anderen Wochentagen koennen sie abweichen; wir halten sie fuer euch fest, sobald der Termin steht.`
                : SCHLUSSTEXT
            },
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
                            einheit, einzel_brutto_cent, ust, rabatt_prozent, sortierung,
                            optional)
      values (${angebotId}, ${p.artikelNummer}, ${p.bezeichnung}, ${p.beschreibung ?? null},
              ${p.menge}, ${p.einheit}, ${p.einzelBruttoCent}, ${p.ust},
              ${p.rabattProzent ?? null}, ${sortierung++}, ${p.optional ?? false})
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

  /*
    Ab jetzt ist das Essen reserviert.

    Sobald ein Angebot steht, meldet der Eventmanager die Menues an
    FloTix, und der Shop verkauft an dem Tag entsprechend weniger
    (Florian, 25.10.2026).
  */
  await vormerkungNachziehen(vorgangId);

  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/vorgaenge");
  return { angebotId };
}

/**
 * Mehrere Fassungen auf einmal anlegen.
 *
 * "es muss so sein, dass der Gast z.B. auch drei verschiedene Angebote
 * bekommen kann, z.B. Show mit Menü, Show mit Fingerfood" (Florian,
 * 15.10.2026). Jede Fassung wird ein eigenes Angebot mit eigener Nummer
 * und eigenem Link, nebeneinander im Vorgang.
 */
export async function angeboteErzeugen(
  vorgangId: string,
  basis: AngebotsOptionen,
  varianten: Variante[],
): Promise<{ anzahl: number }> {
  const liste = varianten.length > 0 ? varianten : [basis.variante ?? "menue"];
  for (const variante of liste) {
    await angebotErzeugen(vorgangId, { ...basis, variante });
  }
  return { anzahl: liste.length };
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

/**
 * Eine Position optional machen oder wieder zur Pflicht.
 *
 * "bei den einzelnen Angebotspunkten sollte auch optional von uns
 * angeklickt werden" (Florian, 14.10.2026). Optionale Positionen stehen
 * im Angebot mit dem Preis in Klammern und zaehlen nicht zur Summe.
 *
 * Geht auch noch, nachdem das Angebot verschickt ist: Der Kunde sieht
 * seinen Link live, und am Telefon wird oft nachverhandelt. Das PDF, das
 * schon im Postfach liegt, aendert sich dadurch nicht.
 */
export async function positionOptional(
  positionId: string,
  vorgangId: string,
  optional: boolean,
): Promise<void> {
  await verlangeTeam();
  await db()`update position set optional = ${optional} where id = ${positionId}`;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/**
 * Den Einzelpreis einer Position aendern.
 *
 * "kann man den Ticketpreis frei veraendern?" (Florian, 15.10.2026).
 * Beim Erstellen geht das ueber den Einheitspreis, hier geht es
 * nachtraeglich und je Zeile: Auch das Menue oder der Empfang ist
 * manchmal Verhandlungssache.
 *
 * Wie beim Optional-Schalter gilt: Ein schon verschicktes PDF aendert
 * sich dadurch nicht, der Kundenlink schon.
 */
export async function positionPreisSetzen(
  positionId: string,
  vorgangId: string,
  formData: FormData,
): Promise<void> {
  await verlangeTeam();

  // Der Mitarbeiter tippt Euro, gespeichert wird in Cent. Komma und
  // Punkt sind beides erlaubt, weil beides getippt wird.
  const roh = String(formData.get("preis") ?? "").trim().replace(",", ".");
  const euro = Number(roh);
  if (!roh || !Number.isFinite(euro) || euro < 0) return;

  await db()`
    update position set einzel_brutto_cent = ${Math.round(euro * 100)} where id = ${positionId}
  `;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/**
 * Eine Position zu einem bestehenden Angebot hinzufügen.
 *
 * "die Option, wie man Punkte aufnehmen kann in einem Angebot, machen
 * wir eins zu eins wie bei lexoffice" (Florian, 15.10.2026): Artikel
 * wählen oder frei eintippen, Menge, Preis, Haken für optional, dazu
 * ein eigener Text.
 */
export async function positionHinzufuegen(
  angebotId: string,
  vorgangId: string,
  f: FormData,
): Promise<void> {
  await verlangeTeam();

  const nummer = String(f.get("artikel") ?? "").trim();
  const eigeneBezeichnung = String(f.get("bezeichnung") ?? "").trim().slice(0, 200);
  // Unbekannte Nummer heisst: frei eingetippt, kein Artikel dahinter.
  let stamm: ReturnType<typeof artikel> | null = null;
  if (nummer) {
    try {
      stamm = artikel(nummer);
    } catch {
      stamm = null;
    }
  }

  const bezeichnung = eigeneBezeichnung || stamm?.bezeichnung;
  if (!bezeichnung) return;

  const menge = Math.max(0, Number(String(f.get("menge") ?? "1").replace(",", ".")) || 0);
  const preisRoh = String(f.get("preis") ?? "").trim().replace(",", ".");
  const preisCent = preisRoh
    ? Math.round(Number(preisRoh) * 100)
    : (stamm?.bruttoCent ?? 0);

  const zeilen = (await db()`
    select coalesce(max(sortierung), 0) + 1 as naechste from position where angebot_id = ${angebotId}::uuid
  `) as Array<{ naechste: number }>;

  await db()`
    insert into position (angebot_id, artikel_nummer, bezeichnung, beschreibung, menge, einheit,
                          einzel_brutto_cent, ust, sortierung, optional)
    values (${angebotId}::uuid, ${stamm?.nummer ?? "FREI"}, ${bezeichnung},
            ${String(f.get("text") ?? "").trim().slice(0, 600) || stamm?.beschreibung || null},
            ${menge}, ${stamm?.einheit ?? "Stück"}, ${preisCent}, ${stamm?.ust ?? 0.19},
            ${zeilen[0]?.naechste ?? 1}, ${String(f.get("optional") ?? "") === "ja"})
  `;

  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/** Den Text unter einer Position ändern. */
export async function positionText(
  positionId: string,
  vorgangId: string,
  f: FormData,
): Promise<void> {
  await verlangeTeam();
  const text = String(f.get("text") ?? "").trim().slice(0, 600);
  await db()`update position set beschreibung = ${text || null} where id = ${positionId}`;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/** Eine Position wieder entfernen. */
export async function positionEntfernen(positionId: string, vorgangId: string): Promise<void> {
  await verlangeTeam();
  await db()`delete from position where id = ${positionId}`;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/** Löscht ein Angebot, etwa nach einem Fehler beim Erstellen. */
export async function angebotLoeschen(angebotId: string, vorgangId: string): Promise<void> {
  await verlangeTeam();
  await db()`delete from angebot where id = ${angebotId}`;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}
