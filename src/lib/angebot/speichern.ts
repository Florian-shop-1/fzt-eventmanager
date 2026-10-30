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
  WERBUNG_TEXT,
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

  /*
    Auch ein fester Termin braucht die passende Vorstellung.

    "wenn man eine mittagsshow nimmt, z.b. sonntags, dann muss sich der
    eventmanger die preise aus einer sonntagsshow nehmen. oder bei einer
    donnerstag abend show eben was es donnerstags kostet" (Florian,
    30.10.2026).

    Haengt am Vorgang ein Termin, wurden bisher immer dessen Preise
    genommen, auch wenn im Baukasten eine andere Tageszeit stand. Wer
    also zu einem Samstagabend-Termin die Mittagsshow anbot, bekam
    Abendpreise. Passt die Tageszeit nicht, wird deshalb jetzt nach dem
    Wochentag des Termins gesucht, wie bei einem offenen Termin.
  */
  const terminUhrzeit = optionen.showzeit ?? "";
  const terminIstNachmittag = Boolean(terminUhrzeit) && terminUhrzeit < "17:00";
  const tageszeitPasst =
    !terminUhrzeit || (optionen.tageszeit === "nachmittag") === terminIstNachmittag;
  const wochentagZumSuchen =
    typeof optionen.wochentag === "number"
      ? optionen.wochentag
      : !tageszeitPasst && vorgang.vorstellung?.datum
        ? new Date(`${vorgang.vorstellung.datum}T12:00:00Z`).getUTCDay()
        : null;

  if (typeof wochentagZumSuchen === "number") {
    try {
      const { showtageAbHeute } = await import("@/lib/ditix/spielplan");
      const passend = (await showtageAbHeute(400)).find((t) => {
        const wochentag = new Date(`${t.datum}T12:00:00Z`).getUTCDay();
        if (wochentag !== wochentagZumSuchen) return false;
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

  /*
    Von Hand gesetzte Preise gehen allem vor.

    Sie kommen zuletzt dazu, damit sie weder der Artikelstamm noch die
    Abendpreise aus dem Ticketshop ueberschreiben koennen. Eine Null
    oder etwas Unsinniges wird dabei verworfen: Lieber der Listenpreis
    als ein Angebot ueber null Euro.
  */
  const vonHand = Object.entries(optionen.eigenePreise ?? {}).filter(
    ([, cent]) => Number.isFinite(cent) && cent > 0,
  );
  if (vonHand.length > 0) {
    preise = new Map(preise ?? []);
    for (const [nummer, cent] of vonHand) preise.set(nummer, Math.round(cent));
  }

  const positionen = erzeugePositionen(fuerRechnung, plan, { ...optionen, preise });
  const nummer = await naechsteNummer();
  const jetzt = new Date();

  /*
    Der Schlusstext, Stück für Stück.

    Zu den Bedingungen kommt der Hinweis auf den Preisstand, falls die
    Preise von einem anderen Abend stammen, und die Werbepartnerschaft,
    falls das Logo auf der Fassade mit angeboten wird (Florian,
    28.10.2026).
  */
  const ABSATZ = String.fromCharCode(10) + String.fromCharCode(10);
  const schlussteile = [SCHLUSSTEXT];
  if (preisHerkunft) {
    schlussteile.push(
      `Die Preise entsprechen einer Vorstellung am ${preisHerkunft.datum
        .split("-")
        .reverse()
        .join(".")}. An anderen Wochentagen koennen sie abweichen; wir halten sie fuer Sie fest, sobald der Termin steht.`,
    );
  }
  if (optionen.mitFassade) schlussteile.push(WERBUNG_TEXT);
  const schlusstext = schlussteile.join(ABSATZ);

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
            })}, ${schlusstext},
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

  /*
    Plaetze blockiert hier bewusst niemand mehr.

    Bis zum 28.10.2026 geschah das von selbst, sobald ein Angebot
    entstand. "es ist besser dass kevin klicken muss, wenn plaetze fuer
    die firma blockiert werden sollen (bitte deutlich anzeigen)"
    (Florian, 28.10.2026).

    Der Grund ist der Alltag: Kevin baut oft drei Fassungen desselben
    Abends, und jede haette Plaetze gehalten. Nicht jede Anfrage
    verdient gehaltene Plaetze, und ein voller Samstag schon gar nicht.
    Im Vorgang steht jetzt orange, dass nichts blockiert ist, solange
    ein Angebot draussen ist und niemand geklickt hat. Beim Blockieren
    wird es am juengsten Angebot vermerkt, damit die Kundenseite es
    zeigen kann (siehe vorgaenge/[id]/optionen.ts).
  */

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
  /**
   * Die Angebotsarten, je eine ein eigenes Angebot.
   *
   * "es soll aber, wenn der kunde verschiedene angebote bekommen soll,
   * auch einfach zwei links / zwei pdfs usw. sein. Angebot 1 z.b. nur
   * Show, Angebot 2 mit Menue, oder Angebot 3 Exklusivbuchung"
   * (Florian, 28.10.2026).
   *
   * Vorher war die Art eine einzige Entscheidung fuer alle Fassungen,
   * und die Exklusivbuchung landete in derselben Liste wie das Menue.
   * Ohne Angabe bleibt es bei der Art aus der Vorlage.
   */
  arten?: Array<AngebotsOptionen["art"]>,
): Promise<{ anzahl: number; ids: string[] }> {
  const liste = varianten.length > 0 ? varianten : [basis.variante ?? "menue"];
  const artenListe = arten && arten.length > 0 ? arten : [basis.art];
  const ids: string[] = [];
  for (const art of artenListe) {
    for (const variante of liste) {
      const { angebotId } = await angebotErzeugen(vorgangId, { ...basis, art, variante });
      ids.push(angebotId);
    }
  }
  // Die Kennungen gehen zurueck, damit die Seite danach genau das
  // frische Angebot zeigen kann (Florian, 28.10.2026).
  return { anzahl: ids.length, ids };
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

/**
 * Mehrere Leistungen auf einmal ins Angebot nehmen.
 *
 * "ich will hier unter dem angebot alles angezeigt haben was es gibt.
 * ich will alles dazu oder abwählen können. man sollte einen button
 * haben 'alle optionen listen' - dann haust du alles rein und man muss
 * es mit - wieder entfernen können. wichtig ist mir, dass hier auch die
 * anderen ticketkat. drin sind, dass man die hinzufügen kann. man muss
 * checken wenn was hinzugefügt ist schon" (Florian, 30.10.2026).
 *
 * Was schon im Angebot steht, wird übersprungen. Doppelte Zeilen sind
 * im Gespräch mit dem Kunden schlimmer als eine fehlende: Sie stehen
 * zweimal in der Summe.
 *
 * Die Menge richtet sich nach der Art. Was je Gast zählt, bekommt die
 * Gästezahl des Angebots, alles andere eine Einheit. Die Gästezahl
 * steht nirgends eigens, sie ergibt sich aus der größten Stückzahl
 * einer Ticket- oder Menüzeile; das ist dieselbe Regel, nach der das
 * Angebot gebaut wurde.
 */
const JE_GAST = new Set(["menue", "ticket", "getraenke", "empfang"]);

export async function positionenErgaenzen(
  angebotId: string,
  vorgangId: string,
  nummern: string[],
  optional = true,
): Promise<void> {
  await verlangeTeam();
  if (nummern.length === 0) return;

  const vorhanden = (await db()`
    select artikel_nummer, menge from position where angebot_id = ${angebotId}::uuid
  `) as Array<{ artikel_nummer: string; menge: number }>;

  const schonDrin = new Set(vorhanden.map((z) => z.artikel_nummer));

  const gaeste = Math.max(
    1,
    ...vorhanden
      .filter((z) => {
        try {
          return JE_GAST.has(artikel(z.artikel_nummer).gruppe);
        } catch {
          return false;
        }
      })
      .map((z) => Number(z.menge) || 0),
  );

  const [{ naechste }] = (await db()`
    select coalesce(max(sortierung), 0) + 1 as naechste from position where angebot_id = ${angebotId}::uuid
  `) as Array<{ naechste: number }>;
  let sortierung = Number(naechste);

  for (const nummer of nummern) {
    if (schonDrin.has(nummer)) continue;
    let stamm: ReturnType<typeof artikel>;
    try {
      stamm = artikel(nummer);
    } catch {
      continue;
    }

    const menge = JE_GAST.has(stamm.gruppe) ? gaeste : 1;
    await db()`
      insert into position (angebot_id, artikel_nummer, bezeichnung, beschreibung, menge,
                            einheit, einzel_brutto_cent, ust, sortierung, optional)
      values (${angebotId}, ${stamm.nummer}, ${stamm.bezeichnung}, ${stamm.beschreibung ?? null},
              ${menge}, ${stamm.einheit}, ${stamm.bruttoCent}, ${stamm.ust}, ${sortierung++},
              ${optional})
    `;
    schonDrin.add(nummer);
  }

  revalidatePath(`/vorgaenge/${vorgangId}`);
}
