/**
 * Anmeldesitzung über ein signiertes Cookie.
 *
 * Im Cookie steht nur die Benutzerkennung, die Ablaufzeit und eine
 * Unterschrift. Wer den Inhalt verändert, macht die Unterschrift ungültig
 * und wird abgemeldet. Das Cookie ist für JavaScript im Browser nicht
 * lesbar (httpOnly), damit es auch bei einer Sicherheitslücke in der
 * Oberfläche nicht abgegriffen werden kann.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";

const COOKIE_NAME = "fzt_sitzung";
const GUELTIG_TAGE = 30;

/**
 * Wer darf was.
 *
 *  chef   Alles, dazu die Zugaenge.
 *  team   Buero und Vertrieb: Vorgaenge, Angebote, Preise, Planung.
 *  gastro Kueche und Sitzplan. Sieht keine Preise und keine Ticketzahlen.
 *  foyer  Foyerdienst: Stehtische, Baendchen, Einlass. Sieht keine Preise.
 *  showteam  Abenddienst im Saal: Front of House und Technik. Saalplan,
 *            Einlass und die Upgrades. Sieht keine Preise.
 *  kiosk  Externer Food-Kiosk. Sieht nur die Stehtische je Abend, sonst nichts.
 */
export type Rolle = "chef" | "team" | "gastro" | "foyer" | "showteam" | "kiosk" | "buchhaltung";

/**
 * Buchhaltung: Florian und sein Vater (Rolle buchhaltung). Die anderen
 * Chefs sehen diesen Bereich bewusst nicht (Florian, 19.09.2026).
 */
const BUCHHALTUNG_CHEF = "info@florianzimmer.com";
export function darfBuchhaltung(b: { rolle: Rolle; email: string } | null | undefined): boolean {
  if (!b) return false;
  return b.rolle === "buchhaltung" || (b.rolle === "chef" && b.email.toLowerCase() === BUCHHALTUNG_CHEF);
}

export interface AngemeldeterBenutzer {
  id: string;
  name: string;
  email: string;
  rolle: Rolle;
  mussPasswortAendern: boolean;
  /** Sieht den WhatsApp-Posteingang. Pro Person, siehe migrations/030_whatsapp.sql. */
  whatsapp: boolean;
  /** FZT-intern oder FZT-extern, null wenn noch nicht festgelegt. Siehe migrations/037. */
  art: "intern" | "extern" | null;
  /** Wann der Personalbogen an das Lohnbüro ging. */
  personalbogenAm: string | null;
}

function geheimnis(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET fehlt oder ist zu kurz. Einen zufälligen Wert mit mindestens " +
        "32 Zeichen in .env.local eintragen, siehe .env.example.",
    );
  }
  return s;
}

function unterschreiben(inhalt: string): string {
  return createHmac("sha256", geheimnis()).update(inhalt).digest("hex");
}

/** Meldet einen Benutzer an, indem das Cookie gesetzt wird. */
export async function sitzungStarten(benutzerId: string): Promise<void> {
  const ablauf = Date.now() + GUELTIG_TAGE * 24 * 60 * 60 * 1000;
  const inhalt = `${benutzerId}.${ablauf}`;
  const wert = `${inhalt}.${unterschreiben(inhalt)}`;

  (await cookies()).set(COOKIE_NAME, wert, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUELTIG_TAGE * 24 * 60 * 60,
  });
}

