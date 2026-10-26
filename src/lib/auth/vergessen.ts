/**
 * Passwort vergessen, ohne dass jemand im Büro stören muss.
 *
 * "bitte schaffe eine passwort vergessen funktion für den mitarbeiter im
 * eventmanager. er bekommt dann eine mail und kann selber zurücksetzen,
 * das bekannte prinzip" (Florian, 25.10.2026).
 *
 * Das bekannte Prinzip ist der Link, nicht das Passwort im Klartext: Ein
 * Passwort, das einmal in einer Mail stand, steht in diesem Postfach für
 * immer. Der Link hier gilt eine Stunde und genau einmal, und danach
 * wählt der Mitarbeiter sein Passwort selbst.
 *
 * Zwei Regeln, die nach außen wichtig sind:
 *
 *   1. Die Antwort ist immer dieselbe, egal ob es den Zugang gibt. Sonst
 *      kann jeder durchprobieren, wer bei uns arbeitet.
 *   2. Gesperrte Zugänge bekommen nichts. Wer hinaus ist, bleibt draußen,
 *      auch wenn seine Mailadresse noch funktioniert.
 */

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db/client";
import { mailVerschicken } from "@/lib/mail/versand";
import { antwortPersonal, postfachPersonal } from "@/lib/mail/postfaecher";
import { passwortPruefen, passwortVerschluesseln } from "./passwort";

/** Wie lange ein Link gilt. Lang genug fürs Handy, kurz genug zum Vergessen. */
const GUELTIG_MINUTEN = 60;

const pruefsummeVon = (schluessel: string) => createHash("sha256").update(schluessel).digest("hex");

function basisAdresse(): string {
  return (process.env.EVENTMANAGER_URL ?? "https://eventmanager.florianzimmertheater.de").replace(/\/$/, "");
}

/**
 * Einen Link anfordern.
 *
 * Gibt immer true zurück. Was wirklich passiert ist, steht nur im
 * Serverprotokoll: Nach außen darf man nicht erkennen können, ob es
 * diesen Zugang gibt.
 */
export async function zuruecksetzenAnfordern(eingabe: string, woher = ""): Promise<void> {
  const wert = eingabe.trim().toLowerCase();
  if (!wert) return;

  const [b] = (await db()`
    select id, name, email, aktiv from benutzer
     where (lower(email) = ${wert} or lower(name) = ${wert})
     limit 1
  `) as Array<{ id: string; name: string; email: string; aktiv: boolean }>;

  if (!b) {
    console.log("[passwort] Anforderung für einen unbekannten Zugang:", wert);
    return;
  }
  if (!b.aktiv) {
    console.log("[passwort] Anforderung für einen gesperrten Zugang:", b.email);
    return;
  }
  if (!b.email || !b.email.includes("@")) {
    // Die Tablets im Foyer und hinter der Bühne haben kein eigenes
    // Postfach. Dort hilft nur das Büro, und das steht so auf der Seite.
    console.log("[passwort] Zugang ohne Mailadresse:", b.name);
    return;
  }

  // Ältere Links verfallen: Es soll immer nur einer gelten.
  await db()`
    update passwort_token set gueltig_bis = now()
     where benutzer_id = ${b.id}::uuid and benutzt_am is null and gueltig_bis > now()
  `;

  const schluessel = randomBytes(32).toString("base64url");
  await db()`
    insert into passwort_token (benutzer_id, pruefsumme, gueltig_bis, angefordert_von)
    values (${b.id}::uuid, ${pruefsummeVon(schluessel)},
            now() + make_interval(mins => ${GUELTIG_MINUTEN}), ${woher.slice(0, 100)})
  `;

  const link = `${basisAdresse()}/passwort-neu/${schluessel}`;
  const vorname = b.name.trim().split(/\s+/)[0] || b.name;

  await mailVerschicken({
    an: b.email,
    absender: postfachPersonal(),
    antwortAn: antwortPersonal(),
    betreff: "Dein neues Passwort für den Eventmanager",
    text: [
      `Hallo ${vorname},`,
      "",
      "du hast ein neues Passwort für den Eventmanager angefordert. Über diesen Link kannst du",
      "dir selbst eins setzen:",
      "",
      link,
      "",
      `Der Link gilt eine Stunde und nur einmal. Danach brauchst du einen neuen.`,
      "",
      "Warst du das nicht? Dann ist nichts passiert, dein altes Passwort gilt weiter. Sag in dem",
      "Fall bitte trotzdem kurz Bescheid.",
      "",
      "Viele Grüße",
      "Dein Florian Zimmer Theater",
    ].join("\n"),
  });

  console.log("[passwort] Link verschickt an", b.email);
}

export interface Tokenstand {
  gueltig: boolean;
  benutzerId?: string;
  name?: string;
  grund?: string;
}

/** Gilt dieser Link noch? */
export async function tokenPruefen(schluessel: string): Promise<Tokenstand> {
  const wert = (schluessel ?? "").trim();
  if (wert.length < 20) return { gueltig: false, grund: "Dieser Link ist unvollständig." };

  const [z] = (await db()`
    select t.id, t.benutzer_id, t.gueltig_bis, t.benutzt_am, b.name, b.aktiv
      from passwort_token t join benutzer b on b.id = t.benutzer_id
     where t.pruefsumme = ${pruefsummeVon(wert)}
  `) as Array<Record<string, unknown>>;

  if (!z) return { gueltig: false, grund: "Diesen Link kennen wir nicht." };
  if (z.benutzt_am) return { gueltig: false, grund: "Dieser Link wurde schon benutzt." };
  if (new Date(z.gueltig_bis as string) < new Date()) {
    return { gueltig: false, grund: "Dieser Link ist abgelaufen. Fordere bitte einen neuen an." };
  }
  if (z.aktiv !== true) return { gueltig: false, grund: "Dieser Zugang ist gesperrt." };

  return { gueltig: true, benutzerId: String(z.benutzer_id), name: String(z.name ?? "") };
}

/** Das neue Passwort setzen. Gibt einen Fehlertext zurück, oder null. */
export async function passwortNeuSetzen(schluessel: string, passwort: string): Promise<string | null> {
  const stand = await tokenPruefen(schluessel);
  if (!stand.gueltig || !stand.benutzerId) return stand.grund ?? "Dieser Link gilt nicht mehr.";

  const maengel = passwortPruefen(passwort);
  if (maengel) return maengel;

  await db()`
    update benutzer
       set passwort_hash = ${await passwortVerschluesseln(passwort)},
           muss_passwort_aendern = false,
           startpasswort = null
     where id = ${stand.benutzerId}::uuid
  `;

  // Der Link ist verbraucht, und alle anderen dieses Zugangs auch.
  await db()`
    update passwort_token
       set benutzt_am = now(), gueltig_bis = least(gueltig_bis, now())
     where benutzer_id = ${stand.benutzerId}::uuid and benutzt_am is null
  `;

  console.log("[passwort] Neu gesetzt für", stand.name);
  return null;
}
