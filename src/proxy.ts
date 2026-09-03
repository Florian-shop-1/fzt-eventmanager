import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Läuft vor jeder Anfrage.
 *
 * Drei Aufgaben:
 *  1. Den angefragten Pfad als Header weitergeben. Das Layout braucht ihn,
 *     um zu entscheiden, ob eine Rolle diese Seite sehen darf.
 *  2. Wer gar kein Anmeldecookie hat, wird sofort zur Anmeldung geschickt,
 *     ohne dass die Seite überhaupt gebaut wird.
 *  3. Sich den zuletzt angesehenen Abend merken.
 *
 * Die eigentliche Prüfung passiert bewusst NICHT hier, sondern im Layout:
 * dort lässt sich die Unterschrift des Cookies prüfen und in der Datenbank
 * nachsehen, ob der Zugang noch gültig ist. Hier wird nur vorsortiert.
 */

/**
 * Seiten ohne Anmeldung.
 *
 * "/ihr-angebot" ist die Seite, die der Kunde über seinen persönlichen Link
 * aufruft. Sie ist absichtlich offen: Der lange Zufallsschlüssel im Link ist
 * der Nachweis. Ohne ihn führt der Aufruf ins Leere.
 */
const OHNE_ANMELDUNG = ["/anmelden", "/ihr-angebot"];

/**
 * Der zuletzt angesehene Abend.
 *
 * Im Alltag arbeitet man an einem Tag: Man schaut den Sitzplan an, dann
 * die Parkplätze, dann das Funktionsheet, und immer geht es um denselben
 * Abend. Vorher musste man ihn auf jeder Seite neu suchen.
 *
 * Deshalb wird die Wahl hier gemerkt, sobald sie in der Adresse steht.
 * Jede Seite nimmt sie als Vorgabe, solange nichts anderes gewählt ist.
 * Das Merken gehört in den Proxy, weil Seiten beim Bauen keine Cookies
 * setzen dürfen.
 */
const ABEND_COOKIE = "fzt_abend";
const MONAT_COOKIE = "fzt_monat";

export function proxy(request: NextRequest) {
  const pfad = request.nextUrl.pathname;

  const kopf = new Headers(request.headers);
  kopf.set("x-pfad", pfad);

  const offen = OHNE_ANMELDUNG.some((o) => pfad.startsWith(o));
  const hatCookie = request.cookies.has("fzt_sitzung");

  if (!offen && !hatCookie) {
    const ziel = new URL("/anmelden", request.url);
    return NextResponse.redirect(ziel);
  }

  const antwort = NextResponse.next({ request: { headers: kopf } });

  // Wahl merken, wenn sie in der Adresse steht.
  const abend = request.nextUrl.searchParams.get("abend");
  const monat = request.nextUrl.searchParams.get("monat");

  // Nur einfache Kennungen übernehmen, nichts aus der Adresse blind
  // weiterreichen.
  if (abend && /^[\w-]{1,64}$/.test(abend)) {
    antwort.cookies.set(ABEND_COOKIE, abend, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 12 });
  }
  if (monat && /^\d{4}-\d{2}$/.test(monat)) {
    antwort.cookies.set(MONAT_COOKIE, monat, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 12 });
  }

  return antwort;
}

export const config = {
  /**
   * Alles außer Dateien, die einfach ausgeliefert werden sollen.
   *
   * Wichtig ist der Ordner "bilder". Er lag vorher nicht in dieser Liste,
   * und die Folge war ernst: Jedes Bild wurde zur Anmeldung umgeleitet.
   * Kunden, die ihren Angebotslink öffneten, bekamen deshalb kein
   * einziges Foto zu sehen, und auf dem gedruckten Brief fehlte der
   * Briefbogen. Aufgefallen ist es nicht, weil angemeldete Mitarbeiter
   * die Bilder ganz normal sahen.
   *
   * Bilder sind kein Geheimnis: Es sind Fotos vom Haus und Briefpapier.
   * Was schützenswert ist, liegt in den Seiten, nicht im Bildordner.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|bilder/).*)"],
};
