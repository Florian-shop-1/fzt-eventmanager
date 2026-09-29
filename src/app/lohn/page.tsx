import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfZeitenAendern } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { alsDezimal, alsStunden, zeitenImZeitraum, type Mitarbeiterzeiten } from "@/lib/lohn/auswertung";
import { einstellungLesen, meldungLesen } from "@/lib/lohn/meldung";
import {
  istZeitraumSchluessel,
  laufenderZeitraum,
  naechsterZeitraum,
  vorherigerZeitraum,
  zeitraumVon,
} from "@/lib/lohn/zeitraum";
import { adresseSpeichern, anSteuerbueroSchicken, freigabeLoesen, freigeben } from "./aktionen";

export const metadata = { title: "Stundenmeldung | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const datumDe = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
const wochentag = (iso: string) => WOCHENTAGE[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const zeitpunktDe = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const BEZEICHNUNG: Record<string, string> = {
  kommen: "gekommen",
  pause_start: "Pause ab",
  pause_ende: "Pause bis",
  gehen: "gegangen",
};

/**
 * Die Stunden für die Lohnabrechnung, Zeitraum für Zeitraum.
 *
 * Ein Zeitraum läuft vom 16. bis zum 15. des Folgemonats, so wie das
 * Steuerbüro rechnet. Werner sieht die Summen, kann jeden Mitarbeiter
 * aufklappen und Tag für Tag nachlesen, gibt den Zeitraum frei und
 * schickt ihn danach an Frau Buschow (Florian, 29.09.2026).
 */
export default async function LohnSeite({
  searchParams,
}: {
  searchParams: Promise<{ zeitraum?: string; meldung?: string; wer?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfZeitenAendern(b)) redirect("/");

  const { zeitraum, meldung, wer } = await searchParams;
  const z = istZeitraumSchluessel(zeitraum) ? zeitraumVon(zeitraum) : laufenderZeitraum();
  const laeuft = z.schluessel === laufenderZeitraum().schluessel;

  const [leute, stand, e] = await Promise.all([
    zeitenImZeitraum(z),
    meldungLesen(z.schluessel),
    einstellungLesen(),
  ]);

  const summe = leute.reduce((s, p) => s + p.arbeitMinuten, 0);
  const offene = leute.filter((p) => p.offeneTage.length > 0);
  const verschickt = Boolean(stand.versendetAm);
  const freigegeben = Boolean(stand.bestaetigtAm);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stundenmeldung</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Vom 16. des Monats bis einschließlich zum 15. des Folgemonats, so wie das Steuerbüro rechnet.
            Die Zahlen kommen aus der Stempeluhr. Wer einen Fehler findet, korrigiert ihn in der{" "}
            <Link href="/stempeluhr" className="underline">
              Zeiterfassung
            </Link>
            ; hier wird nur gemeldet.
          </p>
        </div>
        <span className="flex gap-3 text-sm">
          <Link href={`/lohn?zeitraum=${vorherigerZeitraum(z).schluessel}`} className="underline">
            Zeitraum davor
          </Link>
          <Link href={`/lohn?zeitraum=${naechsterZeitraum(z).schluessel}`} className="underline">
            Zeitraum danach
          </Link>
        </span>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      <section className="rounded-lg border border-linie bg-flaeche px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{z.name}</h2>
            <p className="text-sm text-leise">
              {datumDe(z.von)} bis {datumDe(z.bis)}
              {laeuft && " (läuft noch)"}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{alsDezimal(summe)}</div>
            <div className="text-xs text-leise">
              Stunden für {leute.length} {leute.length === 1 ? "Mitarbeiter" : "Mitarbeiter"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <a
            href={`/api/lohn?zeitraum=${z.schluessel}&was=pdf`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell"
          >
            PDF ansehen
          </a>
          <a
            href={`/api/lohn?zeitraum=${z.schluessel}&was=summen`}
            className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell"
          >
            Liste für das Steuerbüro (CSV)
          </a>
          <a
            href={`/api/lohn?zeitraum=${z.schluessel}&was=protokoll`}
            className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell"
          >
            Protokoll aller Tage (CSV)
          </a>
        </div>
      </section>

      {laeuft && (
        <p className="rounded-lg border border-dashed border-linie px-4 py-3 text-sm text-leise">
          Dieser Zeitraum läuft noch bis zum {datumDe(z.bis)}. Die Zahlen ändern sich also noch. Zum Melden
          eignet sich der Zeitraum davor.
        </p>
      )}

      {offene.length > 0 && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
        >
          <strong className="font-medium">Noch zu klären:</strong>{" "}
          {offene
            .map((p) => `${p.name} (${p.offeneTage.length} ${p.offeneTage.length === 1 ? "Tag" : "Tage"})`)
            .join(", ")}{" "}
          hat das Ausstempeln vergessen. Diese Tage sind mit null Stunden gerechnet, bis jemand sie in der
          Zeiterfassung nachträgt.
        </div>
      )}

      {/* ---------------------------------------------------------------
          Die Sammelliste. Ein Klick auf den Namen klappt das Protokoll auf.
          --------------------------------------------------------------- */}
      {leute.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          In diesem Zeitraum wurde nicht gestempelt.
        </p>
      ) : (
        <div className="space-y-2">
          {leute.map((p) => (
            <Person key={p.benutzerId} p={p} offen={wer === p.benutzerId} zeitraum={z.schluessel} />
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------
          Freigabe und Versand
          --------------------------------------------------------------- */}
      <section className="rounded-lg border border-linie bg-flaeche px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">An das Steuerbüro</h2>

        <ol className="mt-3 space-y-3 text-sm">
          <li className="flex flex-wrap items-center gap-3">
            <Haken an={freigegeben} />
            <span>
              {freigegeben ? (
                <>
                  Freigegeben von {stand.bestaetigtVon} am {zeitpunktDe(stand.bestaetigtAm!)}
                </>
              ) : (
                "Zahlen durchsehen und freigeben"
              )}
            </span>
            {!verschickt && (
              <form action={freigegeben ? freigabeLoesen : freigeben} className="ml-auto">
                <input type="hidden" name="zeitraum" value={z.schluessel} />
                <Absendeknopf
                  text={freigegeben ? "Freigabe zurücknehmen" : "Stunden freigeben"}
                  laeuftText="..."
                />
              </form>
            )}
          </li>

          <li className="flex flex-wrap items-center gap-3">
            <Haken an={verschickt} />
            <span>
              {verschickt ? (
                <>
                  Verschickt an {stand.versendetAn} am {zeitpunktDe(stand.versendetAm!)}
                </>
              ) : (
                <>
                  Mail an {e.steuerbueroName}
                  {e.steuerbuero ? ` (${e.steuerbuero})` : ", Adresse fehlt noch"}, mit PDF und Tabellen im
                  Anhang
                </>
              )}
            </span>
            {freigegeben && e.steuerbuero && (
              <form action={anSteuerbueroSchicken} className="ml-auto">
                <input type="hidden" name="zeitraum" value={z.schluessel} />
                <Absendeknopf
                  text={verschickt ? "Noch einmal schicken" : "Jetzt verschicken"}
                  laeuftText="Wird verschickt..."
                />
              </form>
            )}
          </li>
        </ol>

        <p className="mt-4 text-xs text-leise">
          Solange wir testen, geht nichts von allein hinaus: Erst freigeben, dann verschicken.
        </p>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-leise">Adresse des Steuerbüros</summary>
          <form action={adresseSpeichern} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="zeitraum" value={z.schluessel} />
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Name</span>
              <input name="steuerbueroName" defaultValue={e.steuerbueroName} className="w-48" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Mailadresse</span>
              <input
                name="steuerbuero"
                type="email"
                defaultValue={e.steuerbuero}
                placeholder="noch nicht eingetragen"
                className="w-64"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-leise">Stille Kopie an (freiwillig)</span>
              <input name="kopieAn" type="email" defaultValue={e.kopieAn} className="w-64" />
            </label>
            <Absendeknopf text="Speichern" laeuftText="..." />
          </form>
        </details>
      </section>
    </div>
  );
}

function Haken({ an }: { an: boolean }) {
  return (
    <span
      className="flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs"
      style={{
        borderColor: an ? "var(--gut)" : "var(--linie)",
        background: an ? "var(--gut-hell)" : "transparent",
        color: an ? "var(--gut)" : "var(--leise)",
      }}
    >
      {an ? "✓" : ""}
    </span>
  );
}

/** Eine Zeile je Mitarbeiter, aufklappbar zum Protokoll. */
function Person({ p, offen, zeitraum }: { p: Mitarbeiterzeiten; offen: boolean; zeitraum: string }) {
  // Arbeitstage und Abwesenheiten in einer Liste, nach Datum.
  const gestempelt = new Set(p.protokoll.map((t) => t.datum));
  const tage = [
    ...p.protokoll.map((t) => ({ datum: t.datum, arbeit: t, frei: null as null | (typeof p.abwesend)[number] })),
    ...p.abwesend
      .filter((a) => !gestempelt.has(a.datum))
      .map((a) => ({ datum: a.datum, arbeit: null as null | (typeof p.protokoll)[number], frei: a })),
  ].sort((a, b) => a.datum.localeCompare(b.datum));

  return (
    <details open={offen} className="rounded-lg border border-linie bg-flaeche">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
        <span className="font-medium">{p.name}</span>
        <span className="ml-auto text-lg font-semibold tabular-nums">{alsDezimal(p.arbeitMinuten)}</span>
        <span className="text-xs text-leise">Stunden</span>
        <span className="w-full text-xs text-leise">
          {p.arbeitstage} Arbeitstage
          {p.pauseMinuten > 0 && `, ${alsStunden(p.pauseMinuten)} Std Pause`}
          {p.urlaubstage > 0 && `, ${p.urlaubstage} Urlaubstage`}
          {p.kranktage > 0 && `, ${p.kranktage} Kranktage`}
          {p.offeneTage.length > 0 && `, ${p.offeneTage.length} Tage ohne Ausstempeln`}
        </span>
      </summary>

      <div className="border-t border-linie px-4 py-3">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-leise">
            <tr>
              <th className="py-1 font-medium">Tag</th>
              <th className="py-1 font-medium">Verlauf</th>
              <th className="py-1 text-right font-medium">Arbeit</th>
              <th className="py-1 text-right font-medium">Pause</th>
            </tr>
          </thead>
          <tbody>
            {tage.map((t) => (
              <tr key={t.datum} className="border-t border-linie align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {wochentag(t.datum)} {datumDe(t.datum)}
                </td>
                <td className="py-2 pr-3">
                  {t.frei ? (
                    <span>
                      {t.frei.art === "urlaub" ? "Urlaub" : t.frei.art === "krank" ? "Krank" : "Frei"}
                      {t.frei.grund && <span className="text-leise"> ({t.frei.grund})</span>}
                    </span>
                  ) : (
                    <span className="text-leise">
                      {t.arbeit!.stempel.map((s) => `${BEZEICHNUNG[s.art] ?? s.art} ${s.uhrzeit}`).join(", ")}
                      {t.arbeit!.offen && (
                        <strong className="font-medium" style={{ color: "var(--warnung)" }}>
                          {" "}
                          Ausstempeln fehlt
                        </strong>
                      )}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {t.arbeit ? alsStunden(t.arbeit.arbeitMinuten) : "-"}
                </td>
                <td className="py-2 text-right tabular-nums text-leise">
                  {t.arbeit && t.arbeit.pauseMinuten > 0 ? alsStunden(t.arbeit.pauseMinuten) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tage.length === 0 && <p className="text-sm text-leise">Keine Tage in diesem Zeitraum.</p>}

        <p className="mt-3 text-xs text-leise">
          Stimmt etwas nicht?{" "}
          <Link href={`/stempeluhr?wer=${p.benutzerId}`} className="underline">
            In der Zeiterfassung korrigieren
          </Link>
          , danach{" "}
          <Link href={`/lohn?zeitraum=${zeitraum}&wer=${p.benutzerId}`} className="underline">
            hier neu laden
          </Link>
          .
        </p>
      </div>
    </details>
  );
}
