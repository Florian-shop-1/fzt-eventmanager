"use server";

/**
 * Alles, was Daten verändert. Läuft ausschließlich auf dem Server.
 *
 * Die Funktionen sind bewusst kleinteilig, damit jede Änderung einzeln
 * nachvollziehbar bleibt und die Oberfläche nach jedem Schritt den
 * aktuellen Stand zeigt.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./client";
import type { VorgangStatus } from "@/lib/domain/vorgang";
import { kommendeTermine } from "@/lib/ditix/spielplan";
import { planeAbend } from "@/lib/seating/abend";
import {
  angemeldeterBenutzer,
  darfAbendbetrieb,
  darfKaufmaennisches,
  darfSitzplanAendern,
} from "@/lib/auth/sitzung";

/**
 * Wacht über jede Änderung.
 *
 * Wichtig: Serverfunktionen sind über eine direkte Anfrage erreichbar, nicht
 * nur über die Oberfläche. Es reicht deshalb nicht, in der Navigation etwas
 * auszublenden. Jede Funktion, die etwas ändert, prüft hier selbst nach.
 */
async function verlangeTeam(): Promise<string> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  if (!darfKaufmaennisches(benutzer.rolle)) {
    throw new Error("Für diese Änderung fehlt die Berechtigung.");
  }
  return benutzer.name;
}

/**
 * Hakt ab, dass das Geld eingegangen ist.
 *
 * Das darf auch die Gastronomie: Sie kassiert am Tisch und weiß als
 * Einzige, ob gezahlt wurde. Ein Betrag wird dabei nicht verändert, nur
 * festgehalten, dass und wann kassiert wurde.
 */
export async function vorOrtKassiert(
  ditixEventId: string,
  gruppeId: string,
  rueckgaengig: boolean,
): Promise<void> {
  const name = await verlangeAbendbetrieb();

  if (rueckgaengig) {
    await db()`
      update gruppe set vor_ort_kassiert_am = null, vor_ort_kassiert_von = null
       where id = ${gruppeId}
    `;
  } else {
    await db()`
      update gruppe set vor_ort_kassiert_am = now(), vor_ort_kassiert_von = ${name}
       where id = ${gruppeId}
    `;
  }

  revalidatePath("/funktionsheet");
  revalidatePath("/einlassliste");
  revalidatePath("/vorgaenge");
  void ditixEventId;
}

/**
 * Wacht über alles, was am Veranstaltungsabend passiert.
 *
 * Weiter gefasst als verlangeTeam: Die Gastronomie teilt den Saal ein,
 * hakt am Einlass ab und kassiert. Kaufmännisches bleibt davon unberührt.
 */
async function verlangeSitzplaner(): Promise<string> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  if (!darfSitzplanAendern(benutzer.rolle)) {
    throw new Error("Für die Sitzplanung fehlt die Berechtigung.");
  }
  return benutzer.name;
}

/**
 * Wacht über die Sitzplanung.
 *
 * Enger als verlangeAbendbetrieb: Das Foyer schaut im Sitzplan nach, wo
 * jemand hingehört, eingeteilt wird der Saal aber von Gastronomie und Büro.
 */
async function verlangeAbendbetrieb(): Promise<string> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");
  if (!darfAbendbetrieb(benutzer.rolle)) {
    throw new Error("Für den Abendbetrieb fehlt die Berechtigung.");
  }
  return benutzer.name;
}

/**
 * Hakt am Einlass ab, dass eine Gruppe da ist.
 *
 * Die Kennung ist dieselbe wie im Sitzplan. Ein zweiter Klick nimmt das
 * Häkchen wieder weg, denn am Einlass verklickt man sich.
 */
export async function einlassAbhaken(
  ditixEventId: string,
  gruppeKennung: string,
  zurueck: boolean,
): Promise<void> {
  const name = await verlangeAbendbetrieb();

  if (zurueck) {
    await db()`
      delete from einlass
       where ditix_event_id = ${ditixEventId} and gruppe_kennung = ${gruppeKennung}
    `;
  } else {
    await db()`
      insert into einlass (ditix_event_id, gruppe_kennung, benutzer)
      values (${ditixEventId}, ${gruppeKennung}, ${name})
      on conflict (ditix_event_id, gruppe_kennung) do nothing
    `;
  }

  revalidatePath("/einlassliste");
}

