"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { findeTermin } from "@/lib/ditix/spielplan";
import { datumMitWochentag } from "@/lib/zeit";
import { planLaden } from "@/lib/dienstplan/laden";
import { eingeteiltMail, ersatzGesuchtMail, uebernommenMail } from "@/lib/dienstplan/mails";
import {
  BEZEICHNUNG,
  POSITIONEN,
  darfUebernehmen,
  einsatzLoeschen,
  einsatzSetzen,
  schonImDienst,
  werKann,
  type FestePosition,
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
  const { schichten, personen } = await planLaden();
  const schicht = schichten.find((s) => s.termin.ditixEventId === eventId);
  const slot = schicht?.slots.find((s) => s.position === position);
  const ich = personen.find((p) => p.id === benutzer.id);
  return { benutzer, eventId, position, termin, schichten, personen, slot, ich };
}

/** "Ich übernehme": eine offene Schicht, oder als Shadow mitlaufen. */
export async function uebernehmen(f: FormData): Promise<void> {
  const { benutzer, eventId, position, termin, schichten, slot, ich } = await schichtLaden(f);
  if (!slot || !ich) zurueck(eventId, "Diese Schicht gibt es nicht.");
  if (!darfUebernehmen(ich, position)) {
    zurueck(eventId, `${BEZEICHNUNG[position]} ist nicht bei deinen Positionen eingetragen. Florian kann das ändern.`);
  }
  if (position === "SHADOW" ? slot.person !== null : !slot.offen) {
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
  const { benutzer, eventId, position, termin, schichten, personen, slot, ich } = await schichtLaden(f);
  if (!slot || !ich || slot.person?.id !== ich.id) zurueck(eventId, "Das ist nicht deine Schicht.");
  const grund = text(f, "grund").slice(0, 120) || null;

  // Shadow ist freiwillig. Wer nicht kann, trägt sich einfach aus.
  if (position === "SHADOW") {
    await einsatzLoeschen(eventId, position);
    zurueck(eventId, "Du bist ausgetragen.");
  }

  await einsatzSetzen({ termin, position, benutzerId: ich.id, suchtErsatz: true, grund, von: benutzer.name });
  const an = werKann(personen, position, ich.id).filter((p) => !schonImDienst(schichten, p.id, termin));
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
  const { benutzer, eventId, position, termin, schichten, personen, slot } = await schichtLaden(f);
  if (benutzer.rolle !== "chef" && benutzer.rolle !== "team") throw new Error("Nicht erlaubt.");
  const wert = text(f, "wert");
  if (wert === "fest") {
    await einsatzLoeschen(eventId, position);
    zurueck(eventId, "Zurück auf dem festen Plan.");
  }
  if (wert === "offen") {
    if (position === "SHADOW") {
      await einsatzLoeschen(eventId, position);
      zurueck(eventId, "Shadow ist wieder frei.");
    }
    await einsatzSetzen({ termin, position, benutzerId: null, suchtErsatz: false, grund: null, von: benutzer.name });
    const an = werKann(personen, position, slot?.person?.id).filter((p) => !schonImDienst(schichten, p.id, termin));
    await ersatzGesuchtMail({ an, wer: benutzer.name.split(" ")[0] + " (Büro)", termin, position, grund: "Schicht ist frei" });
    zurueck(eventId, `Offen. ${an.length} ${an.length === 1 ? "Person hat" : "Personen haben"} eine Mail bekommen.`);
  }
  const p = personen.find((x) => x.id === wert);
  if (!p) zurueck(eventId, "Diese Person gibt es nicht.");
  await einsatzSetzen({ termin, position, benutzerId: p.id, suchtErsatz: false, grund: null, von: benutzer.name });
  if (p.id !== benutzer.id) await eingeteiltMail({ an: p, wer: benutzer.name, termin, position });
  zurueck(eventId, `${p.name} ist eingeteilt und hat eine Mail bekommen.`);
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
      const lernt = pos === "T2" && Boolean(f.get(`lernt:${id}`));
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
