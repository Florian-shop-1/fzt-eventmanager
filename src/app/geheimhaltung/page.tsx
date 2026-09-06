import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import {
  alleVereinbarungen,
  angabenSpeichern,
  meineVereinbarung,
  unterschriftAbhaken,
  type Vereinbarung,
} from "@/lib/db/personal";
import {
  ABSCHNITTE,
  ANBIETER,
  PRAEAMBEL,
  anschrift,
  vollstaendig,
  type Vertragspartner,
} from "@/lib/personal/geheimhaltung";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Logo } from "@/components/Logo";
import { zeitpunkt } from "@/lib/zeit";

export const metadata = { title: "Geheimhaltung | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Geheimhaltungsvereinbarung, ausfüllen und drucken.
 *
 * In der Zauberkunst ist Geheimhaltung keine Formalie: Wer weiss, wie
 * ein Trick funktioniert, kann ihn verraten, und dann ist er wertlos.
 * Deshalb muss jeder, der im Haus arbeitet, unterschrieben haben.
 *
 * Bisher lag für jede Person eine eigene Word-Datei auf SharePoint, in
 * die Name, Geburtsdatum und Anschrift von Hand eingesetzt wurden. Wer
 * unterschrieben hatte und wer nicht, wusste niemand ohne nachzusehen.
 *
 * Hier trägt jeder seine Angaben selbst ein, das Blatt entsteht daraus,
 * und der Inhaber sieht auf einen Blick, wer noch fehlt.
 */
export default async function GeheimhaltungSeite() {
  const benutzer = await angemeldeterBenutzer();
  const meine = await meineVereinbarung();
  const chef = benutzer ? darfBenutzerVerwalten(benutzer.rolle) : false;
  const alle = chef ? await alleVereinbarungen() : [];

  const fertig = meine ? vollstaendig(meine) : false;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Geheimhaltungsvereinbarung</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Wer im Haus arbeitet, muss sie unterschrieben haben. Trag deine Angaben ein, druck das
            Blatt und gib es unterschrieben ab.
          </p>
        </div>
        {fertig && <DruckKnopf text="Vereinbarung drucken" hinweis="zwei Seiten, A4" />}
      </header>

      <section className="rounded-lg border border-linie bg-flaeche p-5 print:hidden">
        <h2 className="font-semibold">Deine Angaben</h2>
        <p className="mt-1 text-sm text-leise">
          Sie stehen im Kopf der Vereinbarung. Geburtsdatum und Anschrift gehören dazu, weil der
          Vertrag sonst nicht eindeutig einer Person zuzuordnen ist.
        </p>

        <form action={angabenSpeichern} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Feld name="name" beschriftung="Vor- und Nachname" wert={meine?.name ?? benutzer?.name} />
          <Feld
            name="geburtsdatum"
            beschriftung="Geburtsdatum"
            wert={meine?.geburtsdatum}
            hinweis="zum Beispiel 12.09.1988"
          />
          <Feld name="strasse" beschriftung="Straße und Hausnummer" wert={meine?.strasse} />
          <div className="grid grid-cols-3 gap-3">
            <Feld name="plz" beschriftung="PLZ" wert={meine?.plz} />
            <div className="col-span-2">
              <Feld name="ort" beschriftung="Ort" wert={meine?.ort} />
            </div>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
            >
              Angaben sichern
            </button>
            {meine && (
              <span className="ml-3 text-xs text-leise">
                Zuletzt geändert {zeitpunkt(new Date(meine.geaendertAm))}
              </span>
            )}
          </div>
        </form>
      </section>

      {meine && (
        <section
          className="rounded-lg border px-4 py-3 text-sm print:hidden"
          style={{
            borderColor: meine.unterschriebenAm ? "var(--gut)" : "var(--warnung)",
            background: meine.unterschriebenAm ? "var(--gut-hell)" : "var(--warnung-hell)",
          }}
        >
          {meine.unterschriebenAm ? (
            <>
              <strong>Unterschrieben.</strong> Bestätigt von {meine.unterschriebenVon} am{" "}
              {zeitpunkt(new Date(meine.unterschriebenAm))}.
            </>
          ) : (
            <>
              <strong>Noch nicht unterschrieben.</strong> Druck das Blatt, unterschreib es und gib
              es im Büro ab. Sobald es vorliegt, wird es hier abgehakt.
            </>
          )}
        </section>
      )}

      {!fertig && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-8 text-center text-sm text-leise print:hidden">
          Sobald alle Felder ausgefüllt sind, lässt sich die Vereinbarung drucken.
        </p>
      )}

      {chef && <Uebersicht vereinbarungen={alle} />}

      {fertig && meine && <Vertrag partner={meine} />}
    </div>
  );
}

function Feld({
  name,
  beschriftung,
  wert,
  hinweis,
}: {
  name: string;
  beschriftung: string;
  wert?: string | null;
  hinweis?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-leise">{beschriftung}</span>
      <input
        type="text"
        name={name}
        defaultValue={wert ?? ""}
        className="mt-1 w-full rounded-md border border-linie px-3 py-2"
      />
      {hinweis && <span className="mt-1 block text-xs text-leise">{hinweis}</span>}
    </label>
  );
}