export async function sitzungBeenden(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** Liest die Benutzerkennung aus dem Cookie, oder null. */
async function benutzerIdAusCookie(): Promise<string | null> {
  const wert = (await cookies()).get(COOKIE_NAME)?.value;
  if (!wert) return null;

  const teile = wert.split(".");
  if (teile.length !== 3) return null;

  const [benutzerId, ablauf, unterschrift] = teile;
  const erwartet = unterschreiben(`${benutzerId}.${ablauf}`);

  // Zeitkonstanter Vergleich, damit die Unterschrift nicht Zeichen für
  // Zeichen erraten werden kann.
  const a = Buffer.from(unterschrift);
  const b = Buffer.from(erwartet);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (Number(ablauf) < Date.now()) return null;
  return benutzerId;
}

/**
 * Der gerade angemeldete Benutzer, oder null.
 * Fragt die Datenbank, damit eine Sperrung sofort wirkt und nicht erst,
 * wenn das Cookie abläuft.
 */
export async function angemeldeterBenutzer(): Promise<AngemeldeterBenutzer | null> {
  const id = await benutzerIdAusCookie();
  if (!id) return null;

  try {
    const zeilen = (await db()`
      select id, name, email, rolle, aktiv, muss_passwort_aendern, whatsapp, art, personalbogen_am
        from benutzer where id = ${id}
    `) as Array<Record<string, unknown>>;

    if (zeilen.length === 0) return null;
    const b = zeilen[0];
    if (b.aktiv !== true) return null;

    return {
      id: String(b.id),
      name: String(b.name),
      email: String(b.email),
      rolle: b.rolle as Rolle,
      mussPasswortAendern: b.muss_passwort_aendern === true,
      whatsapp: b.whatsapp === true,
      art: (b.art as "intern" | "extern" | null) ?? null,
      personalbogenAm: (b.personalbogen_am ? new Date(b.personalbogen_am as string).toISOString() : null),
    };
  } catch {
    // Datenbank nicht erreichbar: lieber abmelden als jemanden ohne
    // Prüfung hereinlassen.
    return null;
  }
}

/** Darf diese Rolle Preise, Kundendaten und Zahlungen sehen? */
export function darfKaufmaennisches(rolle: Rolle): boolean {
  return rolle === "chef" || rolle === "team";
}

/**
 * Darf diese Rolle den Abendbetrieb führen?
 *
 * Gemeint ist alles, was am Veranstaltungstag anfällt: den Saal einteilen,
 * Gruppen zusammenlegen, am Einlass abhaken, kassiertes Geld festhalten.
 *
 * Gastronomie und Foyer gehören ausdrücklich dazu: Beide stehen am Abend
 * im Haus und wissen als Einzige, wer da ist und was ausgegeben wurde.
 * Kaufmännisches bleibt trotzdem außen vor. Beträge werden entfernt, bevor
 * sie ihre Geräte erreichen, und Preise festlegen kann keiner von beiden.
 *
 * Den Saal einteilen darf das Foyer nicht, siehe darfSitzplanAendern.
 */
export function darfAbendbetrieb(rolle: Rolle): boolean {
  return (
    rolle === "chef" || rolle === "team" || rolle === "gastro" || rolle === "foyer"
  );
}

/**
 * Darf diese Rolle den Sitzplan aendern?
 *
 * Das Foyer nicht: Sarah schaut nach, wo jemand sitzt, eingeteilt wird der
 * Saal aber von der Gastronomie und vom Buero.
 */
export function darfSitzplanAendern(rolle: Rolle): boolean {
  return rolle === "chef" || rolle === "team" || rolle === "gastro";
}

/** Darf diese Rolle Benutzer anlegen und ändern? */
export function darfBenutzerVerwalten(rolle: Rolle): boolean {
  return rolle === "chef";
}

/** Seiten, die eine Rolle aufrufen darf. */
export function darfSeite(rolle: Rolle, pfad: string): boolean {
  // Der WhatsApp-Posteingang hängt nicht an der Rolle, sondern an einer
  // Freigabe pro Person (Sarah ist Foyer und braucht ihn trotzdem). Die
  // Seite prüft die Freigabe selbst, hier wird nur nicht vorher umgeleitet.
  if (pfad.startsWith("/whatsapp")) return true;
  // Den eigenen Personalbogen darf jeder ausfüllen. Die Seite prüft selbst, ob er gebraucht wird.
  if (pfad.startsWith("/personalbogen")) return true;
  // Stempeln darf jeder Mitarbeiter, auch das Foyer und das Showteam.
  if (pfad.startsWith("/stempeluhr") && rolle !== "kiosk") return true;
  // Den Dienstplan sieht jeder Mitarbeiter: Wer eine Position hat, trägt sich
  // ein, alle anderen sehen nur. Die Einrichtung prüft die Seite selbst.
  if (pfad.startsWith("/dienstplan") && rolle !== "kiosk") return true;
  // Magicuvée-Bestellungen: Die Seite prüft selbst, wer bestellen oder
  // übergeben darf und ob der Bereich schon freigeschaltet ist.
  if (pfad.startsWith("/bestellungen") && ["gastro", "foyer"].includes(rolle)) return true;
  if (rolle === "buchhaltung") {
    // Florians Vater: nur die Buchhaltung, sonst nichts aus dem Tagesgeschäft.
    return pfad === "/" || pfad.startsWith("/bewirtung") || pfad.startsWith("/buchhaltung") || pfad.startsWith("/konto");
  }
  if (rolle === "kiosk") {
    // Ein externer Partner, kein Mitarbeiter: nur die Stehtische, keine
    // Gästezahlen, keine Namen. "/" leitet ihn auf /kiosk weiter.
    return pfad === "/" || pfad.startsWith("/kiosk") || pfad.startsWith("/konto");
  }
  if (rolle === "foyer") {
    // Das Foyer braucht sein eigenes Blatt, den Einlass und den Sitzplan
    // zum Nachschauen, wohin jemand gehoert. Sonst nichts.
    return (
      pfad === "/" ||
      pfad.startsWith("/foyer") ||
      // Glücks-Moji-Karten scannen und prüfen.
      pfad.startsWith("/scanner") ||
      pfad.startsWith("/einlassliste") ||
      pfad.startsWith("/sitzplan") ||
      pfad.startsWith("/shortcuts") ||
      pfad.startsWith("/parkplaetze") ||
      pfad.startsWith("/konto") ||
      pfad.startsWith("/geheimhaltung")
    );
  }
  if (rolle === "showteam") {
    // Das Showteam arbeitet am Abend im Saal: Upgrades (mit Gästeliste)
    // und der Dienstplan. Alles zum Restaurant (Tische, Einlassliste,
    // Essplätze) bleibt bewusst weg, das irritiert nur (Florian, 18.09.2026).
    return (
      pfad === "/" ||
      pfad.startsWith("/upgrades") ||
      pfad.startsWith("/konto") ||
      pfad.startsWith("/geheimhaltung")
    );
  }
  if (rolle === "gastro") {
    // Der Sitzplan gehört ausdrücklich dazu: Wer wo sitzt, entscheidet
    // die Gastronomie. Preise werden auf dieser Seite für sie entfernt,
    // bevor die Daten den Server verlassen (siehe planOhnePreise).
    return (
      pfad === "/" ||
      pfad.startsWith("/funktionsheet") ||
      pfad.startsWith("/kueche") ||
      pfad.startsWith("/sitzplan") ||
      pfad.startsWith("/einlassliste") ||
      // Die Belegung ist für die Küche eine Vorschau: Sie zeigt, wie viele
      // Menüs an den kommenden Abenden zu erwarten sind. Preise stehen dort
      // ohnehin keine.
      pfad.startsWith("/belegung") ||
      pfad.startsWith("/konto") ||
      pfad.startsWith("/geheimhaltung")
    );
  }
  /*
    Der Mailversand ist eine Ausnahme unter den Einstellungen.

    Wer Angebote verschickt, muss sehen können, ob der Versand steht,
    und im Zweifel selbst eine Testmail schicken. Sonst fragt er jedes
    Mal nach. Zugänge anlegen bleibt dagegen beim Inhaber.
  */
  if (pfad.startsWith("/einstellungen/mail")) return rolle === "chef" || rolle === "team";
  if (pfad.startsWith("/einstellungen")) return darfBenutzerVerwalten(rolle);
  return true;
}
