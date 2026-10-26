import { db } from "@/lib/db/client";
import { nachFamilienname } from "@/lib/domain/namen";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import {
  abmeldungAnsLohnbuero,
  artSetzen,
  benutzerUmschalten,
  personalbogenAnfordern,
} from "@/lib/auth/aktionen";
import { whatsappFreigabeUmschalten } from "@/lib/whatsapp/aktionen";
import { BenutzerAnlegen } from "@/components/BenutzerAnlegen";
import { PasswortZuruecksetzen } from "@/components/PasswortZuruecksetzen";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { BEREICHE, einladungsLink, offeneEinladungen } from "@/lib/dienstplan/einladung";
import { LinkKopieren } from "@/components/LinkKopieren";
import { dienstleister } from "@/lib/stempel/dienstleister";
import { linkVonFirma } from "@/lib/stempel/putzlink";

export const metadata = { title: "Zugänge | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const ROLLE_KURZ: Record<string, string> = {
  chef: "Geschäftsführung",
  team: "Team",
  gastro: "Gastronomie",
  foyer: "Foyer",
  showteam: "Showteam",
  kiosk: "Food-Kiosk",
  agentur: "Werbeagentur",
  buchhaltung: "Buchhaltung",
  reinigung: "Reinigungsfirma",
  nebenjob: "Nebenjob",
  content: "Content Creator",
};

interface Zeile {
  id: string;
  name: string;
  email: string;
  rolle: string;
  aktiv: boolean;
  letzter_login: string | null;
  muss_passwort_aendern: boolean;
  startpasswort: string | null;
  whatsapp: boolean;
  art: "intern" | "extern" | null;
  personalbogen_am: string | null;
  benutzername: string | null;
  ausgeschieden_am: string | null;
  ausscheiden_grund: string;
  abgemeldet_am: string | null;
}

