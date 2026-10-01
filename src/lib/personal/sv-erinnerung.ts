/**
 * Nachhaken wegen der fehlenden Sozialversicherungsnummer.
 *
 * "du einfach alle paar Tage bei ihm nachhakst und ihn erinnerst diese
 * noch nachzutragen" (Florian, 01.10.2026). Wer zum ersten Mal arbeitet,
 * bekommt die Nummer erst mit der ersten Meldung der Krankenkasse; bis
 * dahin darf er den Bogen ohne abgeben, und das Programm bleibt dran.
 *
 * Alle drei Tage eine freundliche Zeile, höchstens zehnmal. Danach ist es
 * keine Erinnerung mehr, sondern Belästigung, und das Büro sollte zum
 * Telefon greifen.
 */

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";

const ABSTAND_TAGE = 3;
const HOECHSTENS = 10;
const APP = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";
const UMBRUCH = String.fromCharCode(10);

export interface OffeneNummer {
  benutzerId: string;
  name: string;
  email: string;
  erinnertAm: string | null;
}

/**
 * Wem die Nummer noch fehlt.
 *
 * Nur wer den Bogen schon abgegeben hat: Wer noch gar nichts ausgefüllt
 * hat, bekommt ohnehin die übliche Erinnerung an den Personalbogen.
 */
export async function offeneNummern(): Promise<OffeneNummer[]> {
  const z = (await db()`
    select b.id, b.name, b.email, b.sv_erinnert_am
      from benutzer b
      left join personalbogen p on p.benutzer_id = b.id
     where b.aktiv
       and b.sv_nummer_spaeter
       and b.personalbogen_am is not null
       and coalesce(p.daten ->> 'svNummer', '') = ''
  `.catch(() => [])) as Array<Record<string, unknown>>;
  return z.map((r) => ({
    benutzerId: String(r.id),
    name: String(r.name),
    email: String(r.email ?? ""),
    erinnertAm: r.sv_erinnert_am ? new Date(r.sv_erinnert_am as string).toISOString() : null,
  }));
}

/** Der tägliche Lauf. Schickt nur, wenn der Abstand erreicht ist. */
export async function svErinnerungen(): Promise<string[]> {
  const offen = await offeneNummern();
  const gemacht: string[] = [];

  for (const p of offen) {
    if (!p.email) continue;

    const faellig =
      !p.erinnertAm || Date.now() - Date.parse(p.erinnertAm) > ABSTAND_TAGE * 86400000;
    if (!faellig) continue;

    /*
      Wie oft schon? Steht nirgends als Zahl, aber die Vermerke im
      Mailversand genügen nicht; deshalb zählt hier schlicht die Zeit:
      Nach dreißig Tagen ist Schluss, das sind zehn Erinnerungen.
    */
    const z = (await db()`
      select personalbogen_am from benutzer where id = ${p.benutzerId}::uuid
    `.catch(() => [])) as Array<{ personalbogen_am: string }>;
    const seit = z[0]?.personalbogen_am ? Date.parse(z[0].personalbogen_am) : Date.now();
    if (Date.now() - seit > ABSTAND_TAGE * HOECHSTENS * 86400000) continue;

    const vorname = p.name.split(" ")[0];
    try {
      await mailVerschicken({
        an: p.email,
        absender: postfachPersonal(),
        antwortAn: antwortPersonal(),
        betreff: "Deine Sozialversicherungsnummer fehlt uns noch",
        text: [
          `Hallo ${vorname},`,
          "",
          "dein Personalbogen ist bei uns, danke dafür. Eine Angabe fehlt noch: deine",
          "Sozialversicherungsnummer. Du hattest sie noch nicht, deshalb haken wir ab und zu nach.",
          "",
          "Hast du sie inzwischen bekommen? Sie steht auf dem Sozialversicherungsausweis oder hinten",
          "auf der Karte deiner Krankenkasse. Eintragen kannst du sie hier, das dauert eine halbe Minute:",
          "",
          `${APP}/personalbogen`,
          "",
          "Wenn du sie noch nicht hast, ist das kein Problem, dann melden wir uns in ein paar Tagen",
          "wieder. Fragen beantworten wir gern.",
          "",
          "Herzliche Grüße",
          "Florian Zimmer Theater",
        ].join(UMBRUCH),
      });
      await db()`update benutzer set sv_erinnert_am = now() where id = ${p.benutzerId}::uuid`;
      gemacht.push(`Erinnerung an ${p.name}`);
    } catch (f) {
      console.error("[personalbogen] SV-Erinnerung nicht verschickt:", f);
    }
  }

  return gemacht;
}
