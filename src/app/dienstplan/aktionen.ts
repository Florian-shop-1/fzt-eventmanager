"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { findeTermin, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { datumMitWochentag } from "@/lib/zeit";
import { planLaden } from "@/lib/dienstplan/laden";
import {
  anfrageAntwortMail,
  anfrageMail,
  eingeteiltMail,
  kommentarMail,
  mitlernenMail,
  zuschauerGesuchtMail,
  ersatzGesuchtMail,
  offeneSchichtenMail,
  uebernommenMail,
} from "@/lib/dienstplan/mails";
import { abwesendEintragen, abwesendLoeschen, istAbwesend } from "@/lib/dienstplan/abwesend";
import {
  beteiligte,
  herzUmlegen,
  kommentarLoeschen,
  kommentarSchreiben,
} from "@/lib/dienstplan/kommentar";
import { einladungAbschalten, neueEinladung } from "@/lib/dienstplan/einladung";
import {
  BEZEICHNUNG,
  POSITIONEN,
  anfrageLoeschen,
  anfrageSetzen,
  darfUebernehmen,
  darfAbgezogenWerden,
  darfGefragtWerden,
  dienstAn,
  einsatzLoeschen,
  einsatzSetzen,
  ersatzGefragtMerken,
  istRookieFuer,
  schonImDienst,
  werKann,
  type FestePosition,
  type Person,
  type Position,
} from "@/lib/dienstplan/plan";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
// ZUSCHAUER gehoert dazu, seit es die vierte Position gibt (migrations/064).
// Fehlte hier, deshalb kam beim Uebernehmen "Unbekannte Position"
// (Roman, gemeldet von Florian am 23.09.2026).
const GUELTIG: Position[] = ["FOH", "T2", "T1", "ZUSCHAUER", "SHADOW"];

function zurueck(eventId: string, meldung: string): never {
  revalidatePath("/dienstplan");
  redirect(`/dienstplan?s=${eventId}&meldung=${encodeURIComponent(meldung)}#s-${eventId}`);
}

/** Lädt alles, was eine Aktion an einer Schicht braucht. */
async function schichtLaden(f: FormData) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  const eventId = text(f, "vorstellung");
  const position = text(f, "position") as Position;
  if (!GUELTIG.includes(position)) throw new Error("Unbekannte Position.");
  const termin = await findeTermin(eventId);
  if (!termin) zurueck(eventId, "Diese Vorstellung gibt es nicht mehr.");
  const { schichten, personen, abwesend } = await planLaden();
  const schicht = schichten.find((s) => s.termin.ditixEventId === eventId);
  const slot = schicht?.slots.find((s) => s.position === position);
  const ich = personen.find((p) => p.id === benutzer.id);
  return { benutzer, eventId, position, termin, schichten, personen, slot, ich, abwesend };
}

