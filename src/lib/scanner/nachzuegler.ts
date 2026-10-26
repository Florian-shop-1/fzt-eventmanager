/**
 * Liegengebliebene Glücks-Moji-Karten doch noch nach Brevo bringen.
 *
 * "geht das verlässlich alles zu brevo in die magic-news? das ist uns
 * sehr wichtig. auch wenn der mitarbeiter keinen button drückt ... also
 * keine hürden bauen, die vergessen werden könnten" (Florian,
 * 25.10.2026).
 *
 * Die meisten Karten gehen von selbst hinaus. Nur wo die Lesung nicht
 * eindeutig war, wartet eine auf einen Menschen, und genau die kann
 * liegenbleiben. Nach zwei Tagen übernimmt das hier: Steht eine Adresse
 * da, die wenigstens wie eine Adresse aussieht, geht die Karte hinaus.
 *
 * Das ist die bewusste Abwägung. Eine falsch gelesene Adresse prallt bei
 * Brevo ab und fällt im Verteiler-Aufräumen auf. Eine nie übertragene
 * Karte ist ein Gast, von dem wir nie wieder hören, und das merkt
 * niemand.
 *
 * Karten ganz ohne Adresse bleiben liegen: Daraus lässt sich nichts
 * machen, und das Büro bekommt eine Nachricht, damit sie nicht ewig
 * dastehen.
 */

import { db } from "@/lib/db/client";
import { karten } from "@/lib/db/scanner";
import { abschliessen } from "./ablauf";
import { emailFormOk, emailNormalisieren } from "./pruefen";

/** Wie lange eine Karte auf einen Menschen warten darf. */
const TAGE_GEDULD = 2;

export async function liegengebliebeneUebertragen(tage = TAGE_GEDULD): Promise<{
  geprueft: number;
  uebertragen: number;
  ohneAdresse: number;
}> {
  const grenze = Date.now() - tage * 24 * 60 * 60 * 1000;
  const wartende = (await karten(["pruefen", "fehler"], 200)).filter(
    (k) => new Date(k.erstelltAm).getTime() < grenze,
  );

  let uebertragen = 0;
  let ohneAdresse = 0;

  for (const k of wartende) {
    const email = emailNormalisieren(k.email ?? "");
    if (!email || !emailFormOk(email)) {
      ohneAdresse++;
      continue;
    }
    try {
      await abschliessen(k.id, {
        vorname: k.vorname ?? "",
        nachname: k.nachname ?? "",
        email,
        telefon: k.telefon ?? "",
      });
      await db()`
        update scan_karte
           set grund = coalesce(nullif(grund, ''), '') ||
                       case when coalesce(grund, '') = '' then '' else ' · ' end ||
                       ${`Nach ${tage} Tagen von selbst übertragen (${new Date().toLocaleDateString("de-DE")}).`}
         where id = ${k.id}
      `.catch(() => undefined);
      uebertragen++;
    } catch (f) {
      console.warn("[scanner] Nachzügler nicht übertragen:", k.id, f);
    }
  }

  if (ohneAdresse > 0) {
    const { melden } = await import("@/lib/stempel/wache");
    await melden(`Glücks-Moji: ${ohneAdresse} Karten ohne Adresse`, [
      `${ohneAdresse} gescannte Karten liegen seit mehr als ${tage} Tagen im Scanner und haben keine brauchbare E-Mail-Adresse.`,
      "",
      "Daraus kann das Programm nichts machen. Bitte im Eventmanager unter „Emoji-Scanner“ ansehen:",
      "entweder die Adresse von Hand eintragen oder die Karte wegwerfen.",
    ]).catch(() => undefined);
  }

  return { geprueft: wartende.length, uebertragen, ohneAdresse };
}
