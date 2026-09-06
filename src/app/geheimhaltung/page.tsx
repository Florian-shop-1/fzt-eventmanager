import { angemeldeterBenutzer, darfBenutzerVerwalten } from "@/lib/auth/sitzung";
import {
  alleVereinbarungen,
  angabenSpeichern,
  meineVereinbarung,
  onlineUnterschreiben,
  unterschriftAbhaken,
  type Vereinbarung,
} from "@/lib/db/personal";
import {
  ABSCHNITTE,
  ANBIETER,
  PRAEAMBEL,
  TEXTSTAND_DATUM,
  anschrift,
  vollstaendig,
  type Vertragspartner,
} from "@/lib/personal/geheimhaltung";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Logo } from "@/components/Logo";
import { Unterschriftsfeld } from "@/components/Unterschriftsfeld";
import { zeitpunkt } from "@/lib/zeit";

export const metadata = { title: "Geheimhaltung | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Geheimhaltungsvereinbarung: ausfüllen, lesen, unterschreiben.
 *
 * In der Zauberkunst ist Geheimhaltung keine Formalie. Wer weiss, wie
 * ein Trick funktioniert, kann ihn verraten, und dann ist er wertlos.
 * Deshalb muss jeder, der im Haus arbeitet, unterschrieben haben.
 *
 * Zwei Wege stehen offen. Auf Papier: drucken, unterschreiben, abgeben,
 * das Büro hakt ab. Oder am Bildschirm: Namenszug zeichnen, fertig. Der
 * zweite ist bequemer, der erste ist im Streitfall der unstrittigere.
 */
export default async function GeheimhaltungSeite() {
  const benutzer = await angemeldeterBenutzer();
  const meine = await meineVereinbarung();
  const chef = benutzer ? darfBenutzerVerwalten(benutzer.rolle) : false;
  const alle = chef ? await alleVereinbarungen() : [];

  const fertig = meine ? vollstaendig(meine) : false;
  const unterschrieben = Boolean(meine?.unterschriebenAm);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Geheimhaltungsvereinbarung</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Wer im Haus arbeitet, muss sie unterschrieben haben. Trag deine Angaben ein und
            unterschreib entweder gleich hier oder auf Papier.
          </p>
        </div>
        {fertig && <DruckKnopf text="Vereinbarung drucken" hinweis="zum Unterschreiben auf Papier" />}
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
              disabled={unterschrieben}
              className="rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Angaben sichern
            </button>
            {meine && (
              <span className="ml-3 text-xs text-leise">
                {unterschrieben
                  ? "Nach der Unterschrift nicht mehr änderbar."
                  : `Zuletzt geändert ${zeitpunkt(new Date(meine.geaendertAm))}`}
              </span>
            )}
          </div>
        </form>
      </section>

      {meine && unterschrieben && <Bestaetigung v={meine} />}

      {!fertig && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-8 text-center text-sm text-leise print:hidden">
          Sobald alle Felder ausgefüllt sind, kannst du lesen und unterschreiben.
        </p>
      )}

      {fertig && meine && !unterschrieben && <Unterschreiben partner={meine} />}

      {chef && <Uebersicht vereinbarungen={alle} />}

      {fertig && meine && <Vertrag partner={meine} unterschrift={meine} />}
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

/** Der Stand, wenn schon unterschrieben ist. */
function Bestaetigung({ v }: { v: Vereinbarung }) {
  return (
    <section
      className="rounded-lg border px-4 py-3 text-sm print:hidden"
      style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
    >
      <strong>Unterschrieben.</strong>{" "}
      {v.art === "online"
        ? `Am Bildschirm gezeichnet am ${zeitpunkt(new Date(v.unterschriebenAm!))}.`
        : `Auf Papier, bestätigt von ${v.unterschriebenVon} am ${zeitpunkt(new Date(v.unterschriebenAm!))}.`}
      {v.bild && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.bild} alt="Dein Namenszug" className="mt-2 h-20 bg-white" />
      )}
      {v.art === "online" && (
        <p className="mt-2 text-xs text-leise">
          Festgehalten: Zeitpunkt, Adresse {v.ip}, Gerät, und die Fassung des Vertragstextes vom{" "}
          {TEXTSTAND_DATUM} (Kennung {v.textstand}).
        </p>
      )}
    </section>
  );
}

/**
 * Lesen und online unterschreiben.
 *
 * Der Text steht vollständig darüber, nicht hinter einem Link. Wer
 * unterschreibt, soll gelesen haben können, was er unterschreibt, und
 * das gehört auf dieselbe Seite.
 */
