"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { findeTermin, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { datumMitWochentag } from "@/lib/zeit";
import { planLaden } from "@/lib/dienstplan/laden";
import {
  anfrageAntwortMail,
  anfrageMail,
  eingeteiltMail,
  ersatzGesuchtMail,
  offeneSchichtenMail,
  uebernommenMail,
} from "@/lib/dienstplan/mails";
import { abwesendEintragen, abwesendLoeschen, istAbwesend } from "@/lib/dienstplan/abwesend";
import { einladungAbschalten, neueEinladung } from "@/lib/dienstplan/einladung";
import {
  BEZEICHNUNG,
  POSITIONEN,
  anfrageLoeschen,
  anfrageSetzen,
  darfUebernehmen,
  einsatzLoeschen,
  einsatzSetzen,
  schonImDienst,
  werKann,
  type FestePosition,
  type Person,
  type Position,
} from "@/lib/dienstplan/plan";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const GUELTIG: Position[] = ["FOH", "T2", "T1", "SHADOW"];

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
  if (slot.person?.id !== ich.id && schonImDienst(schichten, ich.id, termin)) {
    zurueck(eventId, "An diesem Abend bist du schon eingeteilt.");
  }
  const vorher = slot.suchtErsatz ? slot.person : null;
  await einsatzSetzen({ termin, position, benutzerId: ich.id, suchtErsatz: false, grund: null, von: benutzer.name });
  if (vorher && vorher.id !== ich.id) await uebernommenMail({ an: vorher, wer: ich.name, termin, position });
  zurueck(eventId, `Danke, ${ich.vorname}! Du bist am ${datumMitWochentag(termin.datum)} als ${BEZEICHNUNG[position]} eingetragen.`);
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
  await ersatzGesuchtMail({ an, wer: ich.name, termin, position, grund });
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
