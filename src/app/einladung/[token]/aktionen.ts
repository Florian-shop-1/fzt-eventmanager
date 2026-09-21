"use server";

/**
 * Selbst eintragen über den Einladungslink: Zugang anlegen, Position
 * merken, anmelden, ab in den Dienstplan. Florian bekommt eine Mail.
 */

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { sitzungStarten } from "@/lib/auth/sitzung";
import { passwortPruefen, passwortVerschluesseln } from "@/lib/auth/passwort";
import { einladungBenutzt, einladungLesen } from "@/lib/dienstplan/einladung";
import { VORSCHLAG_FEST } from "@/lib/dienstplan/plan";
import { appUrl } from "@/lib/dienstplan/mails";
import { mailVerschicken } from "@/lib/mail/versand";

/** Nur Florian, nicht alle Chefs: sonst bekommen vier Leute jede Anmeldung. */
const FLORIAN = "info@florianzimmer.com";

export type EinladungsErgebnis = { fehler?: string; felder?: Record<string, string> };

/**
 * Intern oder extern, wenn es der Link nicht vorgibt. Die Gastronomie und
 * der Food-Kiosk gehören zu einem anderen Betrieb, die Buchhaltung ist
 * kein Mitarbeiterzugang.
 */
function standardArt(rolle: string): "intern" | "extern" | null {
  if (rolle === "buchhaltung") return null;
  return ["gastro", "kiosk"].includes(rolle) ? "extern" : "intern";
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Was man beim Selbst-Eintragen waehlen kann.
 *
 * Immer als Rookie (lernt = true): Wer sich selbst eintraegt, laeuft erst
 * einmal mit einem erfahrenen Kollegen mit. Vollwertig macht daraus nur
 * Florian in der Einrichtung (Florian, 21.09.2026). Vollwertig sind
 * bisher Ben, Mario, Leeven, Levi, Julian und Sabah.
 */
const POSITIONEN: Record<string, { position: "FOH" | "T2" | "T1"; lernt: boolean; text: string }> = {
  FOH: { position: "FOH", lernt: true, text: "FOH (Licht und Ton), Rookie" },
  T1: { position: "T1", lernt: true, text: "Techniker 1, Rookie" },
  T2: { position: "T2", lernt: true, text: "Techniker 2, Rookie" },
};

export async function selbstEintragen(_v: EinladungsErgebnis, f: FormData): Promise<EinladungsErgebnis> {
  const token = text(f, "token");
  const einladung = await einladungLesen(token);
  if (!einladung) {
    return { fehler: "Dieser Einladungslink gilt nicht mehr. Bitte frag Florian nach dem neuen." };
  }
  const showteam = einladung.rolle === "showteam";

  const vorname = text(f, "vorname").slice(0, 60);
  const nachname = text(f, "nachname").slice(0, 60);
  // Bei einer persönlichen Einladung steht die Adresse fest.
  const email = (einladung.email ?? text(f, "email")).toLowerCase().slice(0, 120);
  const passwort = String(f.get("passwort") ?? "");
  const wahl = showteam ? POSITIONEN[text(f, "position")] : null;

  const felder: Record<string, string> = {};
  if (!vorname) felder.vorname = "Bitte deinen Vornamen.";
  if (!nachname) felder.nachname = "Bitte deinen Nachnamen.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) felder.email = "Diese E-Mail-Adresse stimmt nicht.";
  const pw = passwortPruefen(passwort);
  if (pw) felder.passwort = pw;
  if (showteam && !wahl) felder.position = "Bitte wähl aus, was du machst.";
  if (Object.keys(felder).length) return { fehler: "Bitte die markierten Felder prüfen.", felder };

  const vorhanden = (await db()`select id from benutzer where lower(email) = ${email}`) as unknown[];
  if (vorhanden.length) {
    return {
      fehler: "Mit dieser E-Mail gibt es schon einen Zugang. Melde dich einfach an, oder frag Florian nach einem neuen Passwort.",
      felder: { email: "schon vorhanden" },
    };
  }

  const name = `${vorname} ${nachname}`;
  const neu = (await db()`
    insert into benutzer (name, email, rolle, art, passwort_hash, muss_passwort_aendern, personalbogen_am)
    values (${name}, ${email}, ${einladung.rolle}, ${einladung.art ?? standardArt(einladung.rolle)}, ${await passwortVerschluesseln(passwort)}, false,
            ${einladung.personalbogenErledigt ? new Date().toISOString() : null})
    returning id
  `) as Array<{ id: string }>;
  const id = neu[0].id;

  // Liegt die Geheimhaltung schon auf Papier vor, gleich abhaken.
  if (einladung.geheimhaltungErledigt) {
    await db()`
      insert into geheimhaltung (benutzer_id, name, geburtsdatum, strasse, plz, ort, unterschrieben_am, unterschrieben_von, unterschrift_art, notiz)
      values (${id}, ${name}, '', '', '', '', now(), 'Florian Zimmer', 'papier', 'Lag beim Einladen schon vor.')
    `;
  }

  if (!wahl) {
    await einladungBenutzt(token);
    try {
      await mailVerschicken({
        an: FLORIAN,
        betreff: `Neu im Eventmanager: ${name} (${einladung.rolle})`,
        text: `${name} hat sich über die persönliche Einladung eingetragen.\n\nE-Mail: ${email}\nRolle: ${einladung.rolle}`,
      });
    } catch (e) {
      console.error("[einladung] Mail an Florian fehlgeschlagen:", e);
    }
    await sitzungStarten(id);
    redirect("/");
  }

  await db()`insert into dienst_quali (benutzer_id, position, lernt) values (${id}, ${wahl.position}, ${wahl.lernt})`;

  // Feste Tage, die Florian am 18.09.2026 genannt hat (Levi freitags ...),
  // gleich eintragen, sofern der Tag noch frei ist.
  for (const v of VORSCHLAG_FEST) {
    if (v.vorname !== vorname.toLowerCase() || v.position !== wahl!.position) continue;
    await db()`
      insert into dienst_fest (position, wochentag, benutzer_id)
      select ${v.position}, ${v.wochentag}::int, ${id}::uuid
       where not exists (select 1 from dienst_fest where position = ${v.position} and wochentag is not distinct from ${v.wochentag}::int)
    `;
  }
  await einladungBenutzt(token);

  // Florian Bescheid sagen. Scheitert die Mail, ist der Zugang trotzdem da.
  try {
    {
      await mailVerschicken({
        an: FLORIAN,
        betreff: `Neu im Showteam: ${name} (${wahl!.text})`,
        text: `${name} hat sich über den Einladungslink eingetragen.\n\nE-Mail: ${email}\nPosition: ${wahl!.text}\n\nFalls das nicht stimmt: ${appUrl()}/dienstplan/einrichtung`,
      });
    }
  } catch (e) {
    console.error("[einladung] Mail an Florian fehlgeschlagen:", e);
  }

  await sitzungStarten(id);
  redirect(`/dienstplan?meldung=${encodeURIComponent(`Willkommen im Showteam, ${vorname}! Du bist eingetragen. Hier siehst du ab jetzt, wann du arbeitest.`)}`);
}