/** "Ich übernehme": eine offene Schicht, oder als Shadow mitlaufen. */
export async function uebernehmen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, slot, ich } = await schichtLaden(f);
  if (!slot || !ich) zurueck(eventId, "Diese Schicht gibt es nicht.");
  if (!darfUebernehmen(ich, position, slot.fuer)) {
    zurueck(eventId, `${BEZEICHNUNG[position]} ist nicht bei deinen Positionen eingetragen. Florian kann das ändern.`);
  }
  if (!slot.offen) {
    zurueck(eventId, "Zu spät, jemand anderes war schneller.");
  }
  /*
    Schon eingeteilt? Dann normalerweise Schluss. Ausnahme: der Zuschauer.
    Wer dort einspringt und bisher nur als Rookie mitlief, wird von seiner
    Position abgezogen, und die wird wieder ausgeschrieben (Florian,
    23.09.2026). Der Shadow bleibt unberuehrt, sonst stuende der Abend.
  */
  let freigeworden: Position | null = null;
  if (slot.person?.id !== ich.id && schonImDienst(schichten, ich.id, termin)) {
    const bisher = dienstAn(schichten, ich.id, termin);
    if (position !== "ZUSCHAUER" || !darfAbgezogenWerden(ich, bisher)) {
      zurueck(eventId, "An diesem Abend bist du schon eingeteilt.");
    }
    freigeworden = bisher!.position;
  }
  const vorher = slot.suchtErsatz ? slot.person : null;
  await einsatzSetzen({ termin, position, benutzerId: ich.id, suchtErsatz: false, grund: null, von: benutzer.name });

  // Die alte Position wieder ausschreiben, nicht einfach den Eintrag
  // loeschen: Sonst rutscht der feste Tag zurueck und die Person stuende
  // wieder dort, wo sie gerade weggegangen ist.
  if (freigeworden) {
    await einsatzSetzen({
      termin,
      position: freigeworden,
      benutzerId: null,
      suchtErsatz: false,
      grund: null,
      von: `${benutzer.name} (Wechsel zum Zuschauer)`,
    });
  }

  if (vorher && vorher.id !== ich.id) await uebernommenMail({ an: vorher, wer: ich.name, termin, position });
  zurueck(
    eventId,
    `Danke, ${ich.vorname}! Du bist am ${datumMitWochentag(termin.datum)} als ${BEZEICHNUNG[position]} eingetragen.` +
      (freigeworden ? ` ${BEZEICHNUNG[freigeworden]} ist dadurch wieder offen und wird ausgeschrieben.` : ""),
  );
}

/**
 * "Ich lerne mit": Ein Rookie geht auf eine Position, die schon besetzt ist.
 *
 * Der Fall aus dem Alltag: T1 ist vergeben, trotzdem soll Sammy an dem Abend
 * T1 lernen. Dann tauschen die beiden die Rollen: Der Rookie steht auf der
 * Position, der bisherige geht als Shadow mit. Der Abend ist damit weiter
 * besetzt, und im Plan stehen beide Namen nebeneinander (Florian, 23.09.2026).
 *
 * Möglich nur, wenn der Bisherige die Position allein kann und noch kein
 * Shadow eingetragen ist. Er bekommt eine Mail, denn er erfährt es sonst
 * erst am Abend.
 */
export async function mitlernen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, slot, ich } = await schichtLaden(f);
  if (!slot || !ich) zurueck(eventId, "Diese Schicht gibt es nicht.");
  if (position === "SHADOW") zurueck(eventId, "Beim Shadow geht das nicht.");
  const feste = position as FestePosition;
  if (!istRookieFuer(ich, feste)) {
    zurueck(eventId, `Du bist bei ${BEZEICHNUNG[position]} kein Rookie mehr. Trag dich normal ein, wenn die Schicht offen ist.`);
  }
  const bisher = slot.person;
  if (!bisher) zurueck(eventId, "Diese Schicht ist offen, du kannst sie direkt übernehmen.");
  if (bisher.id === ich.id) zurueck(eventId, "Du stehst da schon.");
  if (istRookieFuer(bisher, feste)) {
    zurueck(eventId, `${bisher.vorname} lernt selbst noch. Zwei Rookies auf einer Position gehen nicht.`);
  }
  if (schonImDienst(schichten, ich.id, termin)) {
    zurueck(eventId, "An diesem Abend bist du schon eingeteilt.");
  }
  const schatten = schichten
    .find((x) => x.termin.ditixEventId === eventId)
    ?.slots.find((x) => x.position === "SHADOW");
  if (schatten?.person) {
    zurueck(eventId, `Hier lernt schon jemand mit, ${schatten.person.vorname} geht als Shadow mit.`);
  }

  // Erst den Rookie auf die Position, dann den bisherigen als Shadow. In
  // dieser Reihenfolge, damit die Shadow-Zeile überhaupt entsteht.
  await einsatzSetzen({ termin, position, benutzerId: ich.id, suchtErsatz: false, grund: null, von: benutzer.name });
  await einsatzSetzen({ termin, position: "SHADOW", benutzerId: bisher.id, suchtErsatz: false, grund: null, von: benutzer.name });
  await mitlernenMail({ an: bisher, rookie: ich.name, termin, position });

  zurueck(
    eventId,
    `Du lernst am ${datumMitWochentag(termin.datum)} ${BEZEICHNUNG[position]}, ${bisher.vorname} geht als Shadow mit und hat eine Mail bekommen.`,
  );
}

