import { db } from "@/lib/db/client";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { benutzerUmschalten } from "@/lib/auth/aktionen";
import { BenutzerAnlegen } from "@/components/BenutzerAnlegen";
import { PasswortZuruecksetzen } from "@/components/PasswortZuruecksetzen";
import { vorZeit } from "@/components/Status";

export const metadata = { title: "Zugänge | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const ROLLE_KURZ: Record<string, string> = {
  chef: "Geschäftsführung",
  team: "Team",
  gastro: "Gastronomie",
  foyer: "Foyer",
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
}

export default async function BenutzerSeite() {
  const ich = await angemeldeterBenutzer();
  if (!ich) return null;

  const benutzer = (await db()`
    select id, name, email, rolle, aktiv, letzter_login, muss_passwort_aendern,
           startpasswort
      from benutzer order by rolle, name
  `) as Zeile[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Zugänge</h1>
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

      <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
        <table className="w-full text-sm">
          <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">E-Mail</th>
              <th className="px-4 py-2 font-medium">Darf</th>
              <th className="px-4 py-2 font-medium">Zuletzt da</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {benutzer.map((b) => (
              <tr key={b.id} className="border-b border-linie last:border-0">
                <td className="px-4 py-3 font-medium">
                  {b.name}
                  {b.id === ich.id && <span className="ml-2 text-xs text-leise">(du)</span>}
                </td>
                <td className="px-4 py-3 text-leise">{b.email}</td>
                <td className="px-4 py-3">{ROLLE_KURZ[b.rolle] ?? b.rolle}</td>
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
                      <form action={benutzerUmschalten.bind(null, b.id)}>
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
            ))}
          </tbody>
        </table>
      </div>

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
        </dl>
      </section>
    </div>
  );
}
