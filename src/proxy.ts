import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { anmeldenMitZiel } from "@/lib/auth/weiter";

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
 *
 * "/api/shop" ist die Schnittstelle, über die der Ticketshop Unverträglich-
 * keiten hierher meldet. Dort meldet sich kein Mensch an, sondern ein Server.
 * Ohne diese Ausnahme liefe der Aufruf auf die Anmeldeseite und die Küche
 * bekäme die Allergie nie zu sehen. Die Route prüft stattdessen einen
 * gemeinsamen Schlüssel im Kopf und lehnt ohne ihn grundsätzlich ab.
 *
 * "/api/vorfreude" ruft die Uhr bei Vercel einmal täglich auf, um die Mails
 * eine Woche vor der Show zu verschicken. Auch dort meldet sich kein Mensch an.
 * Die Route prüft stattdessen das Geheimnis, das Vercel mitschickt. Dasselbe
 * gilt für "/api/bewertung", die Bewertungsmail am Morgen nach der Show, und
 * für "/api/scanner", den nächtlichen Lauf des Kartenscanners.
 *
 * "/api/whatsapp/eingang" ist die Adresse, an die Meta jede WhatsApp-
 * Nachricht liefert. Genau diese eine Adresse, nicht alles unter
 * /api/whatsapp: Die Route prüft die Unterschrift von Meta.
 */