/**
 * "Ich kann nicht": Die Kollegen der gleichen Position bekommen eine Mail
 * und sehen die Schicht im Eventmanager. Bis jemand übernimmt, bleibt die
 * Schicht bei der Person.
 */
export async function ersatzSuchen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, personen, slot, ich, abwesend } = await schichtLaden(f);
  if (!slot || !ich || slot.person?.id !== ich.id) zurueck(eventId, "Das ist nicht deine Schicht.");
  const grund = text(f, "grund").slice(0, 120) || null;

  await einsatzSetzen({ termin, position, benutzerId: ich.id, suchtErsatz: true, grund, von: benutzer.name });
  const an = werKann(personen, position, ich.id, slot.fuer).filter(
    (p) => !schonImDienst(schichten, p.id, termin) && !istAbwesend(abwesend, p.id, termin.datum),
  );
  const fehler = await ersatzGesuchtMail({ an, wer: ich.name, termin, position, grund });
  await ersatzGefragtMerken(termin, position, an.length - (fehler?.length ?? 0));
  zurueck(
    eventId,
    an.length
      ? `Angefragt: ${an.map((p) => p.vorname).join(", ")} ${an.length === 1 ? "hat" : "haben"} eine Mail bekommen. Bis jemand übernimmt, bleibt die Schicht bei dir.`
      : "Angefragt. Gerade gibt es niemanden, der übernehmen könnte. Bitte sag Florian direkt Bescheid.",
  );
}

/** Doch nicht: Die Anfrage zurücknehmen. */
export async function anfrageZuruecknehmen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, slot, ich } = await schichtLaden(f);
  if (!slot || !ich || slot.person?.id !== ich.id) zurueck(eventId, "Das ist nicht deine Schicht.");
  if (slot.fest) await einsatzLoeschen(eventId, position);
  else await einsatzSetzen({ termin, position, benutzerId: ich.id, suchtErsatz: false, grund: null, von: benutzer.name });
  zurueck(eventId, "Alles klar, du arbeitest wieder selbst.");
}

/**
 * Florian oder das Büro teilen ein.
 * wert: "fest" = zurück zum festen Plan, "offen" = jemand wird gesucht, sonst die Benutzer-ID.
 */
export async function einteilen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, personen, slot, abwesend } = await schichtLaden(f);
  if (benutzer.rolle !== "chef" && benutzer.rolle !== "team") throw new Error("Nicht erlaubt.");
  const wert = text(f, "wert");
  if (wert === "fest") {
    await einsatzLoeschen(eventId, position);
    zurueck(eventId, "Zurück auf dem festen Plan.");
  }
  if (wert === "offen") {
    await einsatzSetzen({ termin, position, benutzerId: null, suchtErsatz: false, grund: null, von: benutzer.name });
    const an = werKann(personen, position, slot?.person?.id, slot?.fuer).filter(
      (p) => !schonImDienst(schichten, p.id, termin) && !istAbwesend(abwesend, p.id, termin.datum),
    );
    await ersatzGesuchtMail({ an, wer: benutzer.name.split(" ")[0] + " (Büro)", termin, position, grund: "Schicht ist frei" });
    zurueck(eventId, `Offen. ${an.length} ${an.length === 1 ? "Person hat" : "Personen haben"} eine Mail bekommen.`);
  }
  const p = personen.find((x) => x.id === wert);
  if (!p) zurueck(eventId, "Diese Person gibt es nicht.");
  await einsatzSetzen({ termin, position, benutzerId: p.id, suchtErsatz: false, grund: null, von: benutzer.name });
  const notiz = text(f, "notiz").slice(0, 300) || null;
  if (p.id !== benutzer.id) await eingeteiltMail({ an: p, wer: benutzer.name, termin, position, notiz });
  zurueck(eventId, `${p.name} ist eingeteilt und hat eine Mail bekommen.`);
}

