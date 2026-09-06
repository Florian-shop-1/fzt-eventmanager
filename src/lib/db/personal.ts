"use server";

/**
 * Geheimhaltungsvereinbarungen in der Datenbank.
 *
 * Die Angaben stehen einmal, das Blatt entsteht daraus, und wer
 * unterschrieben hat, ist auf einen Blick zu sehen. Vorher lag für jede
 * Person eine eigene Word-Datei auf SharePoint.
 */

import { revalidatePath } from "next/cache";
import { db } from "./client";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";

export interface Vereinbarung {
  id: string;
  benutzerId: string | null;
  name: string;
  geburtsdatum: string;
  strasse: string;
  plz: string;
  ort: string;
  geaendertAm: string;
  unterschriebenAm: string | null;
  unterschriebenVon: string | null;
  notiz: string | null;
}

function zuVereinbarung(z: Record<string, unknown>): Vereinbarung {
  return {
    id: String(z.id),
    benutzerId: z.benutzer_id ? String(z.benutzer_id) : null,
    name: String(z.name),
    geburtsdatum: String(z.geburtsdatum),
    strasse: String(z.strasse),
    plz: String(z.plz),
    ort: String(z.ort),
    geaendertAm: new Date(z.geaendert_am as string).toISOString(),
    unterschriebenAm: z.unterschrieben_am
      ? new Date(z.unterschrieben_am as string).toISOString()
      : null,
    unterschriebenVon: (z.unterschrieben_von as string) ?? null,
    notiz: (z.notiz as string) ?? null,
  };
}

/** Die eigene Vereinbarung, falls schon Angaben hinterlegt sind. */
export async function meineVereinbarung(): Promise<Vereinbarung | null> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return null;

  const zeilen = (await db()`
    select * from geheimhaltung where benutzer_id = ${benutzer.id} limit 1
  `) as Array<Record<string, unknown>>;

  return zeilen[0] ? zuVereinbarung(zeilen[0]) : null;
}

/** Alle Vereinbarungen, für die Übersicht des Inhabers. */
export async function alleVereinbarungen(): Promise<Vereinbarung[]> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfBenutzerVerwalten(benutzer.rolle)) return [];

  const zeilen = (await db()`
    select * from geheimhaltung order by unterschrieben_am nulls first, name
  `) as Array<Record<string, unknown>>;

  return zeilen.map(zuVereinbarung);
}

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

/**
 * Speichert die eigenen Angaben.
 *
 * Jeder pflegt seine eigenen. Fremde Angaben zu ändern ist nicht
 * vorgesehen: Was auf einem unterschriebenen Vertrag steht, soll
 * niemand nachträglich anfassen können.
 */
export async function angabenSpeichern(formData: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");

  const name = text(formData, "name") || benutzer.name;
  const geburtsdatum = text(formData, "geburtsdatum");
  const strasse = text(formData, "strasse");
  const plz = text(formData, "plz");
  const ort = text(formData, "ort");

  await db()`
    insert into geheimhaltung (benutzer_id, name, geburtsdatum, strasse, plz, ort)
    values (${benutzer.id}, ${name}, ${geburtsdatum}, ${strasse}, ${plz}, ${ort})
    on conflict (benutzer_id) do update
       set name = excluded.name,
           geburtsdatum = excluded.geburtsdatum,
           strasse = excluded.strasse,
           plz = excluded.plz,
           ort = excluded.ort,
           geaendert_am = now()
  `;

  revalidatePath("/geheimhaltung");
}

/**
 * Hakt eine Vereinbarung als unterschrieben ab, oder nimmt das zurück.
 *
 * Nur der Inhaber: Das ist die Bestätigung, dass das unterschriebene
 * Blatt tatsächlich vorliegt, und die soll nicht jeder für sich selbst
 * setzen können.
 */
export async function unterschriftAbhaken(id: string, zurueck: boolean): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || !darfBenutzerVerwalten(benutzer.rolle)) {
    throw new Error("Nur der Inhaber darf Unterschriften bestätigen.");
  }

  if (zurueck) {
    await db()`
      update geheimhaltung set unterschrieben_am = null, unterschrieben_von = null
       where id = ${id}
    `;
  } else {
    await db()`
      update geheimhaltung
         set unterschrieben_am = now(), unterschrieben_von = ${benutzer.name}
       where id = ${id}
    `;
  }

  revalidatePath("/geheimhaltung");
}
