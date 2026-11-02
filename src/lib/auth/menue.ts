/**
 * Das Menü des Eventmanagers, und wer welchen Punkt sieht.
 *
 * Stand bis zum 02.11.2026 in app/layout.tsx. Dort war es gut
 * aufgehoben, solange es nur darum ging, Links zu zeichnen. Es
 * entscheidet aber auch, wer wohin darf, und diese Frage wurde ein
 * zweites Mal in auth/sitzung.ts beantwortet.
 *
 * Zweimal dieselbe Frage heisst: Irgendwann fallen die Antworten
 * auseinander. Genau das ist zweimal passiert, beim Show-Check am
 * 05.10.2026 und beim Postkartenscannen am 02.11.2026: Der Punkt stand
 * im Menü, der Pfad fehlte in der Rechtepruefung, und wer darauf
 * tippte, landete auf der Startseite.
 *
 * "ja mach das mit den rechten aus dem menü" (Florian, 02.11.2026).
 * Jetzt steht die Liste hier, und die Rechtepruefung liest sie mit.
 *
 * ACHTUNG, bewusste Richtung: Das Menü erlaubt, es verbietet nicht.
 * Wer hier steht, kommt auch hin. Was hier nicht steht, kann trotzdem
 * erlaubt sein, denn es gibt Seiten ohne Menuepunkt: die eigene
 * Personalakte, den eigenen Vertrag, Unterseiten mit Kennung in der
 * Adresse. Diese Regeln stehen weiter in sitzung.ts. Entzogen wird
 * nie ueber diese Datei, sonst waere eine vergessene Zeile hier ein
 * stilles Loch in der Rechtepruefung.
 *
 * Nicht enthalten ist, was layout.tsx zusaetzlich je nach Person
 * einblendet, etwa die Personalakten fuer Werner und Kevin. Solche
 * Punkte haengen an mehr als der Rolle und werden dort geprueft, wo
 * sie entstehen.
 */

import type { Rolle } from "./sitzung";

export interface Punkt {
  href: string;
  label: string;
  rollen: Rolle[];
}

