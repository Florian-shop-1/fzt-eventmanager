import Link from "next/link";
import { versandPruefen } from "@/lib/mail/versand";
import { testmailSchicken } from "@/lib/mail/aktionen";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { Probeknopf } from "@/components/Probeknopf";

export const metadata = { title: "Mailversand | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Zustand des Mailversands, auf einer Seite.
 *
 * Verschickt wird über das echte Postfach tickets@florianzimmer.com,
 * nicht über einen Versanddienst. Ob das steht, hängt an vier Werten und
 * an einer Zustimmung in Entra. Diese Seite beantwortet die Frage, ohne
 * dass jemand in Logdateien schauen muss.
 */
export default async function MailSeite({
  searchParams,
}: {
  searchParams: Promise<{ probe?: string; meldung?: string }>;
}) {
  const { probe, meldung } = await searchParams;
  const benutzer = await angemeldeterBenutzer();
  const stand = await versandPruefen();
  const absender = process.env.MAIL_ABSENDER ?? "(nicht gesetzt)";

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mailversand</h1>
        <p className="mt-1 text-sm text-leise">
          Angebote und Anschreiben gehen über euer eigenes Postfach hinaus, nicht über einen
          fremden Dienst. Sie stehen danach unter Gesendete Elemente, und Antworten landen im
          normalen Posteingang.
        </p>
      </header>

      <section
        className="rounded-lg border px-4 py-3"
        style={{
          borderColor: stand.gut ? "var(--gut)" : "var(--warnung)",
          background: stand.gut ? "var(--gut-hell)" : "var(--warnung-hell)",
        }}
      >
        <div className="font-medium">
          {stand.gut ? "Der Versand ist eingerichtet." : "Der Versand ist noch nicht bereit."}
        </div>
        <p className="mt-1 text-sm">{stand.meldung}</p>
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="font-semibold">Einstellungen</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Zeile name="Absender" wert={absender} />
          <Zeile name="Verzeichnis-ID (Mandant)" wert={gesetzt(process.env.MS_MANDANT_ID)} />
          <Zeile name="Anwendungs-ID (Client)" wert={gesetzt(process.env.MS_ANWENDUNG_ID)} />
          <Zeile name="Client-Geheimnis" wert={gesetzt(process.env.MS_GEHEIMNIS, true)} />
        </dl>
        <p className="mt-3 text-xs text-leise">
          Geändert wird das bei Vercel unter Settings, Environment Variables. Danach muss einmal
          neu veröffentlicht werden, sonst gilt weiter der alte Stand.
        </p>
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <h2 className="font-semibold">Probe</h2>
        <p className="mt-1 text-sm text-leise">
          Schickt eine Mail an {benutzer?.email ?? "deine Adresse"}. Sie geht an niemanden
          ausserhalb und beantwortet die Frage, ob der Weg steht.
        </p>
        <form action={testmailSchicken} className="mt-3">
          <Probeknopf bereit={stand.gut} />
        </form>

        {probe === "gut" && (
          <p
            className="mt-3 rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
          >
            <strong>Die Testmail ist raus.</strong> Sie sollte gleich bei{" "}
            {benutzer?.email ?? "dir"} ankommen und im Postfach unter Gesendete Elemente stehen.
            Kommt nichts an, sieh im Spam nach.
          </p>
        )}

        {probe === "fehler" && (
          <p
            className="mt-3 rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
          >
            <strong>Die Mail ging nicht raus.</strong>
            <span className="mt-1 block text-leise">{meldung ?? "Unbekannter Fehler"}</span>
          </p>
        )}
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="font-semibold">Wenn etwas klemmt</h2>
        <ul className="mt-2 space-y-2 text-leise">
          <li>
            <strong>Zustimmung fehlt:</strong> In Entra unter App-Registrierungen, FZT
            Eventmanager, API-Berechtigungen muss bei <code>Mail.Send</code> ein grüner Haken
            stehen. Eine gelbe Warnung heisst, die Administratorzustimmung fehlt noch.
          </li>
          <li>
            <strong>Geheimnis abgelaufen:</strong> Es gilt nur eine begrenzte Zeit. Läuft es ab,
            steht der Versand ohne Vorwarnung still. In Entra unter Zertifikate &amp; Geheimnisse
            ein neues anlegen und bei Vercel eintragen.
          </li>
          <li>
            <strong>Verschickt vom falschen Postfach:</strong> Die App darf ohne Einschränkung von
            jedem Postfach der Firma senden. Eine Zugriffsrichtlinie in Exchange begrenzt das auf{" "}
            {absender}.
          </li>
        </ul>
        <Link href="/einstellungen/benutzer" className="mt-3 inline-block underline">
          Zu den Zugängen
        </Link>
      </section>
    </div>
  );
}

/** Zeigt an, ob ein Wert gesetzt ist, ohne ihn zu verraten. */
function gesetzt(wert: string | undefined, geheim = false): string {
  if (!wert) return "fehlt";
  if (geheim) return `gesetzt (${wert.length} Zeichen)`;
  return wert;
}

function Zeile({ name, wert }: { name: string; wert: string }) {
  const fehlt = wert === "fehlt" || wert === "(nicht gesetzt)";
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="w-56 shrink-0 text-leise">{name}</dt>
      <dd className="font-mono text-xs" style={{ color: fehlt ? "var(--warnung)" : undefined }}>
        {wert}
      </dd>
    </div>
  );
}
