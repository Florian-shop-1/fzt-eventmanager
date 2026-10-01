import type { Metadata } from "next";
import { vertragVon } from "@/lib/db/arbeitsvertrag";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfEinladen, darfSeite, darfStempeln, darfZeitenAendern, darfVertraege, type Rolle } from "@/lib/auth/sitzung";
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
      { href: "/upgrades", label: "Upgrades", rollen: ["chef", "team", "showteam", "foyer"] },
      { href: "/sitzplan", label: "Sitzplan", rollen: ["chef", "team", "gastro", "foyer"] },
      { href: "/einlassliste", label: "Einlassliste", rollen: ["chef", "team", "gastro", "foyer"] },
      { href: "/gaesteliste", label: "Gästeliste", rollen: ["chef", "team"] },
      { href: "/hoerezu", label: "🎤 Höre zu", rollen: ["chef", "team", "showteam"] },
      { href: "/tipps", label: "Tipps & Tricks", rollen: ["chef", "team", "showteam"] },
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
      { href: "/rechnungen", label: "Rechnungen", rollen: ["chef", "team", "buchhaltung"] },
      { href: "/zahlungseingaenge", label: "Zahlungseingänge", rollen: ["chef", "team", "buchhaltung"] },
    ],
  },
  {
    titel: "Foyer",
    punkte: [
      { href: "/foyer", label: "Foyer", rollen: ["chef", "team", "foyer"] },
      { href: "/foyer/plan", label: "Foyer-Dienstplan", rollen: ["chef", "team", "foyer"] },
      { href: "/parkplaetze", label: "Parkplätze", rollen: ["chef", "team", "foyer"] },
      { href: "/scanner", label: "Emoji-Scanner", rollen: ["chef", "team", "foyer"] },
      { href: "/geschenke", label: "Abbrecher-Geschenke", rollen: ["chef", "team", "foyer"] },
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
const OHNE_ANMELDUNG = ["/anmelden", "/ihr-angebot", "/einladung", "/warum", "/angebot", "/alternative"];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Den Pfad setzt die Middleware als Header, das Layout selbst kennt ihn nicht.
  const kopf = await headers();
  const pfad = kopf.get("x-pfad") ?? "/";
  const offen = OHNE_ANMELDUNG.some((o) => pfad.startsWith(o));
  const benutzer = await angemeldeterBenutzer();

  if (!offen && !benutzer) redirect(anmeldenMitZiel(pfad + (kopf.get("x-suche") ?? "")));

  // Wer eine Seite aufruft, die seine Rolle nicht sehen darf, landet auf der
  // Übersicht statt auf einer Fehlermeldung.
  if (benutzer && !offen && !darfSeite(benutzer.rolle, pfad)) redirect("/");

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
  const brauchtGeheimhaltung = Boolean(
    benutzer && !offen && !istKevin && !["chef", "kiosk", "agentur", "buchhaltung"].includes(benutzer.rolle),
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

  if (benutzer && !offen) {
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
        leiste: "Dein Arbeitsvertrag liegt zur Unterschrift bereit.",
        knopf: "Jetzt ansehen",
        hase: "Dein Arbeitsvertrag liegt bereit. Lies ihn in Ruhe durch und unterschreib ihn hier.",
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

    // Offene Weinbestellung der Gastro: bei allen, die Bescheid bekommen sollen.
    const wein = weinVorab;
    if (wein && wein.meldenAn.includes(benutzer.id) && (wein.freigegeben || benutzer.email.toLowerCase() === "info@florianzimmer.com")) {
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
        const punkte = g.punkte.filter((p) => p.rollen.includes(benutzer.rolle));
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
        }
        /*
          Die Arbeitsvertraege sehen dieselben drei wie die Arbeitszeiten:
          Florian, Werner und Kevin (Florian, 30.09.2026). Ein Vertrag
          nennt das Gehalt, das geht sonst niemanden im Haus etwas an.
        */
        if (g.titel === "Mitarbeiter" && darfVertraege(benutzer)) {
          punkte.unshift({ href: "/vertraege", label: "Arbeitsverträge", rollen: [] });
        }
        if (g.titel === "Sonstiges" && darfEinladen(benutzer) && benutzer.rolle !== "chef") {
          punkte.push({ href: "/einstellungen/einladungen", label: "Einladungen", rollen: [] });
        }
        if (g.titel === "Sonstiges" && darfBuchhaltung(benutzer)) {
          punkte.push({ href: "/bewirtung", label: "Belege", rollen: [] });
          // Welche Ausgabe hat noch keinen Beleg (Florian, 29.09.2026).
          punkte.push({ href: "/bewirtung/abgleich", label: "Belege abgleichen", rollen: [] });
          // Was wir schulden und was schon bezahlt ist (Florian, 30.09.2026).
          punkte.push({ href: "/bewirtung/rechnungen", label: "Eingangsrechnungen", rollen: [] });
          // Was an Mitarbeiter und Partner verschenkt wurde, samt der
          // 50-Euro-Grenze je Person und Monat (Florian, 01.10.2026).
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
          <Erinnerungen offen={aufgaben} vorname={benutzer.name.split(" ")[0]} />
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

        {benutzer && aufgaben.length === 0 && scanPause !== null && scanPause >= 7 && (
          <ScanErinnerung tage={scanPause} vorname={benutzer.name.split(" ")[0]} />
        )}
      </body>
    </html>
  );
}
