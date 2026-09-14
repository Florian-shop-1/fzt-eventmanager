import { db } from "@/lib/db/client";
import { istEingerichtet } from "@/lib/whatsapp/senden";
import { autoantwortSpeichern, meldungTesten, verbindungTesten } from "@/lib/whatsapp/aktionen";
import { holeEinstellung, AUTOANTWORT_STUNDEN } from "@/lib/db/whatsapp";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";

export const metadata = { title: "WhatsApp einrichten | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * WhatsApp einrichten, für den Inhaber.
 *
 * Zeigt, was bei Vercel steht, die beiden Werte, die bei Meta eingetragen
 * werden müssen, einen Knopf zum Prüfen der Verbindung und die automatische
 * Antwort. Die geheimen Schlüssel zeigt die Seite nie an, nur ob sie da sind.
 *
 * Das Prüfwort dagegen steht hier im Klartext. Es ist kein Geheimnis im
 * eigentlichen Sinn: Meta fragt es einmal ab, damit niemand fremde Adressen
 * für unsere App anmeldet, und Florian muss es dort hineinkopieren können.
 */
export default async function WhatsAppEinrichten({
  searchParams,
}: {
  searchParams: Promise<{ gespeichert?: string; verbunden?: string; getestet?: string; fehler?: string }>;
}) {
  const { gespeichert, verbunden, getestet, fehler } = await searchParams;
  const stand = istEingerichtet();
  const einstellung = await holeEinstellung();
  const appUrl = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

  const [letzte] = (await db()`
    select max(zeitpunkt) filter (where richtung = 'ein') as eingang,
           max(zeitpunkt) filter (where herkunft = 'automatik') as automatik
      from wa_nachricht
  `) as Array<{ eingang: string | null; automatik: string | null }>;

  const freigaben = (await db()`
    select name from benutzer where whatsapp and aktiv order by name
  `) as Array<{ name: string }>;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp einrichten</h1>
        <p className="mt-1 text-sm text-leise">
          Die Nummer 0731 7906110 läuft direkt über Meta in den Eventmanager, ohne Anbieter
          dazwischen und ohne Monatsgebühr.
        </p>
      </header>

      {gespeichert && (
        <Kasten farbe="gut">
          <strong>Gespeichert.</strong>
        </Kasten>
      )}
      {verbunden && (
        <Kasten farbe="gut">
          <strong>Verbindung steht.</strong> Meta kennt die Nummer als {verbunden}.
        </Kasten>
      )}
      {getestet && (
        <Kasten farbe="gut">
          <strong>Testmeldung ist raus</strong> an {getestet}. So sieht die Mail bei jeder neuen
          WhatsApp-Unterhaltung aus.
        </Kasten>
      )}
      {fehler && (
        <Kasten farbe="blocker">
          <strong>Das hat nicht geklappt.</strong>
          <div className="mt-1">{fehler}</div>
        </Kasten>
      )}

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="font-semibold">Stand</h2>
        <ul className="mt-3 space-y-2">
          <Punkt ok={stand.telefonId}>Kennung der Nummer bei Vercel (WHATSAPP_TELEFON_ID)</Punkt>
          <Punkt ok={stand.zugangstoken}>Zugangsschlüssel bei Vercel (WHATSAPP_ZUGANGSTOKEN)</Punkt>
          <Punkt ok={stand.appGeheimnis}>App-Geheimnis bei Vercel (WHATSAPP_APP_GEHEIMNIS)</Punkt>
          <Punkt ok={stand.pruefwort}>Prüfwort für den Webhook (WHATSAPP_PRUEFWORT)</Punkt>
          <Punkt ok={Boolean(letzte?.eingang)}>
            {letzte?.eingang
              ? `Letzte Nachricht vom Kunden ${vorZeit(new Date(letzte.eingang).toISOString())}`
              : "Noch keine Nachricht angekommen"}
          </Punkt>
        </ul>
        <p className="mt-4 text-leise">
          Sehen dürfen den Posteingang:{" "}
          {freigaben.length > 0 ? freigaben.map((f) => f.name).join(", ") : "noch niemand"}.
          Ändern unter{" "}
          <a href="/einstellungen/benutzer" className="underline">
            Zugänge
          </a>
          . Neue Unterhaltungen werden zusätzlich an{" "}
          {process.env.WHATSAPP_MELDUNG_AN ?? "tickets@florianzimmer.com"} gemeldet.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={verbindungTesten}>
            <Absendeknopf
              text="Verbindung zu Meta prüfen"
              laeuftText="Wird geprüft..."
              deaktiviert={!stand.telefonId || !stand.zugangstoken}
            />
          </form>
          <form action={meldungTesten}>
            <Absendeknopf text="Testmeldung an tickets@ schicken" laeuftText="Wird verschickt..." />
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="font-semibold">Bei Meta eintragen</h2>
        <p className="mt-1 text-leise">
          In der Meta-App unter WhatsApp, Konfiguration, Webhook. Danach dort das Feld
          „messages“ abonnieren.
        </p>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-leise">Rückruf-URL</dt>
            <dd className="mt-1 select-all rounded-md bg-hintergrund px-3 py-2 font-mono text-xs">
              {appUrl}/api/whatsapp/eingang
            </dd>
          </div>
          <div>
            <dt className="text-leise">Überprüfungstoken</dt>
            <dd className="mt-1 select-all rounded-md bg-hintergrund px-3 py-2 font-mono text-xs">
              {process.env.WHATSAPP_PRUEFWORT ?? "fehlt noch bei Vercel"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="font-semibold">Automatische Antwort</h2>
        <p className="mt-1 text-leise">
          Geht an jeden, der schreibt, höchstens alle {AUTOANTWORT_STUNDEN} Stunden einmal. Nicht,
          wenn in dieser Zeit schon jemand von euch mit ihm geschrieben hat.
          {letzte?.automatik &&
            ` Zuletzt verschickt ${vorZeit(new Date(letzte.automatik).toISOString())}.`}
        </p>
        <form action={autoantwortSpeichern} className="mt-3 space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="aktiv" value="an" defaultChecked={einstellung.autoantwortAktiv} />
            <span>Eingeschaltet</span>
          </label>
          <textarea
            name="text"
            rows={4}
            defaultValue={einstellung.autoantwortText}
            maxLength={1000}
            className="w-full rounded-md border border-linie px-3 py-2"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-leise">
              {einstellung.geaendertVon
                ? `Zuletzt geändert von ${einstellung.geaendertVon}, ${vorZeit(einstellung.geaendertAm)}`
                : "Noch der Vorschlag vom Einrichten"}
            </span>
            <Absendeknopf text="Speichern" laeuftText="Wird gespeichert..." />
          </div>
        </form>
      </section>
    </div>
  );
}

function Punkt({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full text-center text-[10px] leading-4 text-white"
        style={{ background: ok ? "var(--gut)" : "var(--linie)" }}
        aria-label={ok ? "erledigt" : "offen"}
      >
        {ok ? "✓" : ""}
      </span>
      <span className={ok ? "" : "text-leise"}>{children}</span>
    </li>
  );
}

function Kasten({ farbe, children }: { farbe: "gut" | "blocker"; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: `var(--${farbe})`, background: `var(--${farbe}-hell)` }}
    >
      {children}
    </div>
  );
}
