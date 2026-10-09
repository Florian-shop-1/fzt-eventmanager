import type { Metadata } from "next";
import { vertragVon } from "@/lib/db/arbeitsvertrag";
import { hasensatz } from "@/lib/personal/hasensatz";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfEinladen, darfSeite, darfStempeln, darfZeitenAendern, darfVertraege, startseiteFuer, type Rolle } from "@/lib/auth/sitzung";
import { anmeldenMitZiel } from "@/lib/auth/weiter";
import { ScanErinnerung } from "@/components/ScanErinnerung";
import { Erinnerungen, type Erinnerung } from "@/components/Erinnerungen";
import { geheimhaltungUnterschrieben } from "@/lib/db/personal";
import { tageSeitLetztemScan } from "@/lib/db/scanner";
import { dienstplanErinnerungen } from "@/lib/dienstplan/erinnerung";
import { faelligeMerker } from "@/lib/db/merker";
import {
  ABSTELLORT,
  bestellungen as weinBestellungen,
  einstellungLesen as weinEinstellung,
  offeneAnzahl as offeneWeinbestellungen,
  zugang as weinZugang,
} from "@/lib/wein/db";
import { BestellungPopup, type OffeneBestellung } from "@/components/BestellungPopup";
import { nebenbeiPruefen } from "@/lib/stempel/wache";
import { zustandVon } from "@/lib/stempel/db";
import { StempelWache } from "@/components/StempelWache";
import { Wortmarke } from "@/components/Logo";
import { Navigation } from "@/components/Navigation";
import { istHandy } from "@/lib/stempel/geraet";
import { geburtstagsText, heutigeGeburtstage } from "@/lib/db/geburtstag";
import { GeburtstagsHase } from "@/components/GeburtstagsHase";
import { HasenPost } from "@/components/HasenPost";
import { naechstePost } from "@/lib/personal/hasenpost";
import { VersandMelder } from "@/components/VersandMelder";
import { WhatsAppMelder } from "@/components/WhatsAppMelder";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
  Die Anwendung soll dort laufen, wo ihre Daten liegen.

  Gemessen am 30.09.2026: Die Funktionen liefen in iad1, also in
  Washington, die Neon-Datenbank steht in eu-central-1, also in
  Frankfurt. Jede Abfrage ist damit ueber den Atlantik gereist, rund
  hundert Millisekunden statt fuenfundzwanzig, und eine Seite stellt
  schnell ein Dutzend davon.

  Der Eintrag in vercel.json allein hat nichts bewirkt, deshalb steht es
  hier zusaetzlich: Next.js gibt preferredRegion aus dem Wurzel-Layout an
  alle Seiten darunter weiter.
*/
export const preferredRegion = "fra1";

export const metadata: Metadata = {
  title: "FZT Eventmanager",
  description: "Internes Programm für Firmenevents im Florian Zimmer Theater",
};

/**
 * Die Navigation, nach Bereichen sortiert (Florian, 23.09.2026).
 *
 * Aus zwei Dutzend Punkten nebeneinander wurde eine Zeile mit sechs
 * Reitern: SHOW, SHOP, EVENTS, FOYER, MAGICUISINE, SONSTIGES. Florian und
 * Kevin sehen fast alles, für sie war die alte Leiste nicht mehr zu
 * überblicken.
 *
 * Wer nur wenige Punkte sieht, bekommt sie weiterhin flach nebeneinander:
 * Das Showteam hat drei Punkte, die muss man nicht erst aufklappen.
 *
 * Die Gastronomie bekommt bewusst nur Funktionsheet und Küchenblatt: dort
 * stehen keine Preise, keine Kundendaten und keine Zahlungen.
 */
interface Punkt {
  href: string;
  label: string;
  rollen: Rolle[];
}