export default async function BenutzerSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; fehler?: string }>;
}) {
  const ich = await angemeldeterBenutzer();
  if (!ich) return null;
  const { meldung, fehler } = await searchParams;

  const benutzer = (await db()`
    select id, name, email, rolle, aktiv, letzter_login, muss_passwort_aendern,
           startpasswort, whatsapp, art, personalbogen_am, benutzername,
           ausgeschieden_am, ausscheiden_grund, abgemeldet_am
      from benutzer order by rolle
  `) as Zeile[];
  /*
    Nach Familienname, ohne Umweg ueber die Rolle.

    Vorher kam zuerst die Rolle, und damit stand die Liste in einer
    Reihenfolge, die beim Suchen nichts hilft: "bitte immer wenn mehre
    sind, in reihenfolge nach nachname" (Florian, 01.10.2026).
  */
  benutzer.sort(nachFamilienname);
  const offeneLinks = await offeneEinladungen();

  /*
    Der Stempellink der Dienstleister, die nach Stunden abrechnen.

    Er wird nicht hier erzeugt, sondern auf der Seite "Reinigung", und
    nur dort laesst er sich auch erneuern. Hier steht er, damit man ihn
    findet, wenn man nach einem Link sucht.
  */
  const firmen = await dienstleister().catch(() => []);
  const putzlinks = (
    await Promise.all(
      firmen.map(async (f) => ({
        id: f.id,
        name: f.name,
        schluessel: await linkVonFirma(f.id).catch(() => null),
      })),
    )
  )
    .filter((f): f is { id: string; name: string; schluessel: string } => Boolean(f.schluessel))
    .map((f) => ({
      ...f,
      link: `${process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de"}/putzen/${f.schluessel}`,
    }));

  /*
    Ehemalige stehen im Archiv, nicht in der Liste.

    "nimm den aus der anzeige raus.. ich will den nicht sehen, oder
    erst wenn man irgendwo auf archiv klickt" (Florian, 26.10.2026).
    Wer ausgeschieden ist, gehoert nicht mehr in die taegliche
    Uebersicht: Dort stehen die Leute, die arbeiten.

    Ein bloss gesperrter Zugang bleibt sichtbar. Gesperrt heisst
    'gerade nicht', ausgeschieden heisst 'nicht mehr', und nur das
    Zweite gehoert weg.
  */
  const ehemalige = benutzer.filter((b) => b.ausgeschieden_am);
  const aktuelle = benutzer.filter((b) => !b.ausgeschieden_am);
  // Was im Archiv noch offen ist, darf nicht mit verschwinden.
  const offeneAbmeldung = ehemalige.filter((b) => !b.abgemeldet_am && b.art !== "extern").length;

  /** Dieselben Zeilen fuer beide Tabellen: die Liste und das Archiv. */
  const reihen = (liste: Zeile[]) =>
    liste.map((b) => (
              <tr key={b.id} className="border-b border-linie last:border-0">
                <td className="px-4 py-3 font-medium">
                  {b.name}
                  {b.id === ich.id && <span className="ml-2 text-xs text-leise">(du)</span>}
                </td>
                {/*
                  Geteilte Zugaenge melden sich mit einem Namen an, nicht
                  mit einer Mailadresse. In der Spalte stand trotzdem die
                  interne Adresse, und damit stand dort nicht, was man zum
                  Anmelden braucht (Florian, 07.10.2026: "sehe den zugang
                  noch nicht").
                */}
                <td className="px-4 py-3 text-leise">
                  {b.benutzername ? (
                    <>
                      <span className="font-medium text-text">{b.benutzername}</span>
                      <span className="ml-2 text-xs">Anmeldename</span>
                    </>
                  ) : (
                    b.email
                  )}
                </td>
                <td className="px-4 py-3">{ROLLE_KURZ[b.rolle] ?? b.rolle}</td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex gap-1">
                    {(["intern", "extern"] as const).map((a) => (
                      <form key={a} action={artSetzen.bind(null, b.id, a)}>
                        <button
                          type="submit"
                          className="rounded px-2 py-0.5"
                          style={{
                            background: b.art === a ? "var(--gold-hell)" : "transparent",
                            color: b.art === a ? "var(--gold-dunkel)" : "var(--text-leise)",
                            fontWeight: b.art === a ? 600 : 400,
                          }}
                        >
                          {a}
                        </button>
                      </form>
                    ))}
                  </div>
                  {b.art === "intern" && (
                    <div className="mt-1 text-leise">
                      {b.personalbogen_am ? (
                        <>
                          Personalbogen {new Date(b.personalbogen_am).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                          <form action={personalbogenAnfordern.bind(null, b.id)} className="inline">
                            <button type="submit" className="ml-1 underline hover:text-text">neu anfordern</button>
                          </form>
                        </>
                      ) : (
                        <span style={{ color: "var(--warnung)" }}>Personalbogen fehlt</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {/*
                    Pro Person statt pro Rolle: Sarah ist Foyer und liest die
                    Kundenchats trotzdem mit. Siehe migrations/030_whatsapp.sql.
                  */}
                  <form action={whatsappFreigabeUmschalten.bind(null, b.id)}>
                    <button
                      type="submit"
                      className="rounded px-2 py-0.5 text-xs"
                      style={{
                        background: b.whatsapp ? "var(--gut-hell)" : "var(--hintergrund)",
                        color: b.whatsapp ? "var(--gut)" : "var(--text-leise)",
                      }}
                      title={b.whatsapp ? "Freigabe entziehen" : "Freigeben"}
                    >
                      {b.whatsapp ? "sieht WhatsApp" : "nein"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3 text-xs text-leise">
                  {b.letzter_login ? vorZeit(new Date(b.letzter_login).toISOString()) : "noch nie"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-2 py-0.5 text-xs"
                      style={{
                        background: b.aktiv ? "var(--gut-hell)" : "var(--hintergrund)",
                        color: b.aktiv ? "var(--gut)" : "var(--text-leise)",
                      }}
                    >
                      {b.aktiv ? "aktiv" : "gesperrt"}
                    </span>
                    {/*
                      Die Abmeldung beim Lohnbüro. Steht beim gesperrten
                      Zugang, weil hier auffällt, wenn sie fehlt
                      (Florian, 12.10.2026).
                    */}
                    {!b.aktiv && b.art !== "extern" && (
                      b.abgemeldet_am ? (
                        <span className="text-xs" style={{ color: "var(--gut)" }}>
                          beim Lohnbüro abgemeldet, {new Date(b.abgemeldet_am).toLocaleDateString("de-DE")}
                        </span>
                      ) : (
                        <form action={abmeldungAnsLohnbuero.bind(null, b.id)}>
                          <Absendeknopf text="Ans Lohnbüro abmelden" laeuftText="Wird verschickt..." />
                        </form>
                      )
                    )}
                    {!b.aktiv && b.ausscheiden_grund && (
                      <span className="text-xs text-leise" title={b.ausscheiden_grund}>
                        {b.ausgeschieden_am
                          ? `seit ${new Date(b.ausgeschieden_am).toLocaleDateString("de-DE")}: `
                          : ""}
                        {b.ausscheiden_grund}
                      </span>
                    )}
                    {b.muss_passwort_aendern && b.startpasswort && (
                      <span
                        className="select-all rounded px-1.5 py-0.5 font-mono text-xs"
                        style={{ background: "var(--gold-hell)", color: "var(--gold-dunkel)" }}
                        title="Startpasswort, noch nicht geändert"
                      >
                        {b.startpasswort}
                      </span>
                    )}
                    {b.muss_passwort_aendern && !b.startpasswort && (
                      <span className="text-xs" style={{ color: "var(--warnung)" }}>
                        Startpasswort, nicht mehr anzeigbar
                      </span>
                    )}
                    {!b.muss_passwort_aendern && (
                      <span className="text-xs text-leise">eigenes Passwort</span>
                    )}
                    {b.id !== ich.id && (
                      <form action={benutzerUmschalten.bind(null, b.id)} className="flex items-center gap-1">
                        {/* Beim Sperren darf dabeistehen, warum. */}
                        {b.aktiv && (
                          <input
                            name="grund"
                            placeholder="Grund, freiwillig"
                            maxLength={300}
                            className="w-36 text-xs"
                          />
                        )}
                        <button
                          type="submit"
                          className="text-xs text-leise underline hover:text-text"
                        >
                          {b.aktiv ? "sperren" : "freigeben"}
                        </button>
                      </form>
                    )}
                  </div>
                  <div className="mt-1">
                    <PasswortZuruecksetzen benutzerId={b.id} name={b.name} />
                  </div>
                </td>
              </tr>
    ));

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Zugänge</h1>
          <div className="flex gap-2">
            <a
              href="/einstellungen/einladungen"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: "var(--gold-dunkel)" }}
            >
              Einladungslinks
            </a>
            <a
              href="/einstellungen/mail"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
            >
              E-Mail-Versand
            </a>
            <a
              href="/einstellungen/whatsapp"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
            >
              WhatsApp
            </a>
            <a
              href="/einstellungen/flotix"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
            >
              FloTix
            </a>
            <a
              href="/einstellungen/handynummern"
              className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
            >
              Handynummern
            </a>
          </div>
        </div>
        <p className="mt-1 text-sm text-leise">
          Wer darf ins Programm, und was darf er sehen. Es werden keine Einladungsmails
          verschickt: Du bekommst ein Startpasswort angezeigt und gibst es selbst weiter.
        </p>
        <p className="mt-2 text-sm text-leise">
          Solange jemand noch mit dem Startpasswort arbeitet, steht es hier zum Nachlesen.
          Sobald er sich ein eigenes vergibt, verschwindet es: Selbst gewählte Passwörter sind
          so gespeichert, dass sie sich nicht zurückrechnen lassen, auch nicht für dich. Wer
          seines vergisst, bekommt über <strong>Passwort neu vergeben</strong> ein neues.
        </p>
      </header>
      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}
      {fehler && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}>
          {fehler}
        </p>
      )}

      <section className="space-y-3 rounded-lg border border-linie bg-flaeche p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Einladungslinks je Bereich</h2>
          <a href="/einstellungen/einladungen" className="text-sm underline">
            verwalten
          </a>
        </div>
        <p className="text-sm text-leise">
          Schick den passenden Link an die neue Person. Sie trägt sich selbst ein und ist sofort
          drin, ohne Startpasswort. Jeder, der den Link hat, kann sich einen Zugang anlegen.
        </p>
        <ul className="space-y-3">
          {BEREICHE.map((b) => {
            const e = offeneLinks.find((o) => o.rolle === b.rolle);
            return (
              <li key={b.rolle} className="border-t border-linie pt-3 first:border-0 first:pt-0">
                <p className="text-sm font-medium">
                  {b.titel}
                  {e && e.benutzt > 0 && (
                    <span className="ml-2 text-xs text-leise">
                      {e.benutzt} {e.benutzt === 1 ? "Eintrag" : "Einträge"}
                    </span>
                  )}
                </p>
                {e ? (
                  <div className="mt-1">
                    <LinkKopieren link={einladungsLink(e.token)} />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-leise">
                    Noch kein Link.{" "}
                    <a href={`/einstellungen/einladungen#b-${b.rolle}`} className="underline">
                      Jetzt einen erstellen
                    </a>
                  </p>
                )}
              </li>
            );
          })}

          {/*
            Die Putzfirma hat keinen Einladungslink, sondern einen
            Stempellink: Dahinter legt niemand einen Zugang an, dahinter
            steht nur die Uhr. Er steht trotzdem hier, weil hier gesucht
            wird, wenn man einen Link braucht (Florian, 07.10.2026: "wo
            ist der link").
          */}
          {putzlinks.map((p) => (
            <li key={p.id} className="border-t border-linie pt-3">
              <p className="text-sm font-medium">
                {p.name}
                <span className="ml-2 text-xs text-leise">nur Stempeluhr, kein Zugang</span>
              </p>
              <div className="mt-1">
                <LinkKopieren link={p.link} />
              </div>
              <p className="mt-1 text-xs text-leise">
                Dahinter steht nur die Stempeluhr: ein Knopf zum Ein- und Ausstempeln und die Frage, wie
                viele Leute da sind. Auswertung unter{" "}
                <a href="/reinigung" className="underline">
                  Reinigung
                </a>
                .
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
        <table className="w-full text-sm">
          <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">E-Mail</th>
              <th className="px-4 py-2 font-medium">Darf</th>
              <th className="px-4 py-2 font-medium">FZT</th>
              <th className="px-4 py-2 font-medium">WhatsApp</th>
              <th className="px-4 py-2 font-medium">Zuletzt da</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {reihen(aktuelle)}
          </tbody>
        </table>
      </div>

      {/*
        Das Archiv: zugeklappt, aber auffindbar.

        Offene Abmeldungen ans Lohnbuero stehen in der Ueberschrift.
        Sonst waere mit dem Aufraeumen auch die Aufgabe verschwunden.
      */}
      {ehemalige.length > 0 && (
        <details className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Archiv: ehemalige Mitarbeiter ({ehemalige.length})
            {offeneAbmeldung > 0 && (
              <span className="ml-2 font-normal" style={{ color: "var(--warnung)" }}>
                {offeneAbmeldung === 1
                  ? "bei einem fehlt noch die Abmeldung ans Lohnbüro"
                  : `bei ${offeneAbmeldung} fehlt noch die Abmeldung ans Lohnbüro`}
              </span>
            )}
          </summary>
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">E-Mail</th>
                <th className="px-4 py-2 font-medium">Darf</th>
                <th className="px-4 py-2 font-medium">FZT</th>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
                <th className="px-4 py-2 font-medium">Zuletzt da</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>{reihen(ehemalige)}</tbody>
          </table>
        </details>
      )}

      <BenutzerAnlegen />

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="mb-2 font-semibold">Was die Berechtigungen bedeuten</h2>
        <dl className="space-y-2 text-leise">
          <div>
            <dt className="font-medium text-text">Geschäftsführung</dt>
            <dd>Sieht alles und darf Zugänge anlegen, sperren und Passwörter zurücksetzen.</dd>
          </div>
          <div>
            <dt className="font-medium text-text">Team</dt>
            <dd>
              Sieht alles außer dieser Seite. Für Kevin, Sarah und das allgemeine Postfach.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-text">Gastronomie</dt>
            <dd>
              Sieht nur Funktionsheet und Küchenblatt. Keine Preise, keine Kundendaten, keine
              Zahlungen, keine Angebote. Für Osman und sein Team.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-text">Foyer</dt>
            <dd>Foyerblatt, Einlass, Sitzplan, Parkplätze und der Emoji-Scanner. Keine Preise.</dd>
          </div>
          <div>
            <dt className="font-medium text-text">Showteam</dt>
            <dd>
              Alles, was zur Show gehört: Saalplan, Belegung, Upgrades und Einlass. Nichts von Küche
              und Gastronomie, keine Preise.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-text">Food-Kiosk</dt>
            <dd>Nur die Stehtische je Abend mit Pausenzeit. Keine Gäste- oder Kundendaten.</dd>
          </div>
          <div>
            <dt className="font-medium text-text">FZT-intern / FZT-extern</dt>
            <dd>
              Interne Mitarbeiter füllen beim Anmelden einmal den Personalbogen aus, er geht direkt an
              das Lohnbüro (w.zimmer@florianzimmer.com und Sabine Buschow). Externe Partner nicht.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