/**
 * Jemanden direkt anfragen: Nur diese Person bekommt eine Mail und
 * entscheidet selbst. Bis zur Zusage bleibt die Schicht, wie sie ist
 * (Florian, 21.09.2026).
 */
export async function anfragen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, personen, slot, abwesend } = await schichtLaden(f);
  if (benutzer.rolle !== "chef" && benutzer.rolle !== "team") throw new Error("Nicht erlaubt.");
  const p = personen.find((x) => x.id === text(f, "wert"));
  if (!p) zurueck(eventId, "Bitte erst eine Person auswählen, dann anfragen.");
  if (slot?.person?.id === p.id) zurueck(eventId, `${p.vorname} ist hier schon eingeteilt.`);
  if (schonImDienst(schichten, p.id, termin)) zurueck(eventId, `${p.vorname} ist an diesem Abend schon eingeteilt.`);
  if (istAbwesend(abwesend, p.id, termin.datum)) zurueck(eventId, `${p.vorname} hat sich für diesen Tag abgemeldet.`);
  const notiz = text(f, "notiz").slice(0, 300) || null;

  await anfrageSetzen({
    termin,
    position,
    benutzerId: slot?.person?.id ?? null,
    angefragtId: p.id,
    vonId: benutzer.id,
    von: benutzer.name,
    notiz,
  });
  await anfrageMail({ an: p, wer: benutzer.name, termin, position, notiz });
  zurueck(eventId, `${p.name} ist gefragt und hat eine Mail bekommen. Eingeteilt ist er erst mit seiner Zusage.`);
}

/** "Ja, ich mache das": Die angefragte Person sagt zu. */
export async function anfrageZusagen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, slot, ich } = await schichtLaden(f);
  if (!slot || !ich || slot.angefragt?.id !== ich.id) zurueck(eventId, "Diese Anfrage gibt es nicht mehr.");
  const fragte = slot.angefragtVon;
  await einsatzSetzen({ termin, position, benutzerId: ich.id, suchtErsatz: false, grund: null, von: benutzer.name });
  if (fragte) await anfrageAntwortMail({ an: fragte, wer: ich.name, termin, position, zugesagt: true });
  zurueck(eventId, `Danke, ${ich.vorname}! Du bist am ${datumMitWochentag(termin.datum)} als ${BEZEICHNUNG[position]} eingetragen.`);
}

/** "Leider nicht": Die Anfrage wird abgelehnt, der Fragende bekommt Bescheid. */
export async function anfrageAbsagen(f: FormData): Promise<void> {
  const { eventId, position, termin, slot, ich } = await schichtLaden(f);
  if (!slot || !ich || slot.angefragt?.id !== ich.id) zurueck(eventId, "Diese Anfrage gibt es nicht mehr.");
  const fragte = slot.angefragtVon;
  const grund = text(f, "grund").slice(0, 120) || null;
  await anfrageLoeschen(eventId, position);
  if (fragte) await anfrageAntwortMail({ an: fragte, wer: ich.name, termin, position, zugesagt: false, grund });
  zurueck(eventId, "Alles klar, abgesagt. Der Dienstplan bleibt wie vorher.");
}

/** Das Büro nimmt eine Anfrage zurück. */
export async function anfrageAbbrechen(f: FormData): Promise<void> {
  const { benutzer, eventId, position } = await schichtLaden(f);
  if (benutzer.rolle !== "chef" && benutzer.rolle !== "team") throw new Error("Nicht erlaubt.");
  await anfrageLoeschen(eventId, position);
  zurueck(eventId, "Anfrage zurückgenommen.");
}

/* ------------------------------------------------------------------ *
 * Urlaub und private Termine.
 *
 * Die meisten im Showteam haben den Dienst als Nebenjob und wissen früh,
 * wann sie weg sind. Wer den Zeitraum hier eintraegt, dessen Schichten
 * werden sofort ausgeschrieben, und er wird in der Zeit nicht gefragt.
 * ------------------------------------------------------------------ */

