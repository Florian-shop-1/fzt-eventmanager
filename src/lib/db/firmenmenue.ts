/**
 * Firmenmenüs schnell eintragen, ohne den ganzen Vorgang durchzugehen.
 *
 * Firmen buchen nicht über den Ticketshop. Ihre Menüs kamen bisher über
 * einen vollständigen Vorgang ins Programm, was für eine schnelle Meldung
 * am Telefon zu umständlich ist. Kevin trägt sie deshalb direkt im
 * Funktionsheet ein: Firma, Personen, Menüs, fertig.
 *
 * Angelegt wird trotzdem ein richtiger Vorgang mit Gruppe. So landen die
 * Zahlen automatisch dort, wo sie gebraucht werden: Küche, Sitzplan,
 * Einlassliste. Wer später Angebot und Rechnung braucht, öffnet denselben
 * Vorgang unter "Vorgänge" und arbeitet normal weiter.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { findeTermin } from "@/lib/ditix/spielplan";
import type { MenueVariante } from "@/lib/domain/types";

export const VARIANTEN: Array<{ wert: MenueVariante; label: string }> = [
  { wert: "classic", label: "Classic" },
  { wert: "sea", label: "Sea" },
  { wert: "veggy", label: "Veggy" },
  { wert: "kids", label: "Kids" },
];

async function verlangeBuero(): Promise<string> {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) throw new Error("Für diese Änderung fehlt die Berechtigung.");
  return b.name;
}

function text(f: FormData, k: string, max = 500): string {
  return String(f.get(k) ?? "").trim().slice(0, max);
}

function zahl(f: FormData, k: string): number {
  const n = Math.round(Number(String(f.get(k) ?? "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function menuesAus(f: FormData): Partial<Record<MenueVariante, number>> {
  const m: Partial<Record<MenueVariante, number>> = {};
  for (const v of VARIANTEN) {
    const n = zahl(f, `menue_${v.wert}`);
    if (n > 0) m[v.wert] = n;
  }
  return m;
}

async function nummerVergeben(): Promise<string> {
  const jetzt = new Date();
  const praefix = `V-${String(jetzt.getMonth() + 1).padStart(2, "0")}${String(jetzt.getFullYear()).slice(-2)}-`;
  const z = (await db()`
    select nummer from vorgang where nummer like ${praefix + "%"} order by nummer desc limit 1
  `) as Array<{ nummer: string }>;
  const letzte = z.length > 0 ? Number(z[0].nummer.split("-")[2]) : 0;
  return praefix + String(letzte + 1).padStart(3, "0");
}

function neu(pfade: string[]) {
  for (const p of pfade) revalidatePath(p);
}

/** Legt eine Firmenbuchung an: Kunde, Vorgang, Gruppe mit Menüs. */
export async function firmenmenueEintragen(f: FormData): Promise<{ ok: boolean; meldung: string }> {
  await verlangeBuero();
  const firma = text(f, "firma", 120);
  const personen = Math.max(1, zahl(f, "personen"));
  const menues = menuesAus(f);
  const ditixEventId = text(f, "vorstellung", 60);

  if (!firma) return { ok: false, meldung: "Ohne Firma geht es nicht." };
  const termin = await findeTermin(ditixEventId);
  if (!termin) return { ok: false, meldung: "Diese Vorstellung gibt es nicht." };

  // Kunde: vorhandenen mit gleichem Namen nehmen, sonst neu anlegen.
  const vorhanden = (await db()`select id from kunde where lower(name) = ${firma.toLowerCase()} limit 1`) as Array<{ id: string }>;
  const kundeId =
    vorhanden[0]?.id ??
    // Die Kundentabelle verlangt eine Mailadresse. Beim schnellen Eintragen
    // gibt es noch keine; sie wird später im Vorgang nachgetragen.
    ((await db()`insert into kunde (name, email) values (${firma}, '') returning id`) as Array<{ id: string }>)[0].id;

  const v = (await db()`
    select id from vorstellung where datum = ${termin.datum} and show = ${termin.name} limit 1
  `) as Array<{ id: string }>;
  const vorstellungId =
    v[0]?.id ??
    (
      (await db()`
        insert into vorstellung (datum, show, ditix_event_id) values (${termin.datum}, ${termin.name}, ${termin.ditixEventId})
        returning id
      `) as Array<{ id: string }>
    )[0].id;

  const vorgang = (await db()`
    insert into vorgang (nummer, kunde_id, vorstellung_id, quelle, status)
    values (${await nummerVergeben()}, ${kundeId}, ${vorstellungId}, 'direkt', ${text(f, "status") === "reserviert" ? "reserviert" : "gebucht"})
    returning id, nummer
  `) as Array<{ id: string; nummer: string }>;

  await db()`
    insert into gruppe (vorgang_id, name, personen, herkunft, menues, unvertraeglichkeiten, bereich_fixiert, notiz)
    values (${vorgang[0].id}, ${firma}, ${personen}, 'firma', ${JSON.stringify(menues)}::jsonb,
            ${text(f, "unvertraeglichkeiten") || null},
            ${text(f, "bereich") === "logen" ? "logen" : text(f, "bereich") === "eventgalerie" ? "eventgalerie" : null},
            ${text(f, "notiz") || null})
  `;

  neu(["/funktionsheet", "/kueche", "/sitzplan", "/einlassliste", "/vorgaenge", "/belegung"]);
  const summe = Object.values(menues).reduce((n, x) => n + (x ?? 0), 0);
  return {
    ok: true,
    meldung: `${firma} ist eingetragen: ${personen} Personen, ${summe} ${summe === 1 ? "Menü" : "Menüs"} (Vorgang ${vorgang[0].nummer}).`,
  };
}

/** Menüzahlen einer bestehenden Firmengruppe ändern, etwa wenn die Firma nachmeldet. */
export async function firmenmenueAendern(f: FormData): Promise<{ ok: boolean; meldung: string }> {
  await verlangeBuero();
  const gruppeId = text(f, "gruppeId", 40);
  const menues = menuesAus(f);
  const personen = zahl(f, "personen");

  const z = (await db()`
    update gruppe set menues = ${JSON.stringify(menues)}::jsonb,
           personen = case when ${personen} > 0 then ${personen} else personen end,
           unvertraeglichkeiten = ${text(f, "unvertraeglichkeiten") || null}
     where id = ${gruppeId}
    returning name
  `) as Array<{ name: string }>;
  if (!z[0]) return { ok: false, meldung: "Diese Gruppe gibt es nicht mehr." };

  neu(["/funktionsheet", "/kueche", "/sitzplan", "/einlassliste", "/vorgaenge", "/belegung"]);
  const summe = Object.values(menues).reduce((n, x) => n + (x ?? 0), 0);
  return { ok: true, meldung: `${z[0].name}: ${summe} ${summe === 1 ? "Menü" : "Menüs"} gespeichert.` };
}
