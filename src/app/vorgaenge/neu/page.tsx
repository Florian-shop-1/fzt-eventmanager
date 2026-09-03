import Link from "next/link";
import { anfrageAufnehmen } from "@/lib/db/aktionen";
import { kommendeTermine, terminBeschriftung, type Vorstellungstermin } from "@/lib/ditix/spielplan";

export const metadata = { title: "Anfrage aufnehmen | FZT Eventmanager" };

const QUELLEN = ["Meta-Lead", "Webshop-Formular", "Telefon", "E-Mail", "Empfehlung", "Sonstiges"];

export default async function NeueAnfrageSeite() {
  // Der Spielplan kommt aus dem Ticketshop. Fällt er aus, kann der Termin
  // trotzdem von Hand eingetragen werden, damit niemand blockiert ist.
  let termine: Vorstellungstermin[] = [];
  let spielplanFehler: string | null = null;
  try {
    termine = await kommendeTermine();
  } catch (e) {
    spielplanFehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  return <Formular termine={termine} spielplanFehler={spielplanFehler} />;
}

function Formular({
  termine,
  spielplanFehler,
}: {
  termine: Vorstellungstermin[];
  spielplanFehler: string | null;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Anfrage aufnehmen</h1>
        <p className="mt-1 text-sm text-leise">
          Nur das Nötigste. Alles Weitere lässt sich im Vorgang ergänzen.
        </p>
      </header>

      <form action={anfrageAufnehmen} className="space-y-6">
        <fieldset className="space-y-4 rounded-lg border border-linie bg-flaeche p-5">
          <legend className="px-2 text-sm font-semibold">Wer fragt an</legend>

          <Feld label="Firma oder Name" pflicht>
            <input type="text" name="kundeName" required placeholder="Mustermann GmbH" />
          </Feld>

          <div className="grid gap-4 sm:grid-cols-2">
            <Feld label="Ansprechpartner">
              <input type="text" name="ansprechpartner" placeholder="Frau Schmidt" />
            </Feld>
            <Feld label="Telefon">
              <input type="text" name="telefon" placeholder="0731 123456" />
            </Feld>
          </div>

          <Feld label="E-Mail" hinweis="Wird für den Angebotsversand gebraucht.">
            <input type="text" name="email" placeholder="kontakt@firma.de" />
          </Feld>

          <Feld label="Woher kommt die Anfrage">
            <select name="quelle" defaultValue="Meta-Lead">
              {QUELLEN.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </Feld>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-linie bg-flaeche p-5">
          <legend className="px-2 text-sm font-semibold">Um welchen Abend geht es</legend>

          {termine.length > 0 ? (
            <Feld
              label="Vorstellung"
              hinweis={`${termine.length} Termine aus dem Spielplan. Steht der Termin noch nicht fest, einfach leer lassen.`}
            >
              <select name="ditixEventId" defaultValue="">
                <option value="">Termin steht noch nicht fest</option>
                {termine.map((t) => (
                  <option key={t.ditixEventId} value={t.ditixEventId}>
                    {terminBeschriftung(t)}
                  </option>
                ))}
              </select>
            </Feld>
          ) : (
            <>
              <div className="rounded-md border border-warnung bg-warnung-hell px-3 py-2 text-xs">
                Der Spielplan konnte nicht geladen werden, deshalb bitte den Termin von Hand
                eintragen.
                {spielplanFehler && <div className="mt-1 text-leise">{spielplanFehler}</div>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Feld label="Datum der Vorstellung" pflicht>
                  <input type="date" name="datum" required />
                </Feld>
                <Feld label="Show" pflicht>
                  <input type="text" name="show" required defaultValue="ULMFASSBAR" />
                </Feld>
              </div>
            </>
          )}

          <Feld
            label="Wunschzeitraum, falls kein Termin feststeht"
            hinweis="Wie in der Leadliste, zum Beispiel: in den nächsten 3 Monaten, Dezember 2026, Betriebsfeier Q4."
          >
            <input type="text" name="wunschzeitraum" placeholder="in den nächsten 3 Monaten" />
          </Feld>

          <div className="grid gap-4 sm:grid-cols-2">
            <Feld label="Anzahl Gäste" pflicht hinweis="Beste Schätzung. Lässt sich jederzeit ändern.">
              <input type="number" name="personen" min={1} max={98} defaultValue={10} required />
            </Feld>
            <Feld label="Art der Gruppe">
              <select name="herkunft" defaultValue="firma">
                <option value="firma">Firma</option>
                <option value="privatgruppe">Private Feier</option>
                <option value="telefon">Telefonisch, unklar</option>
              </select>
            </Feld>
          </div>

          <Feld
            label="Angabe aus der Anfrage, falls unklar"
            hinweis='Wie in der Leadliste, zum Beispiel "11-50". Nur zur Erinnerung, gerechnet wird mit der Zahl oben.'
          >
            <input type="text" name="personenUngefaehr" placeholder="11-50" />
          </Feld>
        </fieldset>

        <fieldset className="rounded-lg border border-linie bg-flaeche p-5">
          <legend className="px-2 text-sm font-semibold">Notiz</legend>
          <textarea
            name="notiz"
            rows={3}
            placeholder="Was wurde besprochen? Besondere Wünsche? Budget?"
          />
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md border border-gold bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-dunkel"
          >
            Vorgang anlegen
          </button>
          <Link href="/vorgaenge" className="text-sm text-leise hover:text-text">
            Abbrechen
          </Link>
        </div>
      </form>
    </div>
  );
}

function Feld({
  label,
  children,
  pflicht = false,
  hinweis,
}: {
  label: string;
  children: React.ReactNode;
  pflicht?: boolean;
  hinweis?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-leise">
        {label}
        {pflicht && <span style={{ color: "var(--gold-dunkel)" }}> *</span>}
      </span>
      {children}
      {hinweis && <span className="mt-1 block text-xs text-leise">{hinweis}</span>}
    </label>
  );
}
