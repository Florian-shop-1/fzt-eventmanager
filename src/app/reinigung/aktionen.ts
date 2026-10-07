"use server";

/**
 * Die Zahl der Leute an einer Schicht nachträglich richtigstellen.
 *
 * Wer am Handy danebentippt, merkt es erst, wenn die Rechnung kommt.
 * Dann soll das Büro die Zahl geradeziehen können, statt sie zu glauben.
 *
 * Nur Florian, Kevin und Werner, dieselben wie bei allen Arbeitszeiten.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, darfZeitenAendern } from "@/lib/auth/sitzung";
import { MAX_PERSONEN } from "@/lib/stempel/dienstleister";

const text = (f: FormData, k: string, max = 40) => String(f.get(k) ?? "").trim().slice(0, max);

function zurueck(monat: string, wer: string, meldung: string): never {
  revalidatePath("/reinigung");
  redirect(`/reinigung?monat=${monat}&wer=${wer}&meldung=${encodeURIComponent(meldung)}`);
}

export async function personenAendern(f: FormData): Promise<void> {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfZeitenAendern(b)) redirect("/");

  const monat = text(f, "monat", 7);
  const wer = text(f, "wer");
  const datum = text(f, "datum", 10);
  const von = text(f, "von", 5);
  const personen = Number(text(f, "personen", 3));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !/^\d{2}:\d{2}$/.test(von)) {
    zurueck(monat, wer, "Diese Schicht finden wir nicht.");
  }
  if (!Number.isInteger(personen) || personen < 1 || personen > MAX_PERSONEN) {
    zurueck(monat, wer, `Bitte eine Zahl zwischen 1 und ${MAX_PERSONEN}.`);
  }

  /*
    Die Schicht steht in der Tabelle als Kommen-Stempel. Gesucht wird
    ueber Tag und Uhrzeit, so wie sie auf der Seite stehen, damit die
    Zeile und die Aenderung dasselbe meinen.
  */
  const z = (await db()`
    update stempel set personen = ${personen}
     where benutzer_id = ${wer}::uuid
       and art = 'kommen'
       and (zeitpunkt at time zone 'Europe/Berlin')::date = ${datum}::date
       and to_char(zeitpunkt at time zone 'Europe/Berlin', 'HH24:MI') = ${von}
    returning id
  `.catch(() => [])) as unknown[];

  zurueck(
    monat,
    wer,
    z.length > 0
      ? `${datum.split("-").reverse().join(".")}, ${von} Uhr: jetzt ${personen} ${personen === 1 ? "Person" : "Personen"}.`
      : "Diese Schicht finden wir nicht.",
  );
}