/** Wer an einem Abend schon da ist. Kennung zu Zeitpunkt und Name. */
export async function angekommeneGruppen(
  ditixEventId: string,
): Promise<Map<string, { am: string; von: string | null }>> {
  const zeilen = (await db()`
    select gruppe_kennung, angekommen_am, benutzer
      from einlass where ditix_event_id = ${ditixEventId}
  `) as Array<{ gruppe_kennung: string; angekommen_am: string; benutzer: string | null }>;

  return new Map(
    zeilen.map((z) => [
      z.gruppe_kennung,
      { am: new Date(z.angekommen_am).toISOString(), von: z.benutzer },
    ]),
  );
}

/**
 * Liest einen Eurobetrag aus einem Formularfeld und gibt Cent zurück.
 * Leer oder unlesbar ergibt null, dann rechnet das Programm selbst.
 */
function betragAusFormular(formData: FormData, feld: string): number | null {
  const roh = text(formData, feld);
  if (!roh) return null;
  // Tausenderpunkte weg, Komma zum Punkt, alles andere ignorieren.
  const sauber = roh.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  // Ohne diese Prüfung würde aus "abc" eine 0, und die Gruppe stünde mit
  // 0,00 € auf dem Funktionsheet, statt selbst gerechnet zu werden.
  if (!/\d/.test(sauber)) return null;
  const zahl = Number(sauber);
  return Number.isFinite(zahl) ? Math.round(zahl * 100) : null;
}

/** Name des angemeldeten Benutzers, für Notizen und Protokolle. */
async function aktuellerBenutzer(): Promise<string> {
  const benutzer = await angemeldeterBenutzer();
  return benutzer?.name ?? "Unbekannt";
}

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function zahl(formData: FormData, feld: string, standard = 0): number {
  const wert = Number(formData.get(feld));
  return Number.isFinite(wert) ? wert : standard;
}

/**
 * Nächste freie Vorgangsnummer im Format V-MMJJ-NNN.
 * Zählt je Monat neu, wie bei den Angebotsnummern in lexoffice.
 */
async function naechsteVorgangsnummer(): Promise<string> {
  const jetzt = new Date();
  const praefix = `V-${String(jetzt.getMonth() + 1).padStart(2, "0")}${String(jetzt.getFullYear()).slice(-2)}-`;
  const zeilen = (await db()`
    select nummer from vorgang where nummer like ${praefix + "%"} order by nummer desc limit 1
  `) as { nummer: string }[];
  const letzte = zeilen.length > 0 ? Number(zeilen[0].nummer.split("-")[2]) : 0;
  return praefix + String(letzte + 1).padStart(3, "0");
}

/** Sucht einen Kunden anhand der Mailadresse oder legt ihn neu an. */
async function kundeFinden(daten: {
  name: string;
  email: string;
  ansprechpartner: string;
  telefon: string;
}): Promise<string> {
  if (daten.email) {
    const vorhanden = (await db()`
      select id from kunde where lower(email) = lower(${daten.email}) limit 1
    `) as { id: string }[];
    if (vorhanden.length > 0) return vorhanden[0].id;
  }

  const neu = (await db()`
    insert into kunde (name, email, ansprechpartner, telefon)
    values (${daten.name}, ${daten.email}, ${daten.ansprechpartner || null}, ${daten.telefon || null})
    returning id
  `) as { id: string }[];
  return neu[0].id;
}

/**
 * Sucht eine Vorstellung nach Datum und Show oder legt sie neu an.
 * Die Ditix-Kennung wird mitgespeichert, sobald sie bekannt ist, auch
 * nachträglich bei einer schon vorhandenen Vorstellung.
 */
async function vorstellungFinden(
  datum: string,
  show: string,
  ditixEventId?: string,
): Promise<string> {
  const vorhanden = (await db()`
    select id, ditix_event_id from vorstellung where datum = ${datum} and show = ${show} limit 1
  `) as { id: string; ditix_event_id: string | null }[];

  if (vorhanden.length > 0) {
    if (ditixEventId && !vorhanden[0].ditix_event_id) {
      await db()`
        update vorstellung set ditix_event_id = ${ditixEventId} where id = ${vorhanden[0].id}
      `;
    }
    return vorhanden[0].id;
  }

  const neu = (await db()`
    insert into vorstellung (datum, show, ditix_event_id)
    values (${datum}, ${show}, ${ditixEventId ?? null})
    returning id
  `) as { id: string }[];
  return neu[0].id;
}

