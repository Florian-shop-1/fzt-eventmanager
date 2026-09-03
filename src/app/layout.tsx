import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfSeite, type Rolle } from "@/lib/auth/sitzung";
import { abmelden } from "@/lib/auth/aktionen";
import { Wortmarke } from "@/components/Logo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FZT Eventmanager",
  description: "Internes Programm für Firmenevents im Florian Zimmer Theater",
};

/**
 * Was welche Rolle sieht. Die Gastronomie bekommt bewusst nur
 * Funktionsheet und Küchenblatt: dort stehen keine Preise, keine
 * Kundendaten und keine Zahlungen.
 */
const NAVIGATION: Array<{ href: string; label: string; rollen: Rolle[] }> = [
  { href: "/", label: "Übersicht", rollen: ["chef", "team", "gastro"] },
  { href: "/vorgaenge", label: "Vorgänge", rollen: ["chef", "team"] },
  { href: "/leads", label: "Anfragen", rollen: ["chef", "team"] },
  { href: "/angebot", label: "Angebot", rollen: ["chef", "team"] },
  { href: "/versand", label: "Versand", rollen: ["chef", "team"] },
  { href: "/sitzplan", label: "Sitzplan", rollen: ["chef", "team", "gastro", "foyer"] },
  { href: "/foyer", label: "Foyer", rollen: ["chef", "team", "foyer"] },
  { href: "/funktionsheet", label: "Funktionsheet", rollen: ["chef", "team", "gastro"] },
  { href: "/einlassliste", label: "Einlassliste", rollen: ["chef", "team", "gastro", "foyer"] },
  { href: "/parkplaetze", label: "Parkplätze", rollen: ["chef", "team", "foyer"] },
  { href: "/kueche", label: "Küche", rollen: ["chef", "team", "gastro"] },
  { href: "/belegung", label: "Belegung", rollen: ["chef", "team", "gastro"] },
  { href: "/shortcuts", label: "Shortcuts", rollen: ["chef", "team", "foyer"] },
  { href: "/einstellungen/benutzer", label: "Zugänge", rollen: ["chef"] },
];

/** Seiten, die ohne Anmeldung erreichbar sein müssen. */
const OHNE_ANMELDUNG = ["/anmelden", "/ihr-angebot"];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Den Pfad setzt die Middleware als Header, das Layout selbst kennt ihn nicht.
  const pfad = (await headers()).get("x-pfad") ?? "/";
  const offen = OHNE_ANMELDUNG.some((o) => pfad.startsWith(o));
  const benutzer = await angemeldeterBenutzer();

  if (!offen && !benutzer) redirect("/anmelden");

  // Wer eine Seite aufruft, die seine Rolle nicht sehen darf, landet auf der
  // Übersicht statt auf einer Fehlermeldung.
  if (benutzer && !offen && !darfSeite(benutzer.rolle, pfad)) redirect("/");

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

              <nav className="flex flex-1 flex-wrap gap-1 text-sm">
                {NAVIGATION.filter((n) => n.rollen.includes(benutzer.rolle)).map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded px-3 py-1.5 text-leise transition-colors hover:bg-gold-hell hover:text-text"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>

              <div className="flex items-center gap-3 text-xs">
                <Link href="/konto" className="text-leise hover:text-text">
                  {benutzer.name}
                </Link>
                <form action={abmelden}>
                  <button type="submit" className="text-leise underline hover:text-text">
                    abmelden
                  </button>
                </form>
              </div>
            </div>
          </header>
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
      </body>
    </html>
  );
}
