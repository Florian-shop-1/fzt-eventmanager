"use server";

/**
 * Geheimhaltungsvereinbarungen in der Datenbank.
 *
 * Die Angaben stehen einmal, das Blatt entsteht daraus, und wer
 * unterschrieben hat, ist auf einen Blick zu sehen. Vorher lag für jede
 * Person eine eigene Word-Datei auf SharePoint.
 */

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "./client";
import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import { ganzerText } from "@/lib/personal/geheimhaltung";

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
  /** "papier" oder "online". Leer, solange nichts unterschrieben ist. */
  art: string | null;
  /** Das gezeichnete Namenszeichen, nur beim Online-Weg. */
  bild: string | null;
  ip: string | null;
  geraet: string | null;
  textstand: string | null;
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
    art: (z.unterschrift_art as string) ?? null,
    bild: (z.unterschrift_bild as string) ?? null,
    ip: (z.unterschrift_ip as string) ?? null,
    geraet: (z.unterschrift_geraet as string) ?? null,
    textstand: (z.unterschrift_textstand as string) ?? null,
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
      update geheimhaltung
         set unterschrieben_am = null, unterschrieben_von = null, unterschrift_art = null
       where id = ${id}
    `;
  } else {
    await db()`
      update geheimhaltung
         set unterschrieben_am = now(),
             unterschrieben_von = ${benutzer.name},
             unterschrift_art = 'papier'
       where id = ${id}
    `;
  }

  revalidatePath("/geheimhaltung");
}

/**
 * Unterschreibt online.
 *
 * Ein Häkchen wäre zu wenig. Wer hier unterschreibt, zeichnet seinen
 * Namenszug, und festgehalten wird ausserdem, wann, von welcher Adresse,
 * mit welchem Gerät und welche Fassung des Vertragstextes dabei auf dem
 * Schirm stand.
 *
 * Der letzte Punkt wird gern vergessen und ist der wichtigste: Ohne ihn
 * liesse sich nach einer Textänderung nicht mehr belegen, wozu jemand
 * sein Zeichen gesetzt hat. Gespeichert wird ein Fingerabdruck des
 * Textes, nicht der Text selbst.
 *
 * Unterschreiben darf jeder nur für sich. Deshalb wird die eigene Zeile
 * über die Anmeldung gesucht und nicht über eine mitgeschickte Kennung.
 */
export async function onlineUnterschreiben(formData: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");

  const bild = String(formData.get("unterschrift") ?? "");
  if (!bild.startsWith("data:image/png;base64,")) {
    throw new Error("Es wurde nichts unterschrieben. Zeichne deinen Namenszug in das Feld.");
  }
  // Ein leeres Feld ergibt ein winziges Bild. Alles unter etwa einem
  // Kilobyte ist kein Namenszug, sondern ein Versehen.
  if (bild.length < 1200) {
    throw new Error("Das Feld ist noch leer. Zeichne deinen Namenszug hinein.");
  }

  const kopf = await headers();
  const ip = (kopf.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unbekannt";
  const geraet = (kopf.get("user-agent") ?? "unbekannt").slice(0, 300);
  const textstand = createHash("sha256").update(ganzerText()).digest("hex").slice(0, 16);

  const geaendert = (await db()`
    update geheimhaltung
       set unterschrieben_am = now(),
           unterschrieben_von = ${benutzer.name},
           unterschrift_art = 'online',
           unterschrift_bild = ${bild},
           unterschrift_ip = ${ip},
           unterschrift_geraet = ${geraet},
           unterschrift_textstand = ${textstand}
     where benutzer_id = ${benutzer.id}
     returning id
  `) as Array<{ id: string }>;

  if (geaendert.length === 0) {
    throw new Error("Trag zuerst deine Angaben ein und sichere sie.");
  }

  revalidatePath("/geheimhaltung");
}
