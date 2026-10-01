"use server";

/**
 * Personalbogen absenden: prüfen, an das Lohnbüro mailen, Datum merken.
 *
 * Seit dem 01.10.2026 bleiben die Angaben auch im Haus liegen, damit
 * niemand den Mitarbeiter ein zweites Mal danach fragen muss. Geht die
 * Mail schief, bleibt das Formular im Browser ausgefüllt, und man kann es
 * einfach noch einmal absenden.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { LEER, pruefen, svFormOk, zeilen, type Personalbogen } from "@/lib/personal/personalbogen";
import { bogenSpeichern } from "@/lib/db/personalbogen";

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
  /*
    Darf dieser Mensch den Bogen ohne Versicherungsnummer abgeben?

    Das steht an der Person, nicht an der Vorlage: Sonst fehlt die Nummer
    am Ende überall und niemand merkt es (Florian, 01.10.2026).
  */
  const z = (await db()`
    select sv_nummer_spaeter from benutzer where id = ${benutzer.id}
  `.catch(() => [])) as Array<{ sv_nummer_spaeter: boolean }>;
  const ohneSvNummer = Boolean(z[0]?.sv_nummer_spaeter);

  const felder = pruefen(b, { ohneSvNummer });
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

  // Und ab in die Ablage, damit das Büro nicht noch einmal fragen muss.
  await bogenSpeichern({
    benutzerId: benutzer.id,
    daten: b,
    quelle: "selbst ausgefüllt",
    von: benutzer.name,
  }).catch((e) => console.error("[personalbogen] nicht abgelegt:", e));

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

/**
 * Die Versicherungsnummer nachtragen.
 *
 * Nur für den, dem sie erlassen wurde, und nur solange sie fehlt. Das
 * Lohnbüro bekommt sie sofort, denn darauf wartet es.
 */
export async function svNummerNachtragen(f: FormData): Promise<void> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) throw new Error("Nicht angemeldet.");

  const nummer = String(f.get("svNummer") ?? "").toUpperCase().replace(/\s/g, "").slice(0, 20);
  if (!svFormOk(nummer)) {
    redirect(`/personalbogen?meldung=${encodeURIComponent("Die Nummer sieht nicht richtig aus. Zwölf Zeichen, zum Beispiel 65 170839 J 003.")}`);
  }

  await bogenSpeichern({
    benutzerId: benutzer.id,
    daten: { svNummer: nummer },
    quelle: "selbst nachgetragen",
    von: benutzer.name,
  });
  await db()`
    update benutzer set sv_nummer_spaeter = false, sv_erinnert_am = null where id = ${benutzer.id}
  `;

  await mailVerschicken({
    an: LOHNBUERO,
    betreff: `Sozialversicherungsnummer nachgereicht: ${benutzer.name}`,
    text: [
      `${benutzer.name} hat die Sozialversicherungsnummer nachgetragen:`,
      "",
      nummer,
      "",
      "Der übrige Personalbogen liegt euch bereits vor.",
    ].join(String.fromCharCode(10)),
    antwortAn: benutzer.email,
  }).catch((e) => console.error("[personalbogen] Nachtrag nicht gemeldet:", e));

  revalidatePath("/personalbogen");
  revalidatePath("/", "layout");
  redirect(`/personalbogen?meldung=${encodeURIComponent("Danke, die Nummer ist angekommen. Damit ist dein Personalbogen vollständig.")}`);
}