function zurueckZumPlan(meldung: string): never {
  revalidatePath("/dienstplan");
  redirect(`/dienstplan?meldung=${encodeURIComponent(meldung)}#urlaub`);
}

export async function urlaubEintragen(f: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  const von = text(f, "von");
  const bis = text(f, "bis") || von;
  const grund = text(f, "grund").slice(0, 120);
  const istDatum = (d: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d);
  if (!istDatum(von) || !istDatum(bis)) zurueckZumPlan("Bitte einen Zeitraum auswählen.");
  if (bis < von) zurueckZumPlan("Das Ende liegt vor dem Anfang.");

  await abwesendEintragen({ benutzerId: benutzer.id, von, bis, grund });

  // Alle eigenen Schichten in dem Zeitraum ausschreiben.
  const { schichten, personen } = await planLaden();
  const betroffen: Array<{ termin: Vorstellungstermin; position: Position }> = [];
  for (const s of schichten) {
    if (s.termin.datum < von || s.termin.datum > bis) continue;
    for (const slot of s.slots) {
      if (slot.person?.id !== benutzer.id || slot.suchtErsatz) continue;
      await einsatzSetzen({
        termin: s.termin,
        position: slot.position,
        benutzerId: benutzer.id,
        suchtErsatz: true,
        grund: grund || "Urlaub",
        von: benutzer.name,
      });
      betroffen.push({ termin: s.termin, position: slot.position });
    }
  }

  // Je Kollege eine Mail mit allen Schichten, nicht eine Mail je Schicht.
  const jePerson = new Map<string, { person: Person; liste: Array<{ termin: Vorstellungstermin; position: Position }> }>();
  for (const b of betroffen) {
    for (const p of werKann(personen, b.position, benutzer.id)) {
      if (schonImDienst(schichten, p.id, b.termin)) continue;
      const e = jePerson.get(p.id) ?? { person: p, liste: [] };
      e.liste.push(b);
      jePerson.set(p.id, e);
    }
  }
  for (const e of jePerson.values()) {
    await offeneSchichtenMail({ an: e.person, schichten: e.liste, dringend: false });
  }

  zurueckZumPlan(
    betroffen.length === 0
      ? "Eingetragen. In der Zeit bist du nicht eingeteilt, und wir fragen dich auch nicht."
      : `Eingetragen. ${betroffen.length} ${betroffen.length === 1 ? "Schicht ist" : "Schichten sind"} ausgeschrieben, die Kollegen haben eine Mail bekommen.`,
  );
}

export async function urlaubLoeschen(f: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  const buero = benutzer.rolle === "chef" || benutzer.rolle === "team";
  await abwesendLoeschen(text(f, "id"), buero ? undefined : benutzer.id);
  zurueckZumPlan("Eintrag gelöscht. Schichten, die schon ausgeschrieben sind, bleiben ausgeschrieben.");
}

// ---------------------------------------------------------------------------
// Einrichtung, nur Florian

async function nurChef() {
  const b = await angemeldeterBenutzer();
  if (!b || b.rolle !== "chef") throw new Error("Nur für die Geschäftsführung.");
  return b;
}

/** Wer welche Position kann. Checkboxen "kann:<id>:<Position>" und "lernt:<id>". */
export async function positionenSpeichern(f: FormData): Promise<void> {
  await nurChef();
  const ids = f.getAll("person").map(String);
  const sql = db();
  for (const id of ids) {
    await sql`delete from dienst_quali where benutzer_id = ${id}`;
    for (const pos of POSITIONEN) {
      if (!f.get(`kann:${id}:${pos}`)) continue;
      // Der Haken steht je Position: Wer die Show dort allein kann, ist
      // vollwertig, alle anderen sind Rookie (Florian, 21.09.2026).
      const lernt = Boolean(f.get(`lernt:${id}:${pos}`));
      await sql`insert into dienst_quali (benutzer_id, position, lernt) values (${id}, ${pos}, ${lernt})`;
    }
  }
  revalidatePath("/dienstplan");
  redirect(`/dienstplan/einrichtung?meldung=${encodeURIComponent("Positionen gespeichert.")}`);
}