const OHNE_ANMELDUNG = [
  "/anmelden",
  "/ihr-angebot",
  // Einladungslink fürs Showteam: selbst eintragen, siehe app/einladung.
  "/einladung",
  /*
    Die Gaestewand fuer die oeffentliche Webseite. Gibt ausschliesslich
    freigegebene und geschwaerzte Karten heraus, ohne Original, ohne
    Namen (Florian, 27.10.2026). Siehe app/api/postkarte/wand.
  */
  "/api/postkarte/wand",
  "/api/shop",
  "/api/vorfreude",
  "/api/bewertung",
  "/api/scanner",
  // Tägliche Läufe von Vercel, sie prüfen selbst das CRON_SECRET.
  "/api/dienstplan",
  "/api/wein",
  "/api/stempel",
  "/api/whatsapp/eingang",
  // Probemails der Abbrecher-Strecke, prueft selbst das CRON_SECRET.
  "/api/abbrecher",
  // Verkaufsmeldungen von Ditix, prueft selbst den gemeinsamen Schluessel.
  "/api/ditix/verkauf",
  // Nur lesender Pruefbericht ohne Personendaten, prueft selbst seinen Schluessel.
  "/api/ditix/pruefung",
  /*
    FloTix meldet jede neue Buchung hierher, damit sie ohne Wartezeit in
    den Listen steht. Auch hier meldet sich kein Mensch an, sondern ein
    Server; die Route prueft selbst den gemeinsamen Schluessel und legt
    nichts ab, sie wirft nur den Zwischenspeicher weg.
  */
  "/api/flotix/meldung",
  // Eine freigegebene Einzelmail aus einem Hauspostfach, prueft selbst
  // ihren Schluessel. Siehe app/api/mail/senden.
  "/api/mail/senden",
  // Lesender Blick in die Postfaecher, prueft selbst ihren Schluessel.
  "/api/mail/postfach",
  // FloTix storniert ein Ditix-Menue; die Route prueft selbst denselben Schluessel.
  "/api/flotix/menue-storno",
  // FloTix bittet um eine Rueckueberweisung (Mail an Werner und Florian); die Route prueft selbst den Schluessel.
  "/api/flotix/erstattung",
  // FloTix verkauft auf Rechnung und storniert sie wieder; die Routen pruefen selbst den Schluessel.
  "/api/flotix/rechnung",
  "/api/flotix/rechnung-storno",
  "/api/flotix/rechnung-status",
  "/api/flotix/bank",
  // Abonnierbarer Kalender fuer Outlook, prueft selbst den geheimen Schluessel in der Adresse.
  "/api/kalender",
  /*
    Anfragen von der Website und aus Meta-Leadformularen (ueber Make), seit
    20.10.2026 direkt hierher statt in die Google-Tabelle. Die Route prueft
    selbst den gemeinsamen Schluessel (ANFRAGEN_SCHLUESSEL).
  */
  "/api/anfrage",
  // Die Antwort auf "Was hat dich abgehalten?" kommt aus einer Mail an
  // einen Gast. Der hat keinen Zugang und soll auch keinen brauchen.
  "/warum",
  // Die Angebotsseite mit der laufenden Uhr, aus der Mail an einen Gast.
  "/angebot",
  /*
    Der Ausweichtermin nach einer abgesagten Show.

    Die Seite stand in der Liste des Layouts, hier aber nicht, und der
    Proxy kommt zuerst: Jeder Gast, der in der Absagemail auf seinen Link
    tippte, landete auf der Anmeldeseite und konnte nichts auswählen
    (gemeldet von einem Kunden, Florian, 05.10.2026). Der lange
    Zufallsschlüssel im Link ist der Nachweis, wie bei /angebot und
    /warum.
  */
  "/alternative",
  // Der Countdown in der Angebotsmail ist ein Bild fuer den Gast.
  "/api/countdown",
  // Der Bankabruf läuft auf einem Rechner im Haus und hat keinen Benutzer.
  // Die Route lässt nur durch, wer das BANK_IMPORT_SECRET mitschickt.
  "/api/bank",
  /*
    Die beiden Sammelläufe und der Postfachlauf.

    Sie fehlten hier, und das hiess: Die Uhr von Vercel schickt ihre
    Anfrage ohne Anmeldecookie, der Proxy leitet sie zur Anmeldeseite um,
    und der Lauf fand nie statt. Zusammen mit den acht Cronjobs im
    Hobby-Tarif war das der zweite Grund, warum nachts nichts passierte
    (gefunden am 01.10.2026).

    Sicher ist das trotzdem: Beide Adressen prüfen selbst das
    CRON_SECRET und lassen ohne es nur die Buchhaltung durch.
  */
  "/api/nachtlauf",
  "/api/belege",
  /*
    Welche Vorstellungen abgesagt sind.

    Der Ticketshop fragt sie ab, um sie aus seinem Programm zu nehmen.
    Dort meldet sich kein Mensch an, und zu holen gibt es nur die
    Information, dass ein Abend ausfaellt (Florian, 05.10.2026).
  */
  "/api/abgesagt",
  /*
    Die Stempeluhr der Putzfirma.

    Wer putzt, hat keinen Zugang zum Eventmanager und soll auch keinen
    brauchen: Er oeffnet den Link, tippt auf seinen Namen und stempelt
    (Florian, 07.10.2026). Der lange Zufallsschluessel im Link ist der
    Nachweis, wie bei /angebot und /alternative; die Seite prueft ihn
    selbst und zeigt ohne ihn nichts.
  */
  "/putzen",
  /*
    Passwort vergessen.

    Muss offen sein, sonst schickt der Proxy genau den zum Anmelden,
    der sich nicht anmelden kann (Florian, 25.10.2026). Geschuetzt
    ist der Weg durch den Link aus der Mail: Er gilt eine Stunde und
    genau einmal.
  */
  "/passwort-vergessen",
  "/passwort-neu",
  /*
    Kontakte in die Magic News eintragen, von ausserhalb.

    Prueft selbst den Schluessel MAIL_SENDE_SCHLUESSEL, genau wie
    der Mailversand nebenan, und laesst ohne ihn nichts durch
    (Florian, 26.10.2026).
  */
  "/api/brevo",
];

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
  kopf.set("x-suche", request.nextUrl.search);

  const offen = OHNE_ANMELDUNG.some((o) => pfad.startsWith(o));
  const hatCookie = request.cookies.has("fzt_sitzung");

  if (!offen && !hatCookie) {
    const ziel = new URL(anmeldenMitZiel(pfad + request.nextUrl.search), request.url);
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
