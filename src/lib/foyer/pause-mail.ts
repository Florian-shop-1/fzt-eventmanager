/**
 * Die Mail an die Aushilfe, die nach der Pause noch eingestempelt ist.
 *
 * "schick einfach ne mail dann, dass er sieht dass er ausser plan noch
 * eingestempelt ist, kann dann feedback geben. das gilt nur für das
 * Foyer-Team (Aushilfen)" (Florian, 12.10.2026).
 *
 * Nach der Pause bleibt im Foyer eine Kraft, in der Regel Olena, weil
 * sie fest angestellt ist. Alles andere muss angefragt und freigegeben
 * werden. Wer trotzdem bleibt, erfährt es hier und kann gleich
 * antworten, warum: Oft gibt es einen guten Grund, und der soll nicht
 * erst am Monatsende auffallen.
 *
 * Fest Angestellte bekommen keine Mail. Für sie gilt die Regel nicht.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";
import { appUrl } from "@/lib/dienstplan/mails";
import { heuteBerlin, nachDerPause, schonBegruendet, KARENZ_MINUTEN } from "./pause";

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function schonGeschrieben(benutzerId: string, datum: string): Promise<boolean> {
  const z = (await db()`
    select 1 from nach_pause_mail where datum = ${datum}::date and benutzer_id = ${benutzerId}::uuid
  `.catch(() => [])) as unknown[];
  return z.length > 0;
}

export interface Mahnung {
  name: string;
  email: string;
}

/**
 * Wer nach der Pause noch da ist, bekommt einmal am Abend eine Mail.
 *
 * Läuft als Teil des Viertelstundenlaufs. Gibt zurück, an wen
 * geschrieben wurde, damit im Protokoll etwas steht.
 */
export async function nachPauseMahnen(): Promise<Mahnung[]> {
  const datum = heuteBerlin();
  const stand = await nachDerPause(datum);
  if (!stand) return [];

  // Die Karenz ist dieselbe wie im Programm: Umziehen, Abrechnen, Tschüss sagen.
  if ((Date.now() - Date.parse(stand.seit)) / 60000 < KARENZ_MINUTEN) return [];
  if (stand.leute.length <= 1) return [];

  /*
    Wer bleiben soll, bekommt nichts.

    Ist Olena da, ist sie es. Sonst die Person mit der kürzesten Zeit
    auf der Uhr: Das ist dieselbe Logik wie beim Vorschlag im Programm,
    nur andersherum gelesen.
  */
  const bleibt =
    stand.leute.find((p) => p.name === stand.bleibt) ??
    [...stand.leute].sort((a, b) => a.minuten - b.minuten)[0];

  const geschrieben: Mahnung[] = [];
  for (const p of stand.leute) {
    if (p.benutzerId === bleibt?.benutzerId) continue;
    // Fest Angestellte sind nicht gemeint, nur die Aushilfen.
    if (p.fest) continue;
    if (!p.email.includes("@")) continue;
    if (await schonBegruendet(p.benutzerId, datum)) continue;
    if (await schonGeschrieben(p.benutzerId, datum)) continue;

    const vorname = p.name.split(" ")[0];
    const link = `${appUrl()}/stempeluhr`;
    const absaetze = [
      "du bist nach der Pause noch eingestempelt. Das ist kein Vorwurf, wir wollen nur, dass du es weißt: "
        + "Nach der Pause bleibt im Foyer normalerweise nur eine Person, und diese Zeit ist im Dienstplan nicht vorgesehen.",
      bleibt ? `Für heute Abend wäre das ${bleibt.name}.` : "",
      "Wenn du einen Grund hast, warum du länger bleibst, schreib ihn uns kurz. "
        + "Bezahlt wird die Zeit, wenn sie begründet und nachträglich genehmigt ist, und das machen wir gern, "
        + "wenn wir wissen, worum es ging.",
      "Und wenn dir am Ablauf etwas auffällt, das uns den Abend leichter macht: immer her damit.",
    ].filter(Boolean);

    try {
      await mailVerschicken({
        absender: postfachPersonal(),
        antwortAn: antwortPersonal(),
        an: p.email,
        betreff: "Du bist nach der Pause noch eingestempelt",
        text: [`Hallo ${vorname},`, "", ...absaetze, "", `Zur Stempeluhr: ${link}`].join("\n"),
        html:
          `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d1b18">`
          + `<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;font-size:15px;line-height:1.55">`
          + `<p style="margin:0 0 14px">Hallo ${h(vorname)},</p>`
          + absaetze.map((a) => `<p style="margin:0 0 14px">${h(a)}</p>`).join("")
          + `<p style="margin:22px 0 8px"><a href="${h(link)}" style="display:inline-block;background:#c9a45c;color:#1d1b18;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Zur Stempeluhr</a></p>`
          + `<p style="margin:18px 0 0;font-size:12px;color:#7a746b">Florian Zimmer Theater, Eventmanager</p>`
          + `</div></body></html>`,
      });
      await db()`
        insert into nach_pause_mail (datum, benutzer_id) values (${datum}::date, ${p.benutzerId}::uuid)
        on conflict do nothing
      `;
      geschrieben.push({ name: p.name, email: p.email });
    } catch (f) {
      console.error("[foyer] Mail nach der Pause:", f instanceof Error ? f.message : f);
    }
  }
  return geschrieben;
}
