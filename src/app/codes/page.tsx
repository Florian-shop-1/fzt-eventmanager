import {
  aktionAnlegen,
  codesEinfuegen,
  codesVerschicken,
  holeAktionen,
  letzteVergaben,
  type Aktion,
} from "@/lib/db/codes";
import { Absendeknopf } from "@/components/Absendeknopf";
import { zeitpunkt } from "@/lib/zeit";

export const metadata = { title: "Codes | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Aktionscodes vergeben und verschicken.
 *
 * In Ditix liegen mehrere Vorräte nebeneinander: Freikarten für alle
 * Tickets, Freikarten nur für Kindertickets, VIP-Parkplatz kostenlos,
 * Souvenirglas kostenlos. Sie mussten vorsorglich in grosser Zahl
 * angelegt werden, weil neu erstellte Codes in Ditix bei jeder einzelnen
 * Show freigeschaltet werden müssen.
 *
 * Hier werden sie ausgegeben: Empfänger eintragen, aussuchen was er
 * bekommt, abschicken. Der Eventmanager nimmt die nächsten freien Codes,
 * schickt sie von tickets@ hinaus und merkt sich, wer wann was bekommen
 * hat und warum.
 */
export default async function CodesSeite({
  searchParams,
}: {
  searchParams: Promise<{
    verschickt?: string;
    fehler?: string;
    eingefuegt?: string;
    meldung?: string;
  }>;
}) {
  const { verschickt, fehler, eingefuegt, meldung } = await searchParams;

  const aktionen = await holeAktionen();
  const vergaben = await letzteVergaben();
  const einsatzbereit = aktionen.filter((a) => a.aktiv && a.frei > 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Codes</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Freikarten, Kinderfreikarten, VIP-Parkplätze, Souvenirgläser. Die Codes kommen aus
          Ditix, hier werden sie vergeben und verschickt, und es bleibt festgehalten, wer wann was
          bekommen hat.
        </p>
      </header>

      {verschickt && (
        <Kasten farbe="gut">
          <strong>Ist raus.</strong> Die Codes sind an {verschickt} unterwegs, von
          tickets@florianzimmer.com. Sie stehen unten in der Liste und sind aus dem Vorrat
          genommen.
        </Kasten>
      )}
      {eingefuegt && (
        <Kasten farbe="gut">
          <strong>{eingefuegt} Codes gelesen.</strong> Schon vorhandene wurden übergangen, in den
          Zahlen unten siehst du, was tatsächlich dazugekommen ist.
        </Kasten>
      )}
      {(fehler || meldung) && (
        <Kasten farbe="blocker">
          <strong>Das hat nicht geklappt.</strong>
          <div className="mt-1 text-leise">{fehler ?? meldung}</div>
        </Kasten>
      )}

      {aktionen.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-8 text-center text-sm text-leise">
          Noch kein Vorrat angelegt. Fang unten mit einer Aktion an, zum Beispiel „Freikarten für
          alle Tickets“, und füg die Codes aus Ditix ein.
        </p>
      ) : (
        <Verschicken aktionen={einsatzbereit} />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Vorräte</h2>
        {aktionen.map((a) => (
          <Vorrat key={a.id} aktion={a} />
        ))}
      </section>

      <details className="rounded-lg border border-linie bg-flaeche p-5">
        <summary className="cursor-pointer font-semibold">Neue Aktion anlegen</summary>
        <p className="mt-1 text-sm text-leise">
          Eine Aktion je Vorrat in Ditix, am besten mit demselben Namen. Dann findet man sich in
          beiden Programmen zurecht.
        </p>
        <form action={aktionAnlegen} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-leise">Name</span>
            <input
              type="text"
              name="name"
              placeholder="Freikarten-Codes für alle Tickets"
              className="mt-1 w-full rounded-md border border-linie px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-leise">Gültig bis</span>
            <input
              type="text"
              name="gueltigBis"
              placeholder="03.07.2033"
              className="mt-1 w-full rounded-md border border-linie px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-leise">Was der Empfänger davon hat, in einem Satz</span>
            <input
              type="text"
              name="beschreibung"
              placeholder="Eine Freikarte für eine Vorstellung deiner Wahl"
              className="mt-1 w-full rounded-md border border-linie px-3 py-2"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md border border-linie px-4 py-2 text-sm hover:bg-gold-hell"
            >
              Aktion anlegen
            </button>
          </div>
        </form>
      </details>

      <Verlauf vergaben={vergaben} />
    </div>
  );
}

function Kasten({ farbe, children }: { farbe: "gut" | "blocker"; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{
        borderColor: `var(--${farbe})`,
        background: `var(--${farbe}-hell)`,
      }}
    >
      {children}
    </div>
  );
}

/** Ein Vorrat mit seinem Bestand und dem Feld zum Nachfüllen. */
function Vorrat({ aktion }: { aktion: Aktion }) {
  const knapp = aktion.frei > 0 && aktion.frei < 20;

  return (
    <article className="rounded-lg border border-linie bg-flaeche p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-medium">{aktion.name}</h3>
          {aktion.beschreibung && (
            <p className="text-sm text-leise">{aktion.beschreibung}</p>
          )}
        </div>
        <div className="text-right">
          <div
            className="text-xl font-semibold tabular-nums"
            style={{ color: aktion.frei === 0 ? "var(--blocker)" : knapp ? "var(--warnung)" : undefined }}
          >
            {aktion.frei}
          </div>
          <div className="text-xs text-leise">
            von {aktion.gesamt} frei
            {aktion.gueltigBis && ` · bis ${aktion.gueltigBis}`}
          </div>
        </div>
      </div>

      {aktion.frei === 0 && aktion.gesamt > 0 && (
        <p className="mt-2 text-sm" style={{ color: "var(--blocker)" }}>
          Aufgebraucht. Leg in Ditix neue Codes an und füg sie hier ein.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-leise">Codes einfügen</summary>
        <form action={codesEinfuegen.bind(null, aktion.id)} className="mt-2">
          <textarea
            name="codes"
            rows={5}
            placeholder="Codes aus Ditix hier hineinkopieren, in beliebiger Form"
            className="w-full rounded-md border border-linie px-3 py-2 font-mono text-xs"
          />
          <p className="mt-1 text-xs text-leise">
            Untereinander, nebeneinander, mit Kommas, egal. Doppelte werden übergangen.
          </p>
          <button
            type="submit"
            className="mt-2 rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
          >
            Einfügen
          </button>
        </form>
      </details>
    </article>
  );
}

/** Empfänger eintragen, aussuchen, abschicken. */
function Verschicken({ aktionen }: { aktionen: Aktion[] }) {
  if (aktionen.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-linie px-6 py-8 text-center text-sm text-leise">
        Alle Vorräte sind leer. Füg unten Codes ein, dann lässt sich wieder etwas verschicken.
      </p>
    );
  }

  const einleitung = [
    "Hallo,",
    "",
    "wir haben ein kleines Geschenk für dich. Hier ist dein Code:",
  ].join("\n");

  return (
    <section className="rounded-lg border border-gold bg-gold-hell/40 p-5">
      <h2 className="font-semibold">Codes verschicken</h2>
      <p className="mt-1 max-w-prose text-sm text-leise">
        Geht von tickets@florianzimmer.com hinaus und steht danach dort unter Gesendete Elemente.
        Die Codes werden aus dem Vorrat genommen, sobald die Mail draußen ist.
      </p>

      <form action={codesVerschicken} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-leise">Name des Empfängers</span>
            <input
              type="text"
              name="empfaenger"
              className="mt-1 w-full rounded-md border border-linie px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-leise">Mailadresse</span>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full rounded-md border border-linie px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-leise">Anlass, fürs Protokoll</span>
            <input
              type="text"
              name="anlass"
              placeholder="Beschwerde, Presse, Sponsoring, Gewinnspiel"
              className="mt-1 w-full rounded-md border border-linie px-3 py-2"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm text-leise">Was bekommt er?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {aktionen.map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-3 rounded-md border border-linie bg-flaeche px-3 py-2 text-sm"
              >
                <input
                  type="number"
                  name={`anzahl:${a.id}`}
                  min={0}
                  max={Math.min(20, a.frei)}
                  defaultValue={0}
                  className="w-16 rounded-md border border-linie px-2 py-1 tabular-nums"
                />
                <span className="flex-1">
                  {a.name}
                  <span className="block text-xs text-leise">{a.frei} frei</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="text-leise">Betreff</span>
          <input
            type="text"
            name="betreff"
            defaultValue="Ein Geschenk vom Florian Zimmer Theater"
            className="mt-1 w-full rounded-md border border-linie px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-leise">Einleitung</span>
          <textarea
            name="einleitung"
            rows={5}
            defaultValue={einleitung}
            className="mt-1 w-full rounded-md border border-linie px-3 py-2"
          />
          <span className="mt-1 block text-xs text-leise">
            Die Codes werden darunter angehängt, nach Aktion sortiert.
          </span>
        </label>

        <Absendeknopf text="Codes verschicken" laeuftText="Wird verschickt..." />
      </form>
    </section>
  );
}

/** Wer hat wann was bekommen. */
function Verlauf({ vergaben }: { vergaben: Array<Awaited<ReturnType<typeof letzteVergaben>>[number]> }) {
  if (vergaben.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Zuletzt vergeben</h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-linie bg-flaeche">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linie text-left text-leise">
              <th className="px-4 py-2">Wann</th>
              <th>Was</th>
              <th>Code</th>
              <th>An</th>
              <th>Anlass</th>
              <th>Von</th>
            </tr>
          </thead>
          <tbody>
            {vergaben.map((v) => (
              <tr key={v.code} className="border-b border-linie last:border-0">
                <td className="px-4 py-2 whitespace-nowrap text-leise">
                  {zeitpunkt(new Date(v.vergebenAm))}
                </td>
                <td>{v.aktion}</td>
                <td className="font-mono text-xs">{v.code}</td>
                <td>
                  {v.empfaenger ?? "—"}
                  <span className="block text-xs text-leise">{v.empfaengerEmail}</span>
                </td>
                <td className="text-leise">{v.anlass ?? "—"}</td>
                <td className="text-leise">{v.vergebenVon ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
