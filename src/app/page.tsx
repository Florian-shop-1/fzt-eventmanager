import Link from "next/link";
import { LOGEN, EVENTGALERIE_TISCHE, FOYER_STEHTISCHE, kapazitaet } from "@/lib/domain/venue";

export default function Startseite() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
        <p className="mt-1 text-sm text-leise">
          Internes Programm für Firmenevents, Angebote und die Platzierung in der Magicuisine.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Kachel
          titel="Logenbereich"
          zahl={`${kapazitaet("logen")} Plätze`}
          zeilen={[
            `${LOGEN.length} Logen, durch Vorhänge zusammenlegbar`,
            `Loge 1 mit ${LOGEN[0].plaetze} Plätzen, Loge 2 bis 5 mit je ${LOGEN[1].plaetze}`,
            "Für Gruppen und Firmenevents",
          ]}
        />
        <Kachel
          titel="Eventgalerie"
          zahl={`${kapazitaet("eventgalerie")} Plätze`}
          zeilen={[
            `${EVENTGALERIE_TISCHE.filter((t) => t.plaetze === 2).length} Zweiertische, ` +
              `${EVENTGALERIE_TISCHE.filter((t) => t.plaetze === 4).length} Vierertische`,
            "Frei zu Sechsern und Achtern kombinierbar",
            "Für Buchungen aus dem Webshop",
          ]}
        />
        <Kachel
          titel="Foyer"
          zahl={`${FOYER_STEHTISCHE.anzahl} Stehtische`}
          zeilen={["Für die Pause", "Über den Shop buchbar", "Keine Menüplätze"]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Womit möchtest du arbeiten?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <EinstiegsLink
            href="/vorgaenge"
            titel="Vorgänge"
            beschreibung="Firmenevents von der Anfrage bis zur Zahlung, mit Notizen, Aufgaben und Kundenhistorie."
          />
          <EinstiegsLink
            href="/angebot"
            titel="Angebot erstellen"
            beschreibung="Positionen aus dem Artikelstamm, Alternativen für die Ticketkategorie, Summen mit Steuerausweis."
          />
          <EinstiegsLink
            href="/sitzplan"
            titel="Sitzplan Magicuisine"
            beschreibung="Gruppen eintragen, Platzierung vorschlagen lassen, blockierte Plätze erkennen."
          />
          <EinstiegsLink
            href="/shortcuts"
            titel="Shortcuts"
            beschreibung="Google-Tabellen für Versand, Menüs und Leads an einem Ort."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Ausbaustand</h2>
        <div className="overflow-hidden rounded-lg border border-linie bg-flaeche">
          <Stand fertig titel="Sitzplaner mit Regelwerk">
            Logen und Eventgalerie, Zusammenlegen, Unterbelegung mit Differenzbetrag,
            Ausnahmen mit Begründung.
          </Stand>
          <Stand fertig titel="Angebotsberechnung">
            Positionen, Alternativen für die Ticketkategorie, Rabatte, Getränkepauschalen,
            Exklusivnutzung für blockierte Logenplätze, Summen mit korrektem Steuerausweis.
            Beide Musterangebote werden auf den Cent genau nachgerechnet.
          </Stand>
          <Stand fertig titel="Shortcuts">
            Bisher im eigenen Browser gespeichert, später für alle gemeinsam.
          </Stand>
          <Stand fertig titel="Vorgänge von der Anfrage bis zur Zahlung">
            Anfrage aufnehmen, Status verfolgen, Notizen, Aufgaben mit Frist, Zahlungen,
            Kundenhistorie. Ausnahmen werden mit Begründung und Benutzer protokolliert.
          </Stand>
          <Stand fertig titel="Gemeinsame Datenbank">
            Postgres bei Neon in Frankfurt. Alle Benutzer sehen denselben Stand.
          </Stand>
          <Stand titel="Angebot verschicken und Öffnungen sehen">
            Als Entwurf in Outlook ablegen, persönlicher Link für den Kunden, sehen wann er
            öffnet und annimmt.
          </Stand>
          <Stand titel="lexoffice">
            Kunde und Angebot anlegen, Rechnung und Zahlungsstatus zurücklesen.
          </Stand>
          <Stand titel="Küchen- und Serviceblatt">
            Menüzahlen je Variante, Unverträglichkeiten, Tischplan zum Ausdrucken.
          </Stand>
          <Stand titel="Ditix">
            Firmentickets automatisch einbuchen, sobald der Zugang vom Entwicklerteam da ist.
          </Stand>
        </div>
      </section>
    </div>
  );
}

function Kachel({ titel, zahl, zeilen }: { titel: string; zahl: string; zeilen: string[] }) {
  return (
    <div className="rounded-lg border border-linie bg-flaeche p-5">
      <div className="text-sm text-leise">{titel}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{zahl}</div>
      <ul className="mt-3 space-y-1 text-xs text-leise">
        {zeilen.map((z, i) => (
          <li key={i}>{z}</li>
        ))}
      </ul>
    </div>
  );
}

function EinstiegsLink({
  href,
  titel,
  beschreibung,
}: {
  href: string;
  titel: string;
  beschreibung: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-linie bg-flaeche p-5 transition-colors hover:border-gold hover:bg-gold-hell"
    >
      <div className="font-medium">{titel}</div>
      <div className="mt-1 text-sm text-leise">{beschreibung}</div>
    </Link>
  );
}

function Stand({
  titel,
  children,
  fertig = false,
}: {
  titel: string;
  children: React.ReactNode;
  fertig?: boolean;
}) {
  return (
    <div className="flex gap-3 border-b border-linie px-5 py-3 last:border-0">
      <span
        className="mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium"
        style={{
          background: fertig ? "var(--gut-hell)" : "var(--hintergrund)",
          color: fertig ? "var(--gut)" : "var(--text-leise)",
        }}
      >
        {fertig ? "steht" : "geplant"}
      </span>
      <div>
        <div className="text-sm font-medium">{titel}</div>
        <div className="text-xs text-leise">{children}</div>
      </div>
    </div>
  );
}
