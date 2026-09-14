import { db } from "@/lib/db/client";
import { istEingerichtet } from "@/lib/whatsapp/senden";
import { webhookEinrichten } from "@/lib/whatsapp/aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";

export const metadata = { title: "WhatsApp einrichten | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Verbindung zu 360dialog, für den Inhaber.
 *
 * Zeigt, ob die beiden Schlüssel bei Vercel stehen, wann zuletzt etwas
 * angekommen ist, und hat den Knopf, der 360dialog die Adresse des
 * Webhooks mitteilt. Die Schlüssel selbst zeigt die Seite nie an.
 */
export default async function WhatsAppEinrichten({
  searchParams,
}: {
  searchParams: Promise<{ eingerichtet?: string; fehler?: string }>;
}) {
  const { eingerichtet, fehler } = await searchParams;
  const stand = istEingerichtet();

  const [letzte] = (await db()`
    select max(zeitpunkt) filter (where richtung = 'ein') as eingang,
           max(zeitpunkt) filter (where herkunft = 'app') as echo,
           count(*)::int as anzahl
      from wa_nachricht
  `) as Array<{ eingang: string | null; echo: string | null; anzahl: number }>;

  const freigaben = (await db()`
    select name from benutzer where whatsapp and aktiv order by name
  `) as Array<{ name: string }>;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp einrichten</h1>
        <p className="mt-1 text-sm text-leise">
          Die Nummer 0731 7906110 bleibt in der WhatsApp Business App und wird über 360dialog
          zusätzlich an den Eventmanager angebunden.
        </p>
      </header>

      {eingerichtet && (
        <Kasten farbe="gut">
          <strong>Verbunden.</strong> 360dialog schickt neue Nachrichten ab jetzt hierher. Schreib
          zum Prüfen von deinem Handy eine WhatsApp an 0731 7906110.
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
          <Punkt ok={stand.schluessel}>
            Schlüssel von 360dialog bei Vercel (WHATSAPP_360_SCHLUESSEL)
          </Punkt>
          <Punkt ok={stand.webhookSchluessel}>
            Eigener Schlüssel für eingehende Nachrichten (WHATSAPP_WEBHOOK_SCHLUESSEL)
          </Punkt>
          <Punkt ok={Boolean(letzte?.eingang)}>
            {letzte?.eingang
              ? `Letzte Nachricht vom Kunden ${vorZeit(new Date(letzte.eingang).toISOString())}`
              : "Noch keine Nachricht angekommen"}
          </Punkt>
          <Punkt ok={Boolean(letzte?.echo)}>
            {letzte?.echo
              ? `Letzte Antwort aus der App ${vorZeit(new Date(letzte.echo).toISOString())}`
              : "Noch keine Antwort aus der App gesehen"}
          </Punkt>
        </ul>
        <p className="mt-4 text-leise">
          Sehen dürfen den Posteingang:{" "}
          {freigaben.length > 0 ? freigaben.map((f) => f.name).join(", ") : "noch niemand"}.
          Ändern unter <a href="/einstellungen/benutzer" className="underline">Zugänge</a>.
        </p>
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="font-semibold">Webhook bei 360dialog eintragen</h2>
        <p className="mt-1 text-leise">
          Einmal drücken, sobald beide Schlüssel stehen. Danach weiss 360dialog, wohin neue
          Nachrichten sollen. Nochmal drücken schadet nicht.
        </p>
        <form action={webhookEinrichten} className="mt-3">
          <Absendeknopf
            text="Webhook eintragen"
            laeuftText="Wird eingetragen..."
            deaktiviert={!stand.schluessel || !stand.webhookSchluessel}
          />
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
