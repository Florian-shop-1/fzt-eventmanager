import { db } from "@/lib/db/client";
import { istEingerichtet, kontoAngeschlossen, vorlagenLesen } from "@/lib/whatsapp/senden";
import { VORLAGEN } from "@/lib/whatsapp/vorlagen";
import {
  autoantwortSpeichern,
  kontoAnschliessenAktion,
  vorlageEinreichen,
  zugriffPruefen,
  meldungTesten,
  verbindungTesten,
} from "@/lib/whatsapp/aktionen";
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
  /*
    Der Stand unserer Vorlagen bei Meta. Ohne Schlüssel gar nicht erst
    fragen, dann steht auf der Seite ohnehin, dass noch nichts da ist.
  */
  const vorlagen = stand.zugangstoken ? await vorlagenLesen().catch(() => []) : [];
  const appUrl = process.env.APP_URL ?? "https://eventmanager.florianzimmertheater.de";

  /*
    "Nachricht über WhatsApp" heisst: von einer echten Nummer.

    Erkennbar an der Unterhaltung: Eine echte trägt die Telefonnummer,
    eine interne eine Kennung, die mit "web-" beginnt. Nicht an meta_id,
    die ist bei internen Meldungen leer und war mein erster, falscher
    Versuch.
    
    Vorher zählten hier auch die Meldungen mitgezählt, die der
    Eventmanager selbst in den Chat schreibt (liegengelassene Körbe,
    Bewertungen, technische Probleme). Die tragen eine Kennung, die mit
    "web-" beginnt, und kommen nicht von Meta. Mit ihnen stand hier
    "letzte Nachricht vor zwei Stunden", obwohl über WhatsApp nie eine
    einzige angekommen war. Genau daran war nicht zu erkennen, dass die
    Verbindung zu Meta fehlt (Florian, 20.10.2026: "es kam keine
    nachricht im eventmanager an, als ich vorhin per whats app
    geschrieben hatte").
  */
  const [letzte] = (await db()`
    select max(zeitpunkt) filter (
             where richtung = 'ein' and wa_id not like 'web-%'
           ) as eingang,
           max(zeitpunkt) filter (where richtung = 'ein') as eingangIntern,
           max(zeitpunkt) filter (where herkunft = 'automatik') as automatik
      from wa_nachricht
  `) as Array<{ eingang: string | null; eingangintern: string | null; automatik: string | null }>;

  /*
    Schickt Meta uns überhaupt etwas? Das ist die Frage, die bei einer
    stummen Nummer zuerst zu klären ist: Ohne angeschlossenes Konto
    liefert Meta keine eingehende Nachricht aus, egal wie richtig der
    Webhook eingetragen ist.
  */
  const angeschlossen = stand.zugangstoken
    ? await kontoAngeschlossen().catch(() => null)
    : null;

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
      {/*
        Die Rückmeldung steht so da, wie die Aktion sie schreibt.

        Vorher stand hier fest "Meta kennt die Nummer als ...", und jede
        andere Rückmeldung wurde in diesen Satz hineingezwängt. Nach dem
        Einreichen einer Vorlage las sich das als "Meta kennt die Nummer
        als Vorlage bei Meta eingereicht. Die Prüfung dauert meist ein
        bis zwei Tage.." (Florian, 21.10.2026). Die Aktionen schreiben
        jetzt ganze Sätze, und hier steht nur noch der Rahmen.
      */}
      {verbunden && (
        <Kasten farbe="gut">
          <strong>Geschafft.</strong> {verbunden}
        </Kasten>
      )}
      {getestet && (
        <Kasten farbe="gut">
          <strong>Microsoft hat die Testmeldung angenommen</strong>, an {getestet}. Sie sollte in
          ein bis zwei Minuten bei jedem im Posteingang liegen, Betreff „WhatsApp von Testkunde“.
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
          <Punkt ok={angeschlossen === true}>
            {angeschlossen === true
              ? "Konto an die App angeschlossen, Meta schickt eingehende Nachrichten"
              : angeschlossen === false
                ? "Konto NICHT an die App angeschlossen: Meta schickt keine eingehende Nachricht. Unten auf „Konto anschließen“ drücken."
                : "Anschluss nicht geprüft, es fehlt der Zugangsschlüssel"}
          </Punkt>
          <Punkt ok={Boolean(letzte?.eingang)}>
            {letzte?.eingang
              ? `Letzte Nachricht über WhatsApp ${vorZeit(new Date(letzte.eingang).toISOString())}`
              : "Über WhatsApp ist noch keine einzige Nachricht angekommen"}
          </Punkt>
          {!letzte?.eingang && letzte?.eingangintern && (
            <li className="text-leise">
              Im Chat stehen trotzdem Meldungen: Die schreibt der Eventmanager selbst hinein,
              etwa liegengelassene Körbe und Bewertungen. Die letzte{" "}
              {vorZeit(new Date(letzte.eingangintern).toISOString())}. Sie laufen nicht über
              Meta und sagen nichts darüber, ob WhatsApp funktioniert.
            </li>
          )}
        </ul>
        <p className="mt-4 text-leise">
          Sehen dürfen den Posteingang:{" "}
          {freigaben.length > 0 ? freigaben.map((f) => f.name).join(", ") : "noch niemand"}.
          Ändern unter{" "}
          <a href="/einstellungen/benutzer" className="underline">
            Zugänge
          </a>
          . Wer den Posteingang sehen darf, bekommt bei jeder neuen Unterhaltung auch eine Mail an
          seine Adresse aus den Zugängen.
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
            <Absendeknopf text="Testmeldung per Mail schicken" laeuftText="Wird verschickt..." />
          </form>
          {/* Sagt, was der hinterlegte Schluessel bei Meta wirklich darf. */}
          <form action={zugriffPruefen}>
            <Absendeknopf
              text="Was darf der Schlüssel?"
              laeuftText="Wird geprüft..."
              deaktiviert={!stand.zugangstoken}
            />
          </form>

          <form action={kontoAnschliessenAktion}>
            <Absendeknopf
              text="WhatsApp-Konto an den Eventmanager anschliessen"
              laeuftText="Wird angeschlossen..."
              deaktiviert={!stand.zugangstoken || !process.env.WHATSAPP_KONTO_ID}
            />
          </form>
        </div>
      </section>

      {/*
        Vorlagen.

        Später als 24 Stunden nach der letzten Nachricht des Empfängers
        lässt WhatsApp nur genehmigte Vorlagen durch. Genau das brauchen
        wir für die Nachricht nach der Pause (Florian, 12.10.2026).
      */}
      <section className="rounded-lg border border-linie bg-flaeche p-5 text-sm">
        <h2 className="font-semibold">Vorlagen bei Meta</h2>
        <p className="mt-1 max-w-prose text-leise">
          Wer uns nicht gerade geschrieben hat, erreichen wir nur mit einer Vorlage, die Meta geprüft hat.
          Die Prüfung dauert meist ein bis zwei Tage. Danach steht der Text fest, nur die Platzhalter
          wechseln. Jede verschickte Vorlage kostet in Deutschland rund fünf Cent.
        </p>

        <ul className="mt-4 space-y-3">
          {VORLAGEN.map((v) => {
            const beiMeta = vorlagen.find((m) => m.name === v.name && m.sprache === v.sprache);
            return (
              <li key={v.name} className="rounded-lg border border-linie px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{v.wofuer}</strong>
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={
                      beiMeta?.status === "APPROVED"
                        ? { background: "var(--gut-hell)", color: "var(--gut)" }
                        : beiMeta
                          ? { background: "var(--gold-hell)", color: "var(--gold-dunkel)" }
                          : { background: "var(--warnung-hell)", color: "var(--warnung)" }
                    }
                  >
                    {beiMeta?.status === "APPROVED"
                      ? "genehmigt"
                      : beiMeta
                        ? `bei Meta: ${beiMeta.status}`
                        : "noch nicht eingereicht"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line rounded-md bg-hintergrund px-3 py-2 text-xs">{v.text}</p>
                <p className="mt-1 text-xs text-leise">{v.fusszeile}</p>
                {/* Der Knopf gehoert zur Vorlage und wird mit eingereicht.
                    Er fehlte in der Vorschau, und dann sieht man nicht,
                    was man abschickt (Florian, 12.10.2026). */}
                <p className="mt-2 text-xs">
                  <span className="rounded-md border border-gold px-2 py-1 text-gold-dunkel">
                    {v.knopf.text}
                  </span>{" "}
                  <span className="text-leise">führt zu {v.knopf.url}</span>
                </p>
                <p className="mt-2 text-xs text-leise">
                  Platzhalter: {v.beispiel.map((b, i) => `{{${i + 1}}} = ${b}`).join(", ")}
                </p>
                {!beiMeta && (
                  <form action={vorlageEinreichen} className="mt-3">
                    <input type="hidden" name="name" value={v.name} />
                    <Absendeknopf
                      text="Bei Meta einreichen"
                      laeuftText="Wird eingereicht..."
                      deaktiviert={!stand.zugangstoken}
                    />
                  </form>
                )}
              </li>
            );
          })}
        </ul>
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
