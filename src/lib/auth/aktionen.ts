"use server";

/**
 * Anmelden, abmelden, Passwort ändern, Benutzer verwalten.
 *
 * Bewusste Entscheidung: Es werden keine Einladungsmails verschickt. Wer
 * einen Zugang anlegt, bekommt ein Startpasswort angezeigt und gibt es
 * persönlich weiter. Das spart einen Mailversand und ist bei fünf Personen
 * der einfachere Weg.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import {
  passwortPruefen,
  passwortStimmt,
  passwortVerschluesseln,
  startpasswortErzeugen,
} from "./passwort";
import {
  angemeldeterBenutzer,
  darfBenutzerVerwalten,
  sitzungBeenden,
  sitzungStarten,
  type Rolle,
} from "./sitzung";

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

export interface AnmeldeErgebnis {
  fehler?: string;
}

/** Meldet einen Benutzer an. */
export async function anmelden(
  _vorher: AnmeldeErgebnis,
  formData: FormData,
): Promise<AnmeldeErgebnis> {
  const email = text(formData, "email").toLowerCase();
  const passwort = String(formData.get("passwort") ?? "");

  if (!email || !passwort) {
    return { fehler: "Bitte E-Mail und Passwort eingeben." };
  }

  const zeilen = (await db()`
    select id, passwort_hash, aktiv from benutzer where lower(email) = ${email}
  `) as Array<{ id: string; passwort_hash: string | null; aktiv: boolean }>;

  // Absichtlich dieselbe Meldung für "Benutzer unbekannt" und "Passwort
  // falsch": sonst ließe sich herausfinden, welche Adressen existieren.
  const abgelehnt = { fehler: "E-Mail oder Passwort stimmt nicht." };

  if (zeilen.length === 0) return abgelehnt;
  const b = zeilen[0];
  if (!b.aktiv || !b.passwort_hash) return abgelehnt;
  if (!(await passwortStimmt(passwort, b.passwort_hash))) return abgelehnt;

  await db()`update benutzer set letzter_login = now() where id = ${b.id}`;
  await sitzungStarten(b.id);
  redirect("/");
}

export async function abmelden(): Promise<void> {
  await sitzungBeenden();
  redirect("/anmelden");
}

export interface PasswortErgebnis {
  fehler?: string;
  erfolg?: string;
}

/** Ändert das eigene Passwort. */
export async function passwortAendern(
  _vorher: PasswortErgebnis,
  formData: FormData,
): Promise<PasswortErgebnis> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return { fehler: "Nicht angemeldet." };

  const alt = String(formData.get("alt") ?? "");
  const neu = String(formData.get("neu") ?? "");
  const wiederholung = String(formData.get("wiederholung") ?? "");

  if (neu !== wiederholung) return { fehler: "Die beiden neuen Passwörter sind nicht gleich." };

  const meckern = passwortPruefen(neu);
  if (meckern) return { fehler: meckern };

  const zeilen = (await db()`
    select passwort_hash from benutzer where id = ${benutzer.id}
  `) as Array<{ passwort_hash: string | null }>;

  if (!zeilen[0]?.passwort_hash || !(await passwortStimmt(alt, zeilen[0].passwort_hash))) {
    return { fehler: "Das bisherige Passwort stimmt nicht." };
  }

  await db()`
    update benutzer
       set passwort_hash = ${await passwortVerschluesseln(neu)},
           passwort_geaendert_am = now(),
           muss_passwort_aendern = false,
           -- Ab jetzt gehört das Passwort dem Benutzer allein.
           startpasswort = null
     where id = ${benutzer.id}
  `;

  revalidatePath("/konto");
  return { erfolg: "Passwort geändert." };
}

export interface BenutzerErgebnis {
  fehler?: string;
  /** Wird nach dem Anlegen einmal angezeigt und danach nie wieder. */
  startpasswort?: { name: string; email: string; passwort: string };
}

/** Legt einen neuen Zugang an und gibt das Startpasswort zurück. */
export async function benutzerAnlegen(
  _vorher: BenutzerErgebnis,
  formData: FormData,
): Promise<BenutzerErgebnis> {
  const ich = await angemeldeterBenutzer();
  if (!ich || !darfBenutzerVerwalten(ich.rolle)) {
    return { fehler: "Nur die Geschäftsführung darf Zugänge anlegen." };
  }

  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const rolle = text(formData, "rolle") as Rolle;

  if (!name || !email) return { fehler: "Name und E-Mail werden gebraucht." };
  if (!["chef", "team", "gastro", "foyer"].includes(rolle))
    return { fehler: "Unbekannte Rolle." };

  const vorhanden = (await db()`
    select id from benutzer where lower(email) = ${email}
  `) as Array<{ id: string }>;
  if (vorhanden.length > 0) return { fehler: "Diese E-Mail hat schon einen Zugang." };

  const passwort = startpasswortErzeugen();
  await db()`
    insert into benutzer (name, email, rolle, passwort_hash, muss_passwort_aendern, startpasswort)
    values (${name}, ${email}, ${rolle}, ${await passwortVerschluesseln(passwort)}, true,
            ${passwort})
  `;

  revalidatePath("/einstellungen/benutzer");
  return { startpasswort: { name, email, passwort } };
}

/** Setzt ein neues Startpasswort, wenn jemand seines vergessen hat. */
export async function passwortZuruecksetzen(benutzerId: string): Promise<BenutzerErgebnis> {
  const ich = await angemeldeterBenutzer();
  if (!ich || !darfBenutzerVerwalten(ich.rolle)) {
    return { fehler: "Nur die Geschäftsführung darf Passwörter zurücksetzen." };
  }

  const zeilen = (await db()`
    select name, email from benutzer where id = ${benutzerId}
  `) as Array<{ name: string; email: string }>;
  if (zeilen.length === 0) return { fehler: "Zugang nicht gefunden." };

  const passwort = startpasswortErzeugen();
  await db()`
    update benutzer
       set passwort_hash = ${await passwortVerschluesseln(passwort)},
           muss_passwort_aendern = true,
           startpasswort = ${passwort}
     where id = ${benutzerId}
  `;

  revalidatePath("/einstellungen/benutzer");
  return { startpasswort: { name: zeilen[0].name, email: zeilen[0].email, passwort } };
}

/** Schaltet einen Zugang ab oder wieder frei. */
export async function benutzerUmschalten(benutzerId: string): Promise<void> {
  const ich = await angemeldeterBenutzer();
  if (!ich || !darfBenutzerVerwalten(ich.rolle)) return;
  if (ich.id === benutzerId) return; // sich selbst nicht aussperren

  await db()`update benutzer set aktiv = not aktiv where id = ${benutzerId}`;
  revalidatePath("/einstellungen/benutzer");
}