const GRUPPEN: Array<{ titel: string; punkte: Punkt[] }> = [
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
      { href: "/codes", label: "Codes", rollen: ["chef", "team"] },
      { href: "/vorfreude", label: "Vorfreude-Mail", rollen: ["chef", "team"] },
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
        Ganz oben, weil es der erste Gedanke ist: Wer auf Events klickt,
        will oft einen Abend aufmachen, den es im Ticketshop nicht gibt
        (Florian, 28.09.2026). Wer ihn anlegen darf, prüft die Seite.
      */
      { href: "/termin-anlegen", label: "Termin anlegen", rollen: ["chef", "team"] },
      { href: "/leads", label: "Anfragen", rollen: ["chef", "team"] },
      { href: "/vorgaenge", label: "Vorgänge", rollen: ["chef", "team"] },
      { href: "/angebot", label: "Angebot", rollen: ["chef", "team"] },
    ],
  },
  {
    titel: "Foyer",
    punkte: [
      { href: "/foyer", label: "Foyer", rollen: ["chef", "team", "foyer"] },
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
      { href: "/geschenke", label: "Abbrecher-Geschenke", rollen: ["chef", "team", "foyer"] },
      // Dieselbe Seite, nur der Foyer-Teil (Florian, 05.10.2026).
      { href: "/tipps?bereich=foyer", label: "Tipps & Tricks", rollen: ["chef", "team", "foyer"] },
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
      { href: "/personalbogen", label: "Personalbogen", rollen: ["chef", "team", "gastro", "foyer", "showteam", "kiosk", "buchhaltung"] },
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

/** Seiten, die ohne Anmeldung erreichbar sein müssen. */
/*
  Seiten ohne Anmeldung. Dieselbe Liste wie im Proxy, siehe src/proxy.ts:
  Dort wird vorsortiert, hier wird geprueft, und wer nur an einer der
  beiden Stellen steht, landet trotzdem auf der Anmeldeseite (genau das
  passierte dem Ausweichtermin am 05.10.2026).

  "/putzen" ist die Stempeluhr der Putzfirma: ein langer
  Zufallsschluessel im Link, dahinter nur die eigene Uhr.
*/
const OHNE_ANMELDUNG = ["/anmelden", "/ihr-angebot", "/einladung", "/warum", "/angebot", "/alternative", "/putzen"];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Den Pfad setzt die Middleware als Header, das Layout selbst kennt ihn nicht.
  const kopf = await headers();
  const pfad = kopf.get("x-pfad") ?? "/";
  const offen = OHNE_ANMELDUNG.some((o) => pfad.startsWith(o));
  const benutzer = await angemeldeterBenutzer();

  if (!offen && !benutzer) redirect(anmeldenMitZiel(pfad + (kopf.get("x-suche") ?? "")));

  // Wer eine Seite aufruft, die seine Rolle nicht sehen darf, landet auf der
  // Übersicht statt auf einer Fehlermeldung.
  /*
    Wer eine Seite aufruft, die seine Rolle nicht sehen darf, landet auf
    seiner Startseite. Auf seiner, nicht pauschal auf der Uebersicht: Ein
    geteilter Zugang wird von der Uebersicht sofort weitergeschickt, und
    zwei Weiterleitungen, die aufeinander zeigen, ergeben eine Schleife
    (Florian, 05.10.2026).

    Zeigt die Startseite auf sich selbst, wird gar nicht umgeleitet. Dann
    sieht man lieber eine leere Seite als einen Browser, der aufgibt.
  */
  if (benutzer && !offen && !darfSeite(benutzer.rolle, pfad, benutzer.geteilt, benutzer.email)) {
    const ziel = startseiteFuer(benutzer.rolle, benutzer.geteilt);
    if (ziel !== pfad) redirect(ziel);
  }

  // Was diese Person noch erledigen muss. Geschäftsführung und externe
  // Partner (Food-Kiosk) unterschreiben keine Geheimhaltung über das Programm.
  const aufgaben: Erinnerung[] = [];
  // Für das Pop-up: die offenen Bestellungen der Gastro, kurz gefasst.
  let offeneBestellungen: OffeneBestellung[] = [];
  /*
    Alles auf einmal fragen, nicht eines nach dem anderen.

    Diese Auskuenfte haengen nicht voneinander ab, wurden aber nacheinander
    geholt, und jede einzelne kostet den vollen Weg zur Datenbank. Bei
    einem halben Dutzend kommt so vor jeder Seite eine spuerbare Wartezeit
    zusammen, und zwar bei jedem Klick (Florian, 30.09.2026: "der
    eventmanager braucht lang zum laden").

    Die Reihenfolge der Erinnerungen bleibt, wie sie war: Gefragt wird
    gleichzeitig, eingeordnet wird danach.
  */
  const istKevin = benutzer ? benutzer.email.toLowerCase() === "kevin.steele@florianzimmer.com" : false;
  /*
    Ein geteilter Zugang hat keine eigenen Aufgaben.

    Personalbogen, Geheimhaltung, Vertrag, Merkzettel und Hasenpost
    gehoeren einer Person. Auf dem Tablet im Foyer haetten sie niemanden,
    den sie meinen (Florian, 05.10.2026).
  */
  const persoenlich = Boolean(benutzer && !benutzer.geteilt);
  const brauchtGeheimhaltung = Boolean(
    benutzer &&
      !offen &&
      !benutzer.geteilt &&
      !istKevin &&
      !["chef", "kiosk", "agentur", "buchhaltung"].includes(benutzer.rolle),
  );

  const [geheimhaltungOk, dienstplan, merker, weinVorab, vertrag] =
    benutzer && !offen
      ? await Promise.all([
          brauchtGeheimhaltung ? geheimhaltungUnterschrieben(benutzer.id).catch(() => true) : Promise.resolve(true),
          dienstplanErinnerungen(benutzer).catch(() => [] as Erinnerung[]),
          faelligeMerker(benutzer.id).catch(() => [] as Array<{ titel: string; text?: string }>),
          weinEinstellung().catch(() => null),
          vertragVon(benutzer.id).catch(() => null),
        ])
      : [true, [] as Erinnerung[], [] as Array<{ titel: string; text?: string }>, null, null];

  if (benutzer && !offen && persoenlich) {
    if (benutzer.art === "intern" && !benutzer.personalbogenAm && !istKevin) {
      aufgaben.push({
        href: "/personalbogen",
        leiste: "Dein Personalbogen ist noch nicht ausgefüllt.",
        knopf: "Jetzt ausfüllen",
        hase: "Dein Personalbogen fürs Lohnbüro fehlt noch. Dauert nur fünf Minuten.",
      });
    }
    if (brauchtGeheimhaltung && !geheimhaltungOk) {
      aufgaben.push({
        href: "/geheimhaltung",
        leiste: "Deine Geheimhaltungsvereinbarung ist noch nicht unterschrieben.",
        knopf: "Jetzt unterschreiben",
        hase: "Deine Geheimhaltungsvereinbarung ist noch nicht unterschrieben. Ein Zauberer verrät nie seine Tricks!",
      });
    }
    /*
      Ein freigegebener Vertrag wartet.

      Er steht ganz oben, noch vor dem Dienstplan: Ohne Unterschrift darf
      niemand anfangen, das sagt der Vertrag selbst in § 1 (Florian,
      30.09.2026).
    */
    if (vertrag && vertrag.freigegebenAm && !vertrag.unterschriebenAm) {
      aufgaben.push({
        href: "/vertrag",
        leiste: vertrag.erhoehung
          ? "Dein neuer Arbeitsvertrag liegt bereit, mit einem höheren Satz als bisher."
          : "Dein Arbeitsvertrag liegt zur Unterschrift bereit.",
        knopf: "Jetzt ansehen",
        /*
          Der Hase freut sich mit, wenn jemand mehr bekommt (Florian,
          01.10.2026). Eine Gehaltserhoehung ist eine gute Nachricht, und
          die darf auch so klingen.
        */
        hase: hasensatz({ erhoehung: vertrag.erhoehung, eigener: vertrag.hasenText }),
      });
    }

    aufgaben.push(...dienstplan);

    // Der eigene Merkzettel: meldet sich alle paar Tage, siehe lib/db/merker.ts.
    for (const m of merker) {
      aufgaben.push({
        href: "/merker",
        leiste: m.titel,
        knopf: "Merkzettel",
        hase: `${m.titel}${m.text ? ` ${m.text}` : ""}`,
      });
    }

    // Nebenbei prüfen, ob jemand das Ausstempeln vergessen hat.
    if (["chef", "team"].includes(benutzer.rolle)) void nebenbeiPruefen();

    /*
      Offene Weinbestellung der Gastro.

      Gezeigt wird sie jedem, der den Wein hinstellen koennte, nicht nur
      den dreien auf der Mailliste: "wenn was bestellt wird, reicht es an
      kevin, olena und mich zu mailen. der hase soll bei allen anzeigen,
      wenn was noch nicht geliefert wurde" (Florian, 09.10.2026).

      Die Mail bleibt also eng, der Hase wird breit. Ist der Wein
      abgestellt, kommt offeneWeinbestellungen() mit 0 zurueck und der
      Hase bleibt weg.
    */
    const wein = weinVorab;
    const darfStellen = ["chef", "team", "foyer"].includes(benutzer.rolle);
    if (wein && darfStellen && (wein.freigegeben || benutzer.email.toLowerCase() === "info@florianzimmer.com")) {
      const n = await offeneWeinbestellungen().catch(() => 0);
      if (n > 0) {
        aufgaben.push({
          href: "/bestellungen",
          leiste: `Die Gastro hat Magicuvée bestellt: ${n === 1 ? "eine Bestellung ist" : `${n} Bestellungen sind`} noch nicht abgestellt.`,
          knopf: "Ansehen",
          hase: "Die Gastro hat Wein bestellt! Bitte bei den Kühlhäusern bereitstellen und abhaken.",
        });
        offeneBestellungen = (await weinBestellungen({ status: "offen" }).catch(() => [])).map((x) => ({
          id: x.id,
          zeilen: x.positionen.map((p) => `${p.menge} × ${p.name}`),
          besteller: x.bestellerName,
          notiz: x.notiz,
        }));
      }
    }
  }
  // Die Stempeluhr sitzt als eigener Knopf in der Leiste, nicht in der
  // Navigation: Sie ist der Punkt, den die Mitarbeiter zuerst brauchen
  // (Florian, 21.09.2026). Der Punkt daneben zeigt, ob die Zeit läuft.
  // Der Stempelknopf erscheint nur am Handy: Am Rechner und am Tablet
  // wird nicht gestempelt (Florian, 23.09.2026).
  const amHandy = istHandy(kopf.get("user-agent"));
  // Auch diese beiden haengen nicht voneinander ab.
  const [stempelZustand, weinZugriff] = await Promise.all([
    benutzer && !offen && amHandy && darfStempeln(benutzer)
      ? zustandVon(benutzer.id).catch(() => null)
      : Promise.resolve(null),
    benutzer && !offen ? weinZugang(benutzer).catch(() => null) : Promise.resolve(null),
  ]);
  const weinSichtbar = weinZugriff?.sehen === true;

  /*
    Die Reiter für diese Person zusammenstellen.

    Drei Punkte hängen nicht an der Rolle, sondern an einer Freigabe für
    die einzelne Person, deshalb kommen sie hier dazu: die Bestellungen
    der Gastro, die Einladungslinks (Florian und Kevin) und die Belege
    (Buchhaltung).
  */
  const gruppen = benutzer
    ? GRUPPEN.map((g) => {
        // Beim geteilten Zugang entscheidet nicht die Rolle, sondern die
        // kurze Liste seiner Seiten (siehe GETEILTE_SEITEN).
        const punkte = g.punkte.filter(
          (p) =>
            p.rollen.includes(benutzer.rolle) &&
            // Dieselbe Pruefung wie beim Aufruf der Seite: Was niemand
            // sehen darf, steht auch nicht im Menue.
            darfSeite(benutzer.rolle, p.href, benutzer.geteilt, benutzer.email),
        );
        if (g.titel === "Magicuisine" && weinSichtbar) {
          punkte.push({ href: "/bestellungen", label: "Bestellungen", rollen: [] });
        }
        /*
          Der Weg zu den Arbeitszeiten für das Büro.

          Gestempelt wird ausschließlich am Handy, dabei bleibt es
          (Florian, 24.09.2026). Deshalb steht der Stempelknopf weiter nur
          in der Handy-Leiste, und dieser Menüpunkt ist nicht zum
          Stempeln da: Er führt Florian, Kevin und die Buchhaltung zu den
          Stunden, die sie ansehen und korrigieren. Die Mitarbeiter
          bekommen ihn nicht zu sehen, damit am Rechner niemand glaubt,
          er könne hier stempeln.
        */
        if (g.titel === "Mitarbeiter" && darfZeitenAendern(benutzer)) {
          punkte.unshift({ href: "/stempeluhr", label: "Zeiterfassung", rollen: [] });
          // Die Stunden je Abrechnungszeitraum, die Werner ans Steuerbüro
          // meldet. Eigener Punkt, weil es eine andere Frage ist als die
          // Zeiterfassung: Dort wird korrigiert, hier gemeldet.
          punkte.splice(1, 0, { href: "/lohn", label: "Stundenmeldung", rollen: [] });
          /*
            Die Putzfirma rechnet nach Stunden ab und stempelt selbst.
            Eigener Punkt, weil es keine Lohnsache ist, sondern eine
            Rechnung, die geprueft wird (Florian, 07.10.2026).
          */
          punkte.splice(2, 0, { href: "/reinigung", label: "Reinigung", rollen: [] });
        }
        /*
          Die Arbeitsvertraege sehen dieselben drei wie die Arbeitszeiten:
          Florian, Werner und Kevin (Florian, 30.09.2026). Ein Vertrag
          nennt das Gehalt, das geht sonst niemanden im Haus etwas an.
        */
        if (g.titel === "Mitarbeiter" && darfVertraege(benutzer)) {
          punkte.unshift({ href: "/vertraege", label: "Arbeitsverträge", rollen: [] });
          /*
            Die Unterlagen von früher: Papierverträge und Papierbögen, so
            wie sie hereinkamen, dazu die abgelegten Angaben aus dem
            Personalbogen (Florian, 01.10.2026).
          */
          punkte.splice(1, 0, { href: "/unterlagen", label: "Personalunterlagen", rollen: [] });
        }
        if (g.titel === "Sonstiges" && darfEinladen(benutzer) && benutzer.rolle !== "chef") {
          punkte.push({ href: "/einstellungen/einladungen", label: "Einladungen", rollen: [] });
        }
        if (g.titel === "Buchhaltung" && darfBuchhaltung(benutzer)) {
          /*
            Die Reihenfolge folgt dem Weg eines Belegs: erst scannen, dann
            dem Konto zuordnen, dann sehen, was offen ist. Die Geschenke
            stehen zuletzt, sie sind eine Auswertung und keine Arbeit.
          */
          punkte.unshift(
            { href: "/bewirtung", label: "Belege scannen", rollen: [] },
            { href: "/bewirtung/abgleich", label: "Belege abgleichen", rollen: [] },
            { href: "/bewirtung/rechnungen", label: "Eingangsrechnungen", rollen: [] },
          );
          punkte.push({ href: "/bewirtung/geschenke", label: "Geschenke", rollen: [] });
        }
        return { titel: g.titel, punkte };
      }).filter((g) => g.punkte.length > 0)
    : [];

  /*
    Hat heute jemand Geburtstag? Das sieht jeder, der das Programm
    benutzt, und der Hase sagt es einmal am Tag (Florian, 23.09.2026).
    Nur dass jemand Geburtstag hat, nie wie alt er wird.
  */
  const geburtstage = benutzer && !offen ? await heutigeGeburtstage().catch(() => []) : [];
  const geburtstagSatz =
    benutzer && geburtstage.length > 0 ? geburtstagsText(geburtstage, benutzer.id) : null;

  /*
    Hasenpost: eine persoenliche Erinnerung an genau diese Person.

    Geholt wird sie fuer jeden, auch fuers Foyer und die Gastro: Der
    Hase soll jeden erreichen koennen, den Florian erinnern will
    (Florian, 04.10.2026). Hoechstens eine am Tag, siehe
    lib/personal/hasenpost.ts.
  */
  const hasenpost = benutzer && !offen && persoenlich ? await naechstePost(benutzer.id).catch(() => null) : null;

  // Der Scan-Hase erinnert nach einer Woche ohne gescannte Karte.
  const scanPause =
    benutzer && !offen && ["chef", "team", "foyer"].includes(benutzer.rolle)
      ? await tageSeitLetztemScan().catch(() => null)
      : null;

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/*
          Auf den offenen Seiten bleibt die interne Navigation immer aus,
          auch für angemeldete Mitarbeiter. So sieht man beim Prüfen eines
          Angebotslinks genau das, was der Kunde sieht.
        */}
        {benutzer && !offen && (
          <header className="border-b border-linie bg-flaeche print:hidden">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
              <Link href="/" className="flex items-center gap-2.5" title="Übersicht">
                <Wortmarke hoehe={18} />
                <span className="text-sm text-leise">Eventmanager</span>
              </Link>

              <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
                <Link
                  href="/"
                  className="rounded px-3 py-1.5 text-leise transition-colors hover:bg-gold-hell hover:text-text"
                >
                  Übersicht
                </Link>
                <Navigation gruppen={gruppen} />
                {/*
                  Versand und WhatsApp stehen als eigene Knoepfe da, weil
                  beide etwas melden, das liegen bleibt, wenn niemand
                  hinsieht (Florian, 25.09.2026).
                */}
                {["chef", "team"].includes(benutzer.rolle) && <VersandMelder />}
                {benutzer.whatsapp && <WhatsAppMelder />}
              </nav>

              <div className="flex items-center gap-3 text-xs">
                {stempelZustand && (
                  <Link
                    href="/stempeluhr"
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
                    style={{ background: stempelZustand === "aus" ? "var(--gut)" : "var(--blocker)" }}
                    title="Stempeluhr"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-white"
                      style={{ opacity: stempelZustand === "aus" ? 0.5 : 1 }}
                    />
                    {stempelZustand === "aus"
                      ? "EIN-stempeln"
                      : stempelZustand === "pause"
                        ? "In der Pause"
                        : "AUS-stempeln"}
                  </Link>
                )}
                {/*
                  Kein Abmelden in der Kopfzeile: Die Leute sollen angemeldet
                  bleiben, so wie sie es von anderen Programmen kennen. Wer
                  sich wirklich abmelden will, findet es unter seinem Namen
                  (Florian, 21.09.2026).
                */}
                <Link href="/konto" className="text-leise hover:text-text">
                  {benutzer.name}
                </Link>
              </div>
            </div>
          </header>
        )}

        {/*
          Wer eingestempelt ist, meldet still seinen Standort. Verlaesst er
          das Gelaende, stempelt der Server ihn aus (Florian, 21.09.2026).
        */}
        {stempelZustand && stempelZustand !== "aus" && <StempelWache />}

        {offeneBestellungen.length > 0 && (
          <BestellungPopup offen={offeneBestellungen} abstellort={ABSTELLORT} />
        )}

        {benutzer && aufgaben.length > 0 && (
          <Erinnerungen offen={aufgaben} vorname={benutzer.name.split(" ")[0]} stillerHase={Boolean(hasenpost)} />
        )}

        {benutzer?.mussPasswortAendern && !offen && (
          <div
            className="border-b px-6 py-2 text-center text-sm print:hidden"
            style={{ background: "var(--warnung-hell)", borderColor: "var(--warnung)" }}
          >
            Du arbeitest noch mit dem Startpasswort.{" "}
            <Link href="/konto" className="underline">
              Jetzt ein eigenes vergeben
            </Link>
          </div>
        )}

        {/*
          Offene Seiten bestimmen ihre Breite selbst. Das Angebot etwa
          beginnt mit einer dunklen Buehne ueber die volle Fensterbreite,
          die darf der Rahmen des Arbeitsprogramms nicht beschneiden.
        */}
        <main
          className={
            offen ? "w-full flex-1" : "mx-auto w-full max-w-6xl flex-1 px-6 py-8"
          }
        >
          {children}
        </main>

        {!offen && (
          <footer className="border-t border-linie px-6 py-4 text-center text-xs text-leise print:hidden">
            Florian Zimmer Theater GmbH, Neu-Ulm
          </footer>
        )}

        {geburtstagSatz && (
          <GeburtstagsHase
            text={geburtstagSatz}
            konfetti={geburtstage.some((g) => g.id === benutzer?.id)}
          />
        )}

        {/*
          Die Hasenpost geht vor: Sie ist persoenlich gemeint, waehrend
          der Scan-Hinweis nur eine Gewohnheit anstoesst.
        */}
        {benutzer && hasenpost && (
          <HasenPost
            id={hasenpost.id}
            text={hasenpost.text}
            anlass={hasenpost.anlass}
            vorname={benutzer.name.split(" ")[0]}
          />
        )}

        {benutzer && !hasenpost && aufgaben.length === 0 && scanPause !== null && scanPause >= 7 && (
          <ScanErinnerung tage={scanPause} vorname={benutzer.name.split(" ")[0]} />
        )}
      </body>
    </html>
  );
}