/** Feste Tage. Felder "fest:<Position>:<Wochentag oder alle>" mit einer Benutzer-ID oder leer. */
export async function festeTageSpeichern(f: FormData): Promise<void> {
  await nurChef();
  const sql = db();
  await sql`delete from dienst_fest`;
  for (const pos of POSITIONEN) {
    for (const tag of ["alle", "0", "1", "2", "3", "4", "5", "6"]) {
      const id = text(f, `fest:${pos}:${tag}`);
      if (!id) continue;
      const wt = tag === "alle" ? null : Number(tag);
      await sql`insert into dienst_fest (position, wochentag, benutzer_id) values (${pos as FestePosition}, ${wt}, ${id})`;
    }
  }
  if (f.get("erledigt")) {
    await sql`update dienst_einstellung set feste_tage_erledigt_am = now() where id = 1`;
  }
  revalidatePath("/dienstplan");
  revalidatePath("/", "layout");
  redirect(`/dienstplan/einrichtung?meldung=${encodeURIComponent("Feste Tage gespeichert.")}`);
}

/** Einladungslink fürs Showteam: neu erzeugen (der alte gilt dann nicht mehr) oder abschalten. */
export async function einladungErneuern(): Promise<void> {
  const b = await nurChef();
  await neueEinladung(b.name);
  redirect(`/dienstplan/einrichtung?meldung=${encodeURIComponent("Neuer Einladungslink erstellt. Der alte gilt nicht mehr.")}#einladung`);
}

export async function einladungAus(): Promise<void> {
  await nurChef();
  await einladungAbschalten();
  redirect(`/dienstplan/einrichtung?meldung=${encodeURIComponent("Einladungslink abgeschaltet.")}#einladung`);
}

/* ------------------------------------------------------------------ *
 * Kommentare unter einer Show
 *
 * Wie unter einem Beitrag bei Facebook: schreiben, antworten, Herz geben.
 * Lesen und schreiben darf jeder, der den Dienstplan sieht. Löschen nur
 * der Verfasser und das Büro (Florian, 23.09.2026).
 * ------------------------------------------------------------------ */

export async function kommentieren(f: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  const eventId = text(f, "vorstellung");
  const inhalt = text(f, "text");
  const antwortAuf = text(f, "antwortAuf") || null;
  if (!inhalt) zurueck(eventId, "Da stand nichts drin.");

  const neu = await kommentarSchreiben({
    ditixEventId: eventId,
    benutzerId: benutzer.id,
    text: inhalt,
    antwortAuf,
  });
  if (!neu) zurueck(eventId, "Da stand nichts drin.");

  // Benachrichtigen, sonst schreibt jemand ins Leere. Fehler beim Mailen
  // dürfen den Kommentar nicht verschlucken, er steht ja schon da.
  try {
    const termin = await findeTermin(eventId);
    const wer = await beteiligte(eventId, benutzer.id);
    if (termin && wer.length > 0) {
      const { personen } = await planLaden();
      const an = personen.filter((p) => wer.some((w) => w.id === p.id));
      if (an.length > 0) {
        await kommentarMail({ an, wer: benutzer.name, termin, text: inhalt, antwort: Boolean(antwortAuf) });
      }
    }
  } catch (fehler) {
    console.error("[dienstplan] Kommentarmail:", fehler instanceof Error ? fehler.message : fehler);
  }

  zurueck(eventId, antwortAuf ? "Antwort steht drunter." : "Dein Kommentar steht drunter.");
}

export async function kommentarWeg(f: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  const eventId = text(f, "vorstellung");
  await kommentarLoeschen(text(f, "kommentar"), benutzer.id, benutzer.rolle === "chef" || benutzer.rolle === "team");
  zurueck(eventId, "Kommentar gelöscht.");
}