/** Nimmt eine neue Anfrage auf und springt danach in den Vorgang. */
export async function anfrageAufnehmen(formData: FormData): Promise<void> {
  await verlangeTeam();
  const kundeName = text(formData, "kundeName");
  const personen = Math.max(1, zahl(formData, "personen", 1));

  // Bevorzugt wird die Vorstellung aus dem echten Spielplan gewählt.
  // Datum und Show werden dann nicht aus dem Formular übernommen, sondern
  // beim Shop nachgeschlagen. So kann niemand ein Datum eintragen, an dem
  // gar keine Show stattfindet.
  const gewaehlt = text(formData, "ditixEventId");
  let datum = text(formData, "datum");
  let show = text(formData, "show");
  let ditixEventId: string | undefined;

  if (gewaehlt) {
    const termine = await kommendeTermine();
    const termin = termine.find((t) => t.ditixEventId === gewaehlt);
    if (!termin) {
      throw new Error("Die gewählte Vorstellung steht nicht mehr im Spielplan.");
    }
    datum = termin.datum;
    show = termin.name;
    ditixEventId = termin.ditixEventId;
  }

  if (!kundeName) {
    throw new Error("Ohne Firma oder Namen geht es nicht.");
  }

  const kundeId = await kundeFinden({
    name: kundeName,
    email: text(formData, "email"),
    ansprechpartner: text(formData, "ansprechpartner"),
    telefon: text(formData, "telefon"),
  });

  // Ohne Termin bleibt die Vorstellung offen. Das ist der Normalfall bei
  // frischen Leads: dort steht als Wunsch oft nur ein Zeitraum.
  const vorstellungId =
    datum && show ? await vorstellungFinden(datum, show, ditixEventId) : null;
  const nummer = await naechsteVorgangsnummer();

  const vorgang = (await db()`
    insert into vorgang (nummer, kunde_id, vorstellung_id, quelle, status,
                         personen_ungefaehr, wunschzeitraum)
    values (${nummer}, ${kundeId}, ${vorstellungId}, ${text(formData, "quelle") || null}, 'anfrage',
            ${text(formData, "personenUngefaehr") || null},
            ${text(formData, "wunschzeitraum") || null})
    returning id
  `) as { id: string }[];

  const vorgangId = vorgang[0].id;

  await db()`
    insert into gruppe (vorgang_id, name, personen, herkunft)
    values (${vorgangId}, ${kundeName}, ${personen}, ${text(formData, "herkunft") || "firma"})
  `;

  const notiz = text(formData, "notiz");
  if (notiz) {
    await db()`
      insert into notiz (vorgang_id, benutzer, text)
      values (${vorgangId}, ${await aktuellerBenutzer()}, ${notiz})
    `;
  }

  revalidatePath("/vorgaenge");
  redirect(`/vorgaenge/${vorgangId}`);
}