/** Wer hat unterschrieben, wer fehlt noch. Nur für den Inhaber. */
function Uebersicht({ vereinbarungen }: { vereinbarungen: Vereinbarung[] }) {
  const offen = vereinbarungen.filter((v) => !v.unterschriebenAm);

  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5 print:hidden">
      <h2 className="font-semibold">Stand im Team</h2>
      <p className="mt-1 text-sm text-leise">
        {vereinbarungen.length === 0
          ? "Noch hat niemand Angaben hinterlegt."
          : `${vereinbarungen.length - offen.length} von ${vereinbarungen.length} haben unterschrieben.`}
      </p>

      {vereinbarungen.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-linie text-left text-leise">
              <th className="py-2">Name</th>
              <th>Geburtsdatum</th>
              <th>Anschrift</th>
              <th>Stand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vereinbarungen.map((v) => (
              <tr key={v.id} className="border-b border-linie">
                <td className="py-2">{v.name}</td>
                <td>{v.geburtsdatum}</td>
                <td className="text-leise">{anschrift(v)}</td>
                <td>
                  {v.unterschriebenAm ? (
                    <span style={{ color: "var(--gut)" }}>
                      unterschrieben, {zeitpunkt(new Date(v.unterschriebenAm))}
                    </span>
                  ) : (
                    <span style={{ color: "var(--warnung)" }}>fehlt noch</span>
                  )}
                </td>
                <td className="text-right">
                  <form action={unterschriftAbhaken.bind(null, v.id, Boolean(v.unterschriebenAm))}>
                    <button
                      type="submit"
                      className="rounded-md border border-linie px-3 py-1 text-xs hover:bg-gold-hell"
                    >
                      {v.unterschriebenAm ? "zurücknehmen" : "liegt vor"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Die Vereinbarung, wie sie aufs Papier kommt.
 *
 * Am Bildschirm unsichtbar: Sie ist zum Unterschreiben da, nicht zum
 * Lesen im Browser. Wer sie vorher lesen will, druckt in eine PDF.
 */
function Vertrag({ partner }: { partner: Vertragspartner }) {
  return (
    <article className="hidden print:block">
      <header className="mb-6 flex items-start justify-between gap-6">
        <h2 className="text-xl font-semibold tracking-tight">
          Geheimhaltungsvereinbarung / Vertragsstrafe
        </h2>
        <Logo hoehe={40} />
      </header>

      <section className="grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="text-leise">zwischen</div>
          <div className="mt-1 font-medium">{ANBIETER.name}</div>
          <div>{ANBIETER.strasse}</div>
          <div>{ANBIETER.ort}</div>
          <div className="mt-1 text-leise">– nachstehend „Florian Zimmer“ genannt –</div>
        </div>
        <div>
          <div className="text-leise">und</div>
          <div className="mt-1 font-medium">{partner.name}</div>
          <div>geb. {partner.geburtsdatum}</div>
          <div>{anschrift(partner)}</div>
          <div className="mt-1 text-leise">– nachstehend „Vertragspartner“ genannt –</div>
        </div>
      </section>

      <h3 className="mt-6 font-semibold">Präambel</h3>
      {PRAEAMBEL.map((p) => (
        <p key={p.slice(0, 40)} className="mt-2 text-sm leading-relaxed">
          {p}
        </p>
      ))}

      {ABSCHNITTE.map((a) => (
        <section key={a.nummer} className="mt-5">
          <h3 className="font-semibold">
            {a.nummer} {a.titel}
          </h3>
          {a.absaetze.map((p) => (
            <p key={p.slice(0, 40)} className="mt-2 text-sm leading-relaxed">
              {p}
            </p>
          ))}
          {a.aufzaehlung && (
            <ul className="mt-2 list-disc pl-6 text-sm leading-relaxed">
              {a.aufzaehlung.map((z) => (
                <li key={z}>{z}</li>
              ))}
            </ul>
          )}
          {a.danach?.map((p) => (
            <p key={p.slice(0, 40)} className="mt-2 text-sm leading-relaxed">
              {p}
            </p>
          ))}
        </section>
      ))}

      {/*
        Die Unterschriften bleiben zusammen auf einer Seite. Ein Vertrag,
        bei dem die Unterschriftszeile allein auf dem letzten Blatt steht,
        sieht aus, als fehle etwas.
      */}
      <section className="mt-10 grid grid-cols-2 gap-10 text-sm" style={{ breakInside: "avoid" }}>
        <Unterschrift wer={ANBIETER.name} />
        <Unterschrift wer={partner.name} />
      </section>
    </article>
  );
}

function Unterschrift({ wer }: { wer: string }) {
  return (
    <div>
      <div className="flex gap-6">
        <span>Ort: ______________________</span>
      </div>
      <div className="mt-3">Datum: ____________________</div>
      <div className="mt-10 border-t border-text pt-1">{wer}</div>
    </div>
  );
}
