"use server";

/**
 * Menübestellungen aus dem Shop von Hand stornieren und zurückholen.
 *
 * Die Tabelle, aus der die Bestellungen kommen, schreibt der Shop. Ein
 * Storno in Ditix ändert dort nichts: Die Zeile bleibt stehen, und die
 * Küche würde für Gäste kochen, die abgesagt haben (Florian, 02.10.2026).
 *
 * Deshalb wird hier nichts gelöscht, sondern danebengeschrieben: Der
 * Storno steht mit Grund und Namen in der eigenen Datenbank, zählt
 * überall nicht mehr mit und lässt sich zurücknehmen.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";

const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

/*
  Streichen und korrigieren duerfen nur Florian und Kevin.

  "nur kevin und mich stornieren lassen erstmal" (Florian, 02.10.2026).
  Wer hier etwas aendert, aendert die Zahl, nach der eingekauft wird.
*/
async function zugang() {
  const b = await angemeldeterBenutzer();
  if (!darfEinladen(b)) {
    throw new Error("Menüs ändern dürfen nur Florian und Kevin.");
  }
  return b!;
}

/*
  Zurueck dorthin, wo storniert wurde.

  Die Gastro arbeitet mit dem Funktionsheet, die Kueche mit dem
  Kuechenblatt. Wer auf der einen Seite storniert, will nicht auf der
  anderen landen (Florian, 02.10.2026). Angenommen wird nur ein bekannter
  Weg, nichts aus dem Formular blind weitergereicht.
*/
function zurueck(abend: string, meldung: string, woher = ""): never {
  revalidatePath("/kueche");
  revalidatePath("/funktionsheet");
  const seite = woher === "funktionsheet" ? "/funktionsheet" : "/kueche";
  redirect(`${seite}?abend=${encodeURIComponent(abend)}&meldung=${encodeURIComponent(meldung)}`);
}

export async function menueStornieren(f: FormData): Promise<void> {
  const b = await zugang();
  const bestellung = text(f, "bestellung", 60);
  const abend = text(f, "abend", 60);
  const woher = text(f, "woher", 20);
  if (!bestellung) zurueck(abend, "Keine Bestellung angegeben.", woher);

  await db()`
    insert into menue_storno (bestellung, ditix_event_id, kunde, grund, wer)
    values (${bestellung}, ${abend}, ${text(f, "kunde", 200)}, ${text(f, "grund", 300)}, ${b.name})
    on conflict (bestellung) do update
      set grund = excluded.grund, wer = excluded.wer, wann = now()
  `;

  zurueck(abend, `Bestellung ${bestellung} ist storniert und zählt nicht mehr mit.`, woher);
}

export async function menueStornoZurueck(f: FormData): Promise<void> {
  await zugang();
  const bestellung = text(f, "bestellung", 60);
  const abend = text(f, "abend", 60);
  const woher = text(f, "woher", 20);
  await db()`delete from menue_storno where bestellung = ${bestellung}`;
  zurueck(abend, `Bestellung ${bestellung} zählt wieder mit.`, woher);
}

/**
 * Die Mengen einer Bestellung korrigieren.
 *
 * Der haeufigere Fall als der ganze Storno: Von acht Menues kommen vier
 * (Florian, 02.10.2026). Geaendert wird nichts an der Bestellung selbst,
 * die Korrektur steht daneben.
 */
export async function menueKorrigieren(f: FormData): Promise<void> {
  const b = await zugang();
  const bestellung = text(f, "bestellung", 60);
  const abend = text(f, "abend", 60);
  const woher = text(f, "woher", 20);
  if (!bestellung) zurueck(abend, "Keine Bestellung angegeben.", woher);

  const zahl = (k: string) => {
    const n = Number(text(f, k, 5).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };

  await db()`
    insert into menue_storno (bestellung, ditix_event_id, kunde, art, classic, sea, veggy, kids, grund, wer)
    values (${bestellung}, ${abend}, ${text(f, "kunde", 200)}, 'korrektur',
            ${zahl("classic")}, ${zahl("sea")}, ${zahl("veggy")}, ${zahl("kids")},
            ${text(f, "grund", 300)}, ${b.name})
    on conflict (bestellung) do update
      set art = 'korrektur', classic = excluded.classic, sea = excluded.sea,
          veggy = excluded.veggy, kids = excluded.kids,
          grund = excluded.grund, wer = excluded.wer, wann = now()
  `;

  zurueck(abend, `Bestellung ${bestellung} ist korrigiert.`, woher);
}
