"use server";

/**
 * Die Knoepfe der RegioTV-Info-Mail (Florian, 22.10.2026).
 *
 * Erst die Testmail an die eigene Adresse, dann der Versand an alle. Jede Adresse bekommt die Mail hoechstens einmal:
 * Wer sie hat, steht in regiotv_info_gesendet und wird bei einem zweiten Klick uebersprungen.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { db } from "@/lib/db/client";
import { buchungenFuerTag, type ShopBuchung } from "@/lib/db/shop-buchungen";
import { adresse, widersprochene } from "@/lib/db/werbewiderspruch";
import { abgesagteEventIds } from "@/lib/absage/db";
import { baueRegioTvInfo, hatMenue, REGIOTV_TAG } from "@/lib/mail/regiotv-info";
import { mailVerschicken } from "@/lib/mail/versand";

async function berechtigt() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer || (benutzer.rolle !== "chef" && benutzer.rolle !== "team")) {
    throw new Error("Nur Büro und Inhaber dürfen Gästemails verschicken.");
  }
  return benutzer;
}

/** Wer schon geschrieben wurde. Die Tabelle entsteht beim ersten Gebrauch. */
export async function bereitsGeschrieben(): Promise<Set<string>> {
  await db()`create table if not exists regiotv_info_gesendet (email text primary key, gesendet_am timestamptz not null default now())`;
  const zeilen = (await db()`select email from regiotv_info_gesendet`) as Array<{ email: string }>;
  return new Set(zeilen.map((z) => z.email));
}

/** Warum diese Buchung keine Mail bekommt, oder null, wenn sie eine bekommt. */
export async function ueberspringen(b: ShopBuchung, abgemeldet: Set<string>, abgesagt: Set<string>, schonDa: Set<string>): Promise<string | null> {
  if (!b.bestaetigt) return "nicht bezahlt";
  if (!b.email || !b.email.includes("@")) return "keine Adresse";
  if (abgemeldet.has(adresse(b.email))) return "abgemeldet";
  if (abgesagt.has(b.ditixEventId)) return "Show abgesagt";
  if (schonDa.has(adresse(b.email))) return "schon geschrieben";
  return null;
}

function zurueck(meldung: string): never {
  revalidatePath("/regiotv-info");
  redirect(`/regiotv-info?meldung=${encodeURIComponent(meldung)}`);
}

/** Eine Testmail an die eigene Adresse, mit dem Link eines echten Gastes (nur du siehst sie). */
export async function testmailSchicken(): Promise<void> {
  const benutzer = await berechtigt();
  const buchungen = (await buchungenFuerTag(REGIOTV_TAG)).filter((b) => b.bestaetigt);
  const beispiel = buchungen.find((b) => !hatMenue(b)) ?? buchungen[0];
  if (!beispiel) zurueck("Es gibt keine Buchung für den 1. Dezember, deshalb gibt es kein Beispiel.");

  const mail = baueRegioTvInfo(beispiel);
  let meldung = `Testmail an ${benutzer.email} geschickt.`;
  try {
    await mailVerschicken({
      an: benutzer.email,
      betreff: `[TEST] ${mail.betreff}`,
      text: mail.text,
      html: mail.html,
      imGesendetenAblegen: false,
    });
  } catch (f) {
    meldung = `Die Testmail ging nicht raus: ${f instanceof Error ? f.message : "Unbekannter Fehler"}`;
  }
  zurueck(meldung);
}

/** Verschickt die Mail an alle, die sie noch nicht haben. */
export async function anAlleSchicken(): Promise<void> {
  await berechtigt();
  const buchungen = await buchungenFuerTag(REGIOTV_TAG);
  const abgemeldet = await widersprochene(buchungen.map((b) => b.email));
  const abgesagt = await abgesagteEventIds();
  const schonDa = await bereitsGeschrieben();

  let verschickt = 0;
  let fehler = 0;
  for (const b of buchungen) {
    if (await ueberspringen(b, abgemeldet, abgesagt, schonDa)) continue;
    const mail = baueRegioTvInfo(b);
    try {
      await mailVerschicken({
        an: b.email,
        betreff: mail.betreff,
        text: mail.text,
        html: mail.html,
        antwortAn: "tickets@florianzimmer.com",
        ueberBrevo: true,
        schlagwort: "regiotv-info",
        abmeldenLink: `${process.env.SHOP_URL ?? "https://shop.florianzimmertheater.de"}/abmelden/${b.zugangToken}`,
      });
      // Erst nach dem Versand merken (wie bei der Vorfreude-Mail), und je Adresse nur einmal.
      await db()`insert into regiotv_info_gesendet (email) values (${adresse(b.email)}) on conflict (email) do nothing`;
      schonDa.add(adresse(b.email));
      verschickt++;
    } catch {
      fehler++;
    }
  }
  zurueck(`${verschickt} Mail(s) verschickt${fehler > 0 ? `, ${fehler} Fehler (bitte noch einmal klicken, wer schon eine hat, wird übersprungen)` : ""}.`);
}