function Unterschreiben({ partner }: { partner: Vertragspartner }) {
  return (
    <section className="rounded-lg border border-linie bg-flaeche p-5 print:hidden">
      <h2 className="font-semibold">Lesen und unterschreiben</h2>
      <p className="mt-1 max-w-prose text-sm text-leise">
        Du kannst hier gleich unterschreiben. Wenn dir Papier lieber ist, druck die Vereinbarung
        oben aus, unterschreib sie und gib sie im Büro ab.
      </p>

      <div className="mt-4 max-h-96 overflow-y-auto rounded-md border border-linie bg-white p-4">
        <Vertragstext partner={partner} />
      </div>

      <form action={onlineUnterschreiben} className="mt-5">
        <div className="max-w-md">
          <div className="text-sm text-leise">Dein Namenszug</div>
          <div className="mt-1">
            <Unterschriftsfeld name="unterschrift" />
          </div>
        </div>

        <p className="mt-4 max-w-prose text-xs text-leise">
          Mit dem Unterschreiben bestätigst du, den Text gelesen zu haben und ihm zuzustimmen.
          Festgehalten werden dein Namenszug, der Zeitpunkt, deine Internetadresse, dein Gerät und
          die Fassung des Textes vom {TEXTSTAND_DATUM}.
        </p>

        <button
          type="submit"
          className="mt-3 rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
        >
          Verbindlich unterschreiben
        </button>
      </form>
    </section>
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
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
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
                        {v.art === "online" ? "online" : "auf Papier"},{" "}
                        {zeitpunkt(new Date(v.unterschriebenAm))}
                      </span>
                    ) : (
                      <span style={{ color: "var(--warnung)" }}>fehlt noch</span>
                    )}
                  </td>
                  <td className="text-right">
                    {v.art === "online" ? (
                      <span className="text-xs text-leise">selbst unterschrieben</span>
                    ) : (
                      <form
                        action={unterschriftAbhaken.bind(null, v.id, Boolean(v.unterschriebenAm))}
                      >
                        <button
                          type="submit"
                          className="rounded-md border border-linie px-3 py-1 text-xs hover:bg-gold-hell"
                        >
                          {v.unterschriebenAm ? "zurücknehmen" : "liegt vor"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Der Vertragstext selbst, ohne Kopf und ohne Unterschriften. */
function Vertragstext({ partner }: { partner: Vertragspartner }) {
  return (
    <>
      <section className="grid gap-6 text-sm sm:grid-cols-2">
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
    </>
  );
}

/**
 * Die Vereinbarung, wie sie aufs Papier kommt.
 *
 * Am Bildschirm unsichtbar, dort steht der Text schon im Lesekasten.
 * Wurde online unterschrieben, steht der Namenszug auf dem Ausdruck da,
 * wo sonst die Linie wäre, und darunter das Protokoll.
 */
function Vertrag({
  partner,
  unterschrift,
}: {
  partner: Vertragspartner;
  unterschrift: Vereinbarung;
}) {
  const online = unterschrift.art === "online" && unterschrift.bild;

  return (
    <article className="hidden print:block">
      <header className="mb-6 flex items-start justify-between gap-6">
        <h2 className="text-xl font-semibold tracking-tight">
          Geheimhaltungsvereinbarung / Vertragsstrafe
        </h2>
        <Logo hoehe={40} />
      </header>

      <Vertragstext partner={partner} />

      {/*
        Die Unterschriften bleiben zusammen auf einer Seite. Ein Vertrag,
        bei dem die Unterschriftszeile allein auf dem letzten Blatt steht,
        sieht aus, als fehle etwas.
      */}
      <section className="mt-10 grid grid-cols-2 gap-10 text-sm" style={{ breakInside: "avoid" }}>
        <Unterschrift wer={ANBIETER.name} />
        <Unterschrift
          wer={partner.name}
          bild={online ? unterschrift.bild : null}
          am={online ? unterschrift.unterschriebenAm : null}
        />
      </section>

      {online && (
        <p className="mt-6 text-xs leading-relaxed text-leise" style={{ breakInside: "avoid" }}>
          Elektronisch unterschrieben am {zeitpunkt(new Date(unterschrift.unterschriebenAm!))} durch{" "}
          {partner.name}. Internetadresse {unterschrift.ip}. Textfassung vom {TEXTSTAND_DATUM},
          Kennung {unterschrift.textstand}. Gerät: {unterschrift.geraet}.
        </p>
      )}
    </article>
  );
}

function Unterschrift({
  wer,
  bild,
  am,
}: {
  wer: string;
  bild?: string | null;
  am?: string | null;
}) {
  return (
    <div>
      <div>Ort: ______________________</div>
      <div className="mt-3">
        Datum: {am ? zeitpunkt(new Date(am)).split(",")[0] : "____________________"}
      </div>
      <div className="mt-2 h-16">
        {bild && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bild} alt="" className="h-16" />
        )}
      </div>
      <div className="border-t border-text pt-1">{wer}</div>
    </div>
  );
}