export async function statusSetzen(vorgangId: string, status: VorgangStatus): Promise<void> {
  await verlangeTeam();
  await db()`
    update vorgang set status = ${status}, geaendert_am = now() where id = ${vorgangId}
  `;
  revalidatePath("/vorgaenge");
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

export async function notizHinzufuegen(vorgangId: string, formData: FormData): Promise<void> {
  await verlangeTeam();
  const inhalt = text(formData, "text");
  if (!inhalt) return;
  await db()`
    insert into notiz (vorgang_id, benutzer, text)
    values (${vorgangId}, ${await aktuellerBenutzer()}, ${inhalt})
  `;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

export async function gruppeHinzufuegen(vorgangId: string, formData: FormData): Promise<void> {
  await verlangeTeam();
  const name = text(formData, "name") || "Weitere Gruppe";
  const personen = Math.max(1, zahl(formData, "personen", 1));
  await db()`
    insert into gruppe (vorgang_id, name, personen, herkunft)
    values (${vorgangId}, ${name}, ${personen}, ${text(formData, "herkunft") || "firma"})
  `;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

export async function gruppeAendern(
  vorgangId: string,
  gruppeId: string,
  aenderung: { name?: string; personen?: number; unvertraeglichkeiten?: string },
): Promise<void> {
  await verlangeTeam();
  if (aenderung.name !== undefined) {
    await db()`update gruppe set name = ${aenderung.name} where id = ${gruppeId}`;
  }
  if (aenderung.personen !== undefined) {
    await db()`update gruppe set personen = ${Math.max(1, aenderung.personen)} where id = ${gruppeId}`;
  }
  if (aenderung.unvertraeglichkeiten !== undefined) {
    await db()`
      update gruppe set unvertraeglichkeiten = ${aenderung.unvertraeglichkeiten || null}
       where id = ${gruppeId}
    `;
  }
  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/sitzplan");
}

/**
 * Speichert die Menüwahl und die Unverträglichkeiten einer Gruppe.
 * Das ist die Grundlage für das Küchenblatt.
 */
export async function menueSetzen(
  vorgangId: string,
  gruppeId: string,
  formData: FormData,
): Promise<void> {
  await verlangeTeam();
  const menues: Record<string, number> = {};
  for (const variante of ["classic", "sea", "veggy", "kids"]) {
    const anzahl = Math.max(0, zahl(formData, `menue_${variante}`, 0));
    if (anzahl > 0) menues[variante] = anzahl;
  }

  await db()`
    update gruppe
       set menues = ${JSON.stringify(menues)}::jsonb,
           unvertraeglichkeiten = ${text(formData, "unvertraeglichkeiten") || null},
           getraenkepauschalen = ${formData
             .getAll("getraenkepauschalen")
             .map(String)
             .filter(Boolean)},
           sondervereinbarung = ${text(formData, "sondervereinbarung") || null},
           vor_ort_kassieren = ${formData.get("vor_ort_kassieren") !== null},
           vor_ort_betrag_cent = ${betragAusFormular(formData, "vor_ort_betrag")},
           vor_ort_hinweis = ${text(formData, "vor_ort_hinweis") || null}
     where id = ${gruppeId} and vorgang_id = ${vorgangId}
  `;

  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/kueche");
}

export async function gruppeEntfernen(vorgangId: string, gruppeId: string): Promise<void> {
  await verlangeTeam();
  await db()`delete from gruppe where id = ${gruppeId} and vorgang_id = ${vorgangId}`;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/**
 * Setzt oder löscht die Ausnahme vom Aufschlag für nicht belegte Logenplätze.
 * Ohne Begründung lehnt schon die Datenbank ab, deshalb wird hier zusätzlich
 * eine verständliche Meldung erzeugt.
 */
export async function ausnahmeSetzen(
  vorgangId: string,
  gruppeId: string,
  aktiv: boolean,
  grund: string,
): Promise<void> {
  await verlangeTeam();
  if (aktiv && grund.trim() === "") {
    throw new Error("Für eine Ausnahme wird eine Begründung gebraucht.");
  }
  if (aktiv) {
    await db()`
      update gruppe
         set ausnahme_aktiv = true,
             ausnahme_grund = ${grund.trim()},
             ausnahme_benutzer = ${await aktuellerBenutzer()},
             ausnahme_gesetzt_am = now()
       where id = ${gruppeId}
    `;
  } else {
    await db()`
      update gruppe
         set ausnahme_aktiv = false, ausnahme_grund = null,
             ausnahme_benutzer = null, ausnahme_gesetzt_am = null
       where id = ${gruppeId}
    `;
  }
  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/sitzplan");
}

export async function aufgabeHinzufuegen(vorgangId: string, formData: FormData): Promise<void> {
  await verlangeTeam();
  const inhalt = text(formData, "text");
  const faellig = text(formData, "faellig");
  if (!inhalt || !faellig) return;
  await db()`
    insert into aufgabe (vorgang_id, faellig, text, benutzer)
    values (${vorgangId}, ${faellig}, ${inhalt}, ${await aktuellerBenutzer()})
  `;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

export async function aufgabeUmschalten(vorgangId: string, aufgabeId: string): Promise<void> {
  await verlangeTeam();
  await db()`update aufgabe set erledigt = not erledigt where id = ${aufgabeId}`;
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/**
 * Löscht einen Vorgang endgültig, mitsamt Gruppen, Angeboten, Notizen,
 * Aufgaben und Zahlungen. Der Kunde bleibt erhalten, damit die Historie
 * anderer Vorgänge nicht kaputtgeht.
 *
 * Gedacht für Testeinträge und Fehleingaben. Ein Event, das wirklich
 * nicht stattfindet, gehört auf "Abgesagt" gesetzt und nicht gelöscht:
 * so bleibt nachvollziehbar, dass es die Anfrage gab.
 */
export async function vorgangLoeschen(vorgangId: string): Promise<void> {
  await verlangeTeam();
  await db()`delete from vorgang where id = ${vorgangId}`;
  // Vorstellungen ohne Vorgänge sind Karteileichen und können weg.
  await db()`
    delete from vorstellung s
     where not exists (select 1 from vorgang v where v.vorstellung_id = s.id)
  `;
  revalidatePath("/vorgaenge");
  redirect("/vorgaenge");
}

export async function zahlungErfassen(vorgangId: string, formData: FormData): Promise<void> {
  await verlangeTeam();
  const betrag = Math.round(zahl(formData, "betrag") * 100);
  const datum = text(formData, "datum");
  if (!betrag || !datum) return;

  await db()`
    insert into zahlung (vorgang_id, datum, betrag_cent, art, notiz)
    values (${vorgangId}, ${datum}, ${betrag}, ${text(formData, "art") || "vollzahlung"},
            ${text(formData, "notiz") || null})
  `;
  revalidatePath(`/vorgaenge/${vorgangId}`);
  revalidatePath("/vorgaenge");
}

/**
 * Legt den Sitzplan eines Abends fest. Ab dann gilt er als Vorgabe für
 * Service und Küche, statt bei jedem Aufruf neu gerechnet zu werden.
 * Ein erneutes Festlegen überschreibt den alten Plan.
 */
export async function sitzplanFestlegen(ditixEventId: string, plan: unknown): Promise<void> {
  await verlangeSitzplaner();
  const vorstellungId = await vorstellungAnlegenFallsNoetig(ditixEventId);

  // Was der Browser zurückschickt, wird nicht ungeprüft gespeichert.
  //
  // Zwei Gründe. Erstens sieht die Gastronomie einen Plan ohne Beträge,
  // und würde sie ihn so festlegen, wären die Differenzen für immer weg.
  // Zweitens ist alles, was aus dem Browser kommt, grundsätzlich nur ein
  // Vorschlag. Deshalb wird hier neu gerechnet und die Platzierung
  // gesucht, die der Benutzer gewählt hat.
  const echt = await echterPlan(ditixEventId, plan);

  await db()`
    insert into sitzplan (vorstellung_id, plan, festgelegt_von)
    values (${vorstellungId}, ${JSON.stringify(echt)}::jsonb, ${await aktuellerBenutzer()})
    on conflict (vorstellung_id) do update
       set plan = excluded.plan,
           festgelegt_von = excluded.festgelegt_von,
           festgelegt_am = now()
  `;
  revalidatePath("/sitzplan");
  revalidatePath("/kueche");
  revalidatePath("/funktionsheet");
}

/**
 * Sucht zur gewählten Platzierung den vollständigen Plan vom Server.
 *
 * Verglichen wird nur, wer in welcher Loge und an welchem Tisch sitzt.
 * Findet sich dazu eine der gerechneten Varianten, wird diese gespeichert,
 * mitsamt Hinweisen und Beträgen. Findet sich keine, bleibt es beim
 * Eingegangenen: Lieber ein Plan ohne Beträge als gar keiner.
 */
async function echterPlan(ditixEventId: string, eingegangen: unknown): Promise<unknown> {
  const { varianten } = await planeAbend(ditixEventId);
  const gesucht = platzierung(eingegangen);
  if (!gesucht) return eingegangen;

  return varianten.find((v) => platzierung(v) === gesucht) ?? eingegangen;
}

/** Kennung einer Platzierung, unabhängig von Hinweisen und Beträgen. */
function platzierung(plan: unknown): string | null {
  const p = plan as {
    logen?: Array<{ gruppeId: string; logenNummern: number[] }>;
    galerie?: Array<{ gruppeId: string; tischIds: string[] }>;
  } | null;
  if (!p || !Array.isArray(p.logen) || !Array.isArray(p.galerie)) return null;

  const teile = [
    ...p.logen.map((z) => `L${z.gruppeId}:${[...z.logenNummern].sort().join("-")}`),
    ...p.galerie.map((z) => `G${z.gruppeId}:${[...z.tischIds].sort().join("-")}`),
  ];
  return teile.sort().join("|");
}

/** Hebt einen festgelegten Sitzplan wieder auf. */
export async function sitzplanAufheben(ditixEventId: string): Promise<void> {
  await verlangeSitzplaner();
  await db()`
    delete from sitzplan p
     using vorstellung s
     where p.vorstellung_id = s.id and s.ditix_event_id = ${ditixEventId}
  `;
  revalidatePath("/sitzplan");
  revalidatePath("/kueche");
  revalidatePath("/funktionsheet");
}

/**
 * Gibt die Plätze eines reservierten Vorgangs wieder frei.
 *
 * Anwendungsfall: Die Firma entscheidet sich gegen uns. Der Vorgang wird
 * dann abgesagt und verschwindet aus Sitzplan, Küchenblatt und
 * Funktionsheet, bleibt aber mit seiner Geschichte erhalten. Der Grund
 * landet als Notiz am Vorgang, damit später nachvollziehbar ist, warum
 * die Plätze frei wurden.
 *
 * Rückgängig machen geht über den Vorgang selbst: dort lässt sich der
 * Status wieder zurücksetzen.
 */
export async function plaetzeFreigeben(
  vorgangId: string,
  formData: FormData,
): Promise<void> {
  await verlangeTeam();
  const grund = text(formData, "grund");

  await db()`
    update vorgang set status = 'abgesagt', geaendert_am = now() where id = ${vorgangId}
  `;
  await db()`
    insert into notiz (vorgang_id, benutzer, text)
    values (${vorgangId}, ${await aktuellerBenutzer()},
            ${"Plätze freigegeben" + (grund ? ": " + grund : ".")})
  `;

  revalidatePath("/sitzplan");
  revalidatePath("/kueche");
  revalidatePath("/funktionsheet");
  revalidatePath("/vorgaenge");
  revalidatePath(`/vorgaenge/${vorgangId}`);
}

/**
 * Legt die Vorstellung in der eigenen Datenbank an, falls sie noch fehlt.
 *
 * Nötig, weil die Abende aus dem Spielplan kommen: Für einen Abend, an dem
 * nur Einzelgäste über den Shop gebucht haben, gibt es hier noch nichts.
 * Erst wenn etwas gespeichert werden soll, entsteht der Eintrag.
 */
async function vorstellungAnlegenFallsNoetig(ditixEventId: string): Promise<string> {
  const vorhanden = (await db()`
    select id from vorstellung where ditix_event_id = ${ditixEventId} limit 1
  `) as Array<{ id: string }>;
  if (vorhanden.length > 0) return vorhanden[0].id;

  const termin = (await kommendeTermine(300)).find((t) => t.ditixEventId === ditixEventId);
  if (!termin) throw new Error("Diese Vorstellung steht nicht mehr im Spielplan.");

  const neu = (await db()`
    insert into vorstellung (datum, show, ditix_event_id)
    values (${termin.datum}, ${termin.name}, ${ditixEventId})
    returning id
  `) as Array<{ id: string }>;
  return neu[0].id;
}

/**
 * Legt mehrere Shop-Bestellungen zu einer Gruppe zusammen.
 * Der Sitzplaner behandelt sie danach als eine Gruppe an einem Tisch.
 */
export async function gruppenZusammenlegen(
  ditixEventId: string,
  gruppenIds: string[],
  name: string,
): Promise<void> {
  await verlangeSitzplaner();
  if (gruppenIds.length < 2) {
    throw new Error("Zum Zusammenlegen werden mindestens zwei Bestellungen gebraucht.");
  }
  const vorstellungId = await vorstellungAnlegenFallsNoetig(ditixEventId);
  await db()`
    insert into zusammenlegung (vorstellung_id, gruppen_ids, name, angelegt_von)
    values (${vorstellungId}, ${gruppenIds}, ${name.trim() || "Zusammengelegt"},
            ${await aktuellerBenutzer()})
  `;
  revalidatePath("/sitzplan");
  revalidatePath("/kueche");
}

/** Hebt eine Zusammenlegung wieder auf. */
export async function zusammenlegungAufheben(id: string): Promise<void> {
  await verlangeSitzplaner();
  await db()`delete from zusammenlegung where id = ${id}`;
  revalidatePath("/sitzplan");
  revalidatePath("/kueche");
}
