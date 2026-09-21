/**
 * Meldet, wenn jemand eingestempelt bleibt, obwohl er weg ist.
 *
 * Wichtig zum Verständnis, was technisch geht: Eine Webseite darf im
 * Hintergrund nicht auf das GPS zugreifen. Sobald das Handy gesperrt ist
 * oder der Eventmanager geschlossen wird, weiß das Programm nicht mehr,
 * wo jemand ist. Deshalb gibt es zwei Wege:
 *
 *  1. Solange die Stempeluhr offen ist, prüft sie alle paar Minuten die
 *     Position. Verlässt jemand das Gelände, ohne auszustempeln, meldet
 *     sie das sofort (siehe /stempeluhr/standort).
 *  2. Ein Lauf auf dem Server prüft regelmäßig, wer zu lange eingestempelt
 *     ist. Das fängt den Fall ab, dass jemand einfach das Handy weglegt.
 *
 * Gemeldet wird einmal je Schicht, nicht im Minutentakt.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { einstellungLesen, meldungMerken, schonGemeldet, stunden, werIstDa } from "./db";

const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

function zeit(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
}

/** Schickt die Meldung an die hinterlegten Personen (Florian und Kevin). */
export async function melden(betreff: string, zeilen: string[]): Promise<void> {
  const e = await einstellungLesen();
  if (e.meldenAn.length === 0) return;
  const leute = (await db()`
    select name, email from benutzer where aktiv and id = any(${e.meldenAn}::uuid[])
  `) as Array<{ name: string; email: string }>;
  const text = `${zeilen.join("\n")}\n\nStempeluhr ansehen: ${APP}/stempeluhr`;
  for (const p of leute) {
    try {
      await mailVerschicken({ an: p.email, betreff, text });
    } catch (f) {
      console.error("[stempel] Meldung an", p.email, "fehlgeschlagen:", f);
    }
  }
}

/**
 * Jemand ist laut Handy nicht mehr auf dem Gelände, aber noch eingestempelt.
 * Wird von der Stempeluhr gemeldet, während sie offen ist.
 */
export async function gelaendeVerlassen(o: {
  kommenId: string;
  name: string;
  seit: string;
  entfernungM: number;
}): Promise<boolean> {
  if (await schonGemeldet(o.kommenId)) return false;
  await meldungMerken(o.kommenId, "gelaende_verlassen");
  await melden(`${o.name} hat das Gelände verlassen, ohne auszustempeln`, [
    `${o.name} ist seit ${zeit(o.seit)} eingestempelt.`,
    `Das Handy meldet gerade rund ${o.entfernungM} Meter Entfernung vom Haus.`,
    "Bitte nachfragen oder die Zeit von Hand korrigieren.",
  ]);
  return true;
}

/**
 * Der regelmäßige Lauf: Wer ist zu lange eingestempelt?
 * Greift auch dann, wenn das Handy längst aus ist.
 */
export async function langeSchichtenPruefen(): Promise<{ gemeldet: number }> {
  const e = await einstellungLesen();
  if (!e.aktiv) return { gemeldet: 0 };
  const da = await werIstDa();
  let gemeldet = 0;
  for (const p of da) {
    const stundenOffen = p.minuten / 60;
    if (stundenOffen < e.maxStunden) continue;
    if (await schonGemeldet(p.kommenId)) continue;
    await meldungMerken(p.kommenId, "zu_lange");
    await melden(`${p.name} ist seit ${stunden(p.minuten)} Stunden eingestempelt`, [
      `${p.name} hat am ${zeit(p.seit)} eingestempelt und seitdem nicht ausgestempelt.`,
      p.zustand === "pause" ? "Die Pause läuft noch." : "Die Arbeitszeit läuft noch.",
      "Vermutlich wurde das Ausstempeln vergessen.",
    ]);
    gemeldet++;
  }
  return { gemeldet };
}
