"use server";

/**
 * Personalbogen absenden: prüfen, an das Lohnbüro mailen, Datum merken.
 *
 * Die Angaben werden nicht gespeichert. Geht die Mail schief, bleibt das
 * Formular im Browser ausgefüllt, und man kann es einfach noch einmal
 * absenden.
 */

import { revalidatePath } from "next/cache";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { LEER, pruefen, zeilen, type Personalbogen } from "@/lib/personal/personalbogen";

/** Das Lohnbüro. Florian, 18.09.2026. */
const LOHNBUERO = ["w.zimmer@florianzimmer.com", "sabinebuschow@aol.com"];

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type Absendeergebnis = { ok: true } | { ok: false; fehler: string; felder?: Record<string, string> };

export async function personalbogenAbsenden(roh: Personalbogen): Promise<Absendeergebnis> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) return { ok: false, fehler: "Bitte neu anmelden." };

  // Nur bekannte Felder übernehmen, alles als Text.
  const b = { ...LEER };
  for (const k of Object.keys(LEER) as Array<keyof Personalbogen>) {
    b[k] = String(roh?.[k] ?? "").trim().slice(0, 200);
  }
  const felder = pruefen(b);
  if (Object.keys(felder).length > 0) {
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", felder };
  }

  const gruppen = zeilen(b);
  const name = `${b.vorname} ${b.nachname}`;
  const betreff = `Personalbogen: ${name}${b.eintrittsdatum ? `, Eintritt ${b.eintrittsdatum.split("-").reverse().join(".")}` : ""}`;

  const text = [
    `Personalbogen von ${name}, ausgefüllt im FZT Eventmanager am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}.`,
    "",
    ...gruppen.flatMap((g) => [g.gruppe.toUpperCase(), ...g.felder.map(([k, v]) => `${k}: ${v || "-"}`), ""]),
    "Diese Angaben sind im Eventmanager nicht gespeichert. Bei Rückfragen bitte direkt an den Mitarbeiter wenden (Antworten gehen an seine Adresse).",
  ].join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1b19">
<p>Personalbogen von <strong>${h(name)}</strong>, ausgefüllt im FZT Eventmanager am ${h(new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }))}.</p>
${gruppen
  .map(
    (g) => `<h3 style="margin:18px 0 6px;font-size:15px">${h(g.gruppe)}</h3>
<table style="border-collapse:collapse;min-width:420px">${g.felder
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#6b6862;border-bottom:1px solid #eee">${h(k)}</td><td style="padding:4px 0;border-bottom:1px solid #eee"><strong>${h(v || "-")}</strong></td></tr>`,
      )
      .join("")}</table>`,
  )
  .join("\n")}
<p style="margin-top:18px;color:#6b6862;font-size:12px">Diese Angaben sind im Eventmanager nicht gespeichert. Antworten auf diese Mail gehen direkt an ${h(name)}.</p>
</div>`;

  try {
    await mailVerschicken({ an: LOHNBUERO, betreff, text, html, antwortAn: b.email });
  } catch (e) {
    return { ok: false, fehler: `Die Mail an das Lohnbüro ging nicht raus: ${e instanceof Error ? e.message : "unbekannter Fehler"}. Bitte gleich noch einmal versuchen.` };
  }

  await db()`update benutzer set personalbogen_am = now() where id = ${benutzer.id}`;

  // Kurze Bestätigung an den Mitarbeiter, ohne die Angaben selbst.
  try {
    await mailVerschicken({
      an: b.email,
      betreff: "Dein Personalbogen ist beim Lohnbüro",
      text: [
        `Hallo ${b.vorname},`,
        "",
        "danke! Dein Personalbogen ist bei unserem Lohnbüro angekommen. Falls sich etwas ändert, zum Beispiel Adresse oder Bankverbindung, sag bitte im Büro Bescheid.",
        "",
        "Florian Zimmer Theater",
      ].join("\n"),
    });
  } catch {
    // Die Bestätigung ist nett, aber nicht nötig.
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