/** Herz geben oder wieder wegnehmen. */
export async function herzGeben(f: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  const eventId = text(f, "vorstellung");
  await herzUmlegen(text(f, "kommentar"), benutzer.id);
  revalidatePath("/dienstplan");
  redirect(`/dienstplan?s=${eventId}#s-${eventId}`);
}

/**
 * "Alle fragen": Der Aufruf fürs ganze Haus, wer den eingeweihten
 * Zuschauer spielt.
 *
 * Diese Position kann jeder, deshalb geht die Mail an alle internen
 * Mitarbeiter statt nur an eine Position (Florian, 23.09.2026). Wer schon
 * an dem Abend eingeteilt oder abgemeldet ist, bleibt außen vor.
 */
export async function alleFragen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, personen, slot, abwesend } = await schichtLaden(f);
  if (benutzer.rolle !== "chef" && !darfEinladen(benutzer)) {
    zurueck(eventId, "Das dürfen nur Florian und Kevin.");
  }
  if (position !== "ZUSCHAUER") zurueck(eventId, "Diesen Aufruf gibt es nur beim Zuschauer.");
  if (!slot?.offen) zurueck(eventId, "Die Position ist schon besetzt.");

  const notiz = text(f, "notiz").slice(0, 200) || null;
  /*
    Gefragt wird, wer an dem Abend frei ist. Dazu die Rookies, die zwar
    eingeteilt sind, aber nur mitlernen: Die darf man abziehen, und ihre
    Position wird dann automatisch wieder ausgeschrieben (Florian,
    23.09.2026).
  */
  const an = personen.filter((p) => {
    if (p.id === benutzer.id) return false;
    // Nie Externe fragen, auch nicht beim Aufruf ans ganze Haus
    // (Florian, 24.09.2026).
    if (!darfGefragtWerden(p)) return false;
    if (istAbwesend(abwesend, p.id, termin.datum)) return false;
    if (!schonImDienst(schichten, p.id, termin)) return true;
    return darfAbgezogenWerden(p, dienstAn(schichten, p.id, termin));
  });
  if (an.length === 0) zurueck(eventId, "An diesem Abend ist niemand frei, den wir fragen könnten.");

  await zuschauerGesuchtMail({ an, termin, wer: benutzer.name, notiz });
  // Festhalten, dass der Aufruf raus ist: Sonst schickt ihn eine Stunde
  // später jemand ein zweites Mal (Florian, 23.09.2026).
  await ersatzGefragtMerken(termin, position, an.length);
  zurueck(
    eventId,
    `${an.length} Kollegen wurden gefragt, wer am ${datumMitWochentag(termin.datum)} den Zuschauer macht.`,
  );
}

/**
 * "Nochmal fragen": Die Kollegen der Position erneut anschreiben.
 *
 * Für Florian und Kevin, wenn auf die erste Runde niemand reagiert hat
 * oder eine Mail hängen geblieben ist (Florian, 23.09.2026).
 */
export async function nochmalFragen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, personen, slot, abwesend } = await schichtLaden(f);
  if (benutzer.rolle !== "chef" && !darfEinladen(benutzer)) zurueck(eventId, "Das dürfen nur Florian und Kevin.");
  if (!slot) zurueck(eventId, "Diese Schicht gibt es nicht.");

  const an = werKann(personen, position, slot.person?.id ?? null, slot.fuer).filter(
    (p) => !schonImDienst(schichten, p.id, termin) && !istAbwesend(abwesend, p.id, termin.datum),
  );
  if (an.length === 0) zurueck(eventId, "Gerade ist niemand frei, den wir fragen könnten.");

  const fehler = await ersatzGesuchtMail({
    an,
    wer: slot.person?.name ?? benutzer.name,
    termin,
    position,
    grund: slot.grund,
  });
  await ersatzGefragtMerken(termin, position, an.length - (fehler?.length ?? 0));
  zurueck(eventId, `Nochmal gefragt: ${an.map((p) => p.vorname).join(", ")}.`);
}