export const GRUPPEN: Array<{ titel: string; punkte: Punkt[] }> = [
  {
    titel: "Show",
    punkte: [
      { href: "/dienstplan", label: "Dienstplan", rollen: ["chef", "team", "showteam"] },
      /*
        Die Checkliste des Abends, direkt unter dem Dienstplan.

        "Diese Checklisten sind wichtig für alle, insbesondere aber für T1
        und T2" (Florian, 03.10.2026). Deshalb steht sie weit oben und
        nicht hinter Tipps & Tricks.
      */
      { href: "/showcheck", label: "Show-Check", rollen: ["chef", "team", "showteam"] },
      { href: "/upgrades", label: "Upgrades", rollen: ["chef", "team", "showteam", "foyer"] },
      { href: "/sitzplan", label: "Sitzplan", rollen: ["chef", "team", "gastro", "foyer"] },
      { href: "/einlassliste", label: "Einlassliste", rollen: ["chef", "team", "gastro", "foyer"] },
      /*
        Von hier an den Ticketscanner (Florian, 29.10.2026). Gescannt wird
        bei FloTix, die Seite ist nur die Tuer dahin: "der soll sonst
        nichts im backend sehen können.. nur die scans bei flotix machen".
      */
      { href: "/ticketscan", label: "Tickets scannen", rollen: ["chef", "team", "gastro", "foyer", "showteam"] },
      { href: "/gaesteliste", label: "Gästeliste", rollen: ["chef", "team"] },
      { href: "/hoerezu", label: "🎤 Höre zu", rollen: ["chef", "team", "showteam"] },
      { href: "/tipps?bereich=show", label: "Tipps & Tricks", rollen: ["chef", "team", "showteam"] },
    ],
  },
  {
    titel: "Shop",
    punkte: [
      { href: "/marketing", label: "Woher die Verkäufe kommen", rollen: ["chef", "team", "agentur"] },
      { href: "/abbrueche", label: "Abgebrochene Buchungen", rollen: ["chef", "team"] },
      { href: "/stoerungen", label: "Störungen", rollen: ["chef", "team"] },
      { href: "/barrierefrei", label: "Barrierefreie Plätze", rollen: ["chef", "team"] },
      { href: "/codes", label: "Codes", rollen: ["chef", "team"] },
      { href: "/vorfreude", label: "Vorfreude-Mail", rollen: ["chef", "team"] },
      { href: "/regiotv-info", label: "RegioTV-Info-Mail", rollen: ["chef", "team"] },
      { href: "/telefon", label: "Telefonassistent", rollen: ["chef", "team"] },
      { href: "/absagen", label: "Show absagen", rollen: ["chef", "team"] },
      { href: "/bewertung", label: "Bewertungen", rollen: ["chef", "team"] },
      /*
        Die Zauberstaebe haben keinen eigenen Menuepunkt mehr.

        Sie stehen in derselben Versandliste wie die Gutscheine: "das soll
        alles in eine liste zum abarbeiten" (Florian, 30.09.2026). Ein
        zweiter Eintrag im Menue hiesse, es gaebe zwei Orte, und genau das
        soll es nicht mehr geben. Die Seite selbst bleibt, dort werden die
        Begleitschreiben gedruckt; der Weg dorthin steht an jeder Karte.
      */
    ],
  },
  {
    titel: "Events",
    punkte: [
      /*
        Die Anfragen stehen ganz oben (Florian, 28.10.2026): "mach mal
        Anfragen ganz nach oben". Daran hängt das Geschäft, und jede
        Stunde, die eine Anfrage liegen bleibt, kostet. Am Reiter EVENTS
        und an diesem Punkt steht die Zahl der unbearbeiteten Anfragen,
        siehe components/AnfragenMarke.tsx.

        Vorher stand hier "Termin anlegen", weil es der erste Gedanke
        beim Klick auf Events sei (Florian, 28.09.2026). Das Anlegen
        bleibt gleich darunter.
      */
      { href: "/leads", label: "Anfragen", rollen: ["chef", "team"] },
      { href: "/termin-anlegen", label: "Termin anlegen", rollen: ["chef", "team"] },
      { href: "/vorgaenge", label: "Vorgänge", rollen: ["chef", "team"] },
      { href: "/angebot", label: "Angebot", rollen: ["chef", "team"] },
    ],
  },
  {
    titel: "Foyer",
    punkte: [
      /*
        Das Blatt heisst nach dem, was darauf steht: Stehtische,
        Baendchen, wer wohin gehoert. Zwei Punkte "Foyer" untereinander
        sagten niemandem, welcher welcher ist (Florian, 16.10.2026).
      */
      { href: "/foyer", label: "Stehtische", rollen: ["chef", "team", "foyer"] },
      /*
        Die To-do-Liste des Foyers, nach demselben Muster wie der
        Show-Check. Sie stand zuerst unter "Show", und dort sucht sie
        niemand: Wer im Foyer arbeitet, schaut unter Foyer
        (Florian, 05.10.2026).
      */
      { href: "/foyer/check", label: "Foyer-Check", rollen: ["chef", "team", "foyer"] },
      { href: "/foyer/plan", label: "Foyer-Dienstplan", rollen: ["chef", "team", "foyer"] },
      { href: "/parkplaetze", label: "Parkplätze", rollen: ["chef", "team", "foyer"] },
      { href: "/scanner", label: "Emoji-Scanner", rollen: ["chef", "team", "foyer"] },
      /*
        Die handgeschriebenen Gaestepostkarten: scannen, lesen lassen,
        schwaerzen, auf die Gaestewand (Florian, 27.10.2026). Steht
        neben dem Emoji-Scanner, weil es dieselbe Handbewegung ist:
        etwas fotografieren, das ein Gast dagelassen hat.
      */
      { href: "/postkarten", label: "Postkarten scannen", rollen: ["chef", "team", "foyer"] },
      // Visitenkarten, die Florian persoenlich bekommt: lesen und in die
      // Magic News (Florian, 25.10.2026). Nur das Buero, denn dabei
      // entsteht ein Kontakt, den wir anschreiben.
      { href: "/visitenkarten", label: "Visitenkarten", rollen: ["chef", "team"] },
      // Den Magic-News-Verteiler durchgehen: Adressen, hinter denen kein
      // Gast sitzt (Florian, 25.10.2026).
      { href: "/verteiler", label: "Verteiler aufräumen", rollen: ["chef", "team"] },
      { href: "/geschenke", label: "Geschenke", rollen: ["chef", "team", "foyer"] },
      // Dieselbe Seite, nur der Foyer-Teil (Florian, 05.10.2026).
      { href: "/tipps?bereich=foyer", label: "Tipps & Tricks", rollen: ["chef", "team", "foyer"] },
    ],
  },
  /*
    Das Haus selbst.

    "lass uns einen neuen menuepunkt machen im manager, den wir
    gebaeude nennen, nur fuer kevin und mich" (Florian, 26.10.2026).
    Lueftung, Heizung, Brandmeldeanlage: Dinge, die zweimal im Jahr
    vorkommen und beim zweiten Mal niemand mehr weiss. Deshalb faengt
    es mit den Anleitungen an.
  */
  {
    titel: "Gebäude",
    punkte: [
      { href: "/tipps?bereich=gebaeude", label: "Tipps & Tricks", rollen: ["chef", "team"] },
    ],
  },
  {
    titel: "Magicuisine",
    punkte: [
      { href: "/kueche", label: "Küche", rollen: ["chef", "team", "gastro"] },
      { href: "/funktionsheet", label: "Funktionsheet", rollen: ["chef", "team", "gastro"] },
      { href: "/belegung", label: "Belegung", rollen: ["chef", "team", "gastro"] },
      { href: "/kiosk", label: "Food-Kiosk", rollen: ["chef", "team", "kiosk"] },
    ],
  },
  /*
    Alles, was mit Geld und Belegen zu tun hat, an einem Ort.

    "bitte mache einen Reiter, den du Buchhaltung nennst, dort packst du
    die dinge wie die Belege, eingang und ausgangsrechnungen rein"
    (Florian, 01.10.2026). Vorher hing das alles unter Sonstiges, hinter
    Shortcuts und Merkzettel, und die Ausgangsrechnungen standen sogar
    unter Events.

    Wer die Punkte sieht, entscheidet sich weiter unten je Punkt: Die
    Belege und die Geschenke sehen nur Werner und Florian, die
    Rechnungen auch das Buero.
  */
  {
    titel: "Buchhaltung",
    punkte: [
      { href: "/rechnungen", label: "Ausgangsrechnungen", rollen: ["chef", "team", "buchhaltung"] },
      { href: "/zahlungseingaenge", label: "Zahlungseingänge", rollen: ["chef", "team", "buchhaltung"] },
    ],
  },
  /*
    Alles, was die Leute betrifft, an einem Ort.

    "mach am besten eine rubrik mitarbeiter - darunter kannst du dann die
    verträge, geheimhaltung, zeiterfassung packen" (Florian, 30.09.2026).
    Vorher lag die Geheimhaltung unter Sonstiges und die Zeiterfassung
    wurde dort unten angehaengt, was beides niemand vermutet haette.

    Der eigene Personalbogen steht bewusst mit drin: Wer hier sucht, sucht
    seine eigenen Unterlagen.
  */
  {
    titel: "Mitarbeiter",
    punkte: [
      { href: "/personalbogen", label: "Personalbogen", rollen: ["chef", "team", "gastro", "foyer", "showteam", "kiosk", "buchhaltung", "nebenjob"] },
      /*
        Der eigene Arbeitsvertrag, dauerhaft erreichbar.

        Es gab die Seite schon, aber den Weg dorthin nur solange der
        Vertrag unterschrieben werden musste: Dann stand oben ein
        Hinweisbalken. Sobald jemand unterschrieben hatte, verschwand
        der Balken, und die Seite war nur noch zu erreichen, indem man
        die Adresse abtippt. Wer seine Ausfertigung ein halbes Jahr
        spaeter fuer die Bank oder das Amt braucht, findet sie so nicht
        (gefunden am 31.10.2026).

        Liegt kein Vertrag vor, sagt die Seite das in einem Satz. Das
        ist besser als ein Menuepunkt, der mal da ist und mal nicht.
      */
      { href: "/vertrag", label: "Mein Arbeitsvertrag", rollen: ["chef", "team", "gastro", "foyer", "showteam", "kiosk", "buchhaltung", "nebenjob"] },
      { href: "/geheimhaltung", label: "Geheimhaltung", rollen: ["chef", "team", "gastro", "foyer", "showteam"] },
      // Hasenpost: nur Florian, siehe app/hasenpost/aktionen.ts.
      { href: "/hasenpost", label: "Hasenpost", rollen: ["chef"] },
    ],
  },
  {
    titel: "Sonstiges",
    punkte: [
      { href: "/shortcuts", label: "Shortcuts", rollen: ["chef", "team", "foyer"] },
      { href: "/merker", label: "Merkzettel", rollen: ["chef", "team", "gastro", "foyer", "showteam", "kiosk", "buchhaltung"] },
      { href: "/einstellungen/mail", label: "E-Mail-Versand", rollen: ["chef", "team"] },
      { href: "/einstellungen/benutzer", label: "Zugänge", rollen: ["chef"] },
    ],
  },
];
