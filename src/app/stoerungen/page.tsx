import Link from "next/link";
import { holeLeads, istStoerung, STOERUNG_STATUS, type Lead } from "@/lib/shop/leads";
import { leadSpeichern, leadStaende, type LeadStand } from "@/lib/db/buero";
import { vorZeit } from "@/components/Status";
import { technikStoerungen, type TechnikStoerung } from "@/lib/db/technik-stoerung";
import { grundText } from "@/lib/stoerung/meldung";
import { ditixTerminLink, ditixTicketsLink } from "@/lib/ditix/link";
import { stoerungAbhaken } from "./aktionen";

export const metadata = { title: "Störungen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Störungsmeldungen aus dem Shop.
 *
 * Seit dem Vorfall vom 4. September hat der Shop einen Notausgang: Lädt
 * der Saalplan nicht, steht der Besucher nicht mehr in der Sackgasse,
 * sondern kann einen Rückruf anfordern. Diese Meldungen laufen über
 * denselben Weg wie die Anfragen und landen in derselben Tabelle.
 *
 * Sie brauchen aber eine eigene Seite, denn sie sind etwas anderes als
 * eine Verkaufsanfrage: Da wollte jemand kaufen und konnte nicht. Das
 * ist eilig, und es ist ein Hinweis darauf, dass gerade etwas kaputt
 * ist. Deshalb steht hier die Telefonnummer im Vordergrund und nicht die
 * Vertriebsstufe.
 */
export default async function StoerungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ zeige?: string }>;
}) {
  const { zeige } = await searchParams;
  const alleZeigen = zeige === "alle";

  let leads: Lead[] = [];
  let fehler: string | null = null;
  try {
    leads = await holeLeads();
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const staende = await leadStaende();

  // Meldungen, die der Shop selbst abgibt, ohne dass ein Gast etwas tun muss.
  let technik: TechnikStoerung[] = [];
  let technikFehler: string | null = null;
  try {
    technik = await technikStoerungen(alleZeigen);
  } catch (e) {
    technikFehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }
  const technikOffen = technik.filter((t) => !t.erledigtAm);

  const meldungen = leads
    .filter(istStoerung)
    .map((l) => {
      const stand = staende.get(l.schluessel);
      return { ...l, status: stand?.status ?? "Neu", kommentar: l.kommentar, stand };
    })
    .sort((a, b) => b.eingang.localeCompare(a.eingang));

  const offen = meldungen.filter((m) => !/erledigt/i.test(m.status));
  const sichtbar = alleZeigen ? meldungen : offen;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Störungen</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Wenn im Shop der Saalplan nicht lädt, kann der Besucher einen Rückruf anfordern, statt
          den Kauf abzubrechen. Diese Meldungen stehen hier. Sie sind eilig: Da wollte jemand
          kaufen und konnte nicht.
        </p>
      </header>

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Liste nicht lesbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      <section className="flex flex-wrap gap-4">
        <Kachel
          zahl={offen.length}
          was="offen"
          hinweis="warten auf einen Rückruf"
          betont={offen.length > 0}
        />
        <Kachel zahl={meldungen.length} was="insgesamt" hinweis="seit Beginn der Liste" />
        <Kachel
          zahl={technikOffen.length}
          was="vom Shop gemeldet"
          hinweis="Buchung war nicht möglich"
          betont={technikOffen.length > 0}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Vom Shop gemeldet</h2>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Der Shop merkt selbst, wenn bei ULMFASSBAR, Flo-Zirkus oder Magic Memories die
            Warteliste erscheint, obwohl diese Shows bis zum Beginn im Verkauf sind. Dann steht
            der Termin hier, und Florian, Kevin und Julian haben eine Mail. Die Ursache liegt
            meistens in Ditix: Verkaufszeitraum, Preise auf den Kategorien, Ticketarten.
          </p>
        </div>

        {technikFehler && (
          <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
            <strong style={{ color: "var(--blocker)" }}>Meldungen nicht lesbar.</strong>
            <div className="mt-1 text-leise">{technikFehler}</div>
          </div>
        )}

        {technik.length === 0 ? (
          <div className="rounded-lg border border-dashed border-linie px-6 py-8 text-center text-sm">
            <div className="font-medium">Keine Meldung</div>
            <p className="mt-1 text-leise">
              {alleZeigen
                ? "Der Shop hat bisher keine Störung gemeldet."
                : "Gerade ist nichts offen."}
            </p>
          </div>
        ) : (
          technik.map((t) => <TechnikKarte key={t.id} stoerung={t} />)
        )}
      </section>

      <h2 className="text-lg font-semibold tracking-tight">Rückrufwünsche</h2>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/stoerungen"
          className={`rounded-md border px-3 py-1.5 ${
            !alleZeigen ? "border-gold bg-gold-hell" : "border-linie"
          }`}
        >
          Offen ({offen.length})
        </Link>
        <Link
          href="/stoerungen?zeige=alle"
          className={`rounded-md border px-3 py-1.5 ${
            alleZeigen ? "border-gold bg-gold-hell" : "border-linie"
          }`}
        >
          Alle ({meldungen.length})
        </Link>
      </nav>

      {sichtbar.length === 0 ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
          <div className="font-medium">
            {alleZeigen ? "Noch keine Störungsmeldung" : "Nichts offen"}
          </div>
          <p className="mt-1 text-leise">
            {alleZeigen
              ? "Bisher hat niemand gemeldet, dass der Saalplan nicht lädt."
              : "Alle Rückrufe erledigt."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sichtbar.map((m) => (
            <Karte key={m.schluessel} meldung={m} stand={m.stand} />
          ))}
        </div>
      )}

      <p className="max-w-prose text-xs text-leise">
        Kommen mehrere Meldungen kurz hintereinander, ist das kein Zufall, sondern ein Ausfall.
        Der Shop beantwortet unter{" "}
        <a
          href="https://shop.florianzimmertheater.de/status"
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          /status
        </a>{" "}
        selbst die Frage, ob gerade jemand ein Ticket kaufen kann.
      </p>
    </div>
  );
}

function Kachel({
  zahl,
  was,
  hinweis,
  betont,
}: {
  zahl: number;
  was: string;
  hinweis: string;
  betont?: boolean;
}) {
  return (
    <div
      className="min-w-40 rounded-lg border px-4 py-3"
      style={{
        borderColor: betont ? "var(--warnung)" : "var(--linie)",
        background: betont ? "var(--warnung-hell)" : "var(--flaeche)",
      }}
    >
      <div className="text-2xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      <div className="text-xs text-leise">{hinweis}</div>
    </div>
  );
}

/**
 * Eine Meldung.
 *
 * Die Telefonnummer steht gross und als Wählen-Verweis, denn genau darum
 * geht es: zurückrufen. Alles andere ist Beiwerk.
 */
function Karte({ meldung, stand }: { meldung: Lead; stand: LeadStand | undefined }) {
  const erledigt = /erledigt/i.test(meldung.status);
  const farbe = erledigt ? "var(--text-leise)" : "var(--warnung)";

  return (
    <article
      className="rounded-lg border p-5"
      style={{
        borderColor: erledigt ? "var(--linie)" : "var(--warnung)",
        background: "var(--flaeche)",
        opacity: erledigt ? 0.65 : 1,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border px-2 py-px text-xs font-medium"
              style={{ color: farbe, borderColor: farbe }}
            >
              {meldung.status}
            </span>
            <span className="text-sm text-leise">Eingang {meldung.eingang}</span>
          </div>

          {meldung.telefon && (
            <a
              href={`tel:${meldung.telefon.replace(/\s/g, "")}`}
              className="mt-2 block text-2xl font-semibold tracking-tight underline decoration-1 underline-offset-4 hover:text-gold-dunkel"
            >
              {meldung.telefon}
            </a>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {meldung.email && (
              <a href={`mailto:${meldung.email}`} className="underline hover:text-gold-dunkel">
                {meldung.email}
              </a>
            )}
            {meldung.wunschdatum && meldung.wunschdatum !== "-" && (
              <span className="text-leise">Wollte: {meldung.wunschdatum}</span>
            )}
          </div>

          {meldung.kommentar && (
            <p className="mt-3 max-w-prose whitespace-pre-line rounded border border-linie bg-white/40 px-3 py-2 text-sm text-leise">
              {meldung.kommentar}
            </p>
          )}

          {meldung.herkunft && (
            <div className="mt-2 text-xs text-leise">Kam über {meldung.herkunft}</div>
          )}

          {stand?.geaendertVon && stand.geaendertAm && (
            <div className="mt-2 text-xs text-leise">
              Zuletzt bearbeitet von {stand.geaendertVon}, {vorZeit(stand.geaendertAm)}
            </div>
          )}
        </div>

        <form
          action={leadSpeichern.bind(null, meldung.schluessel)}
          className="flex shrink-0 flex-col items-end gap-2"
        >
          <input type="hidden" name="kommentar" value={meldung.kommentar} />
          <select
            name="status"
            defaultValue={meldung.status}
            className="rounded-md border border-linie px-3 py-1.5 text-sm"
          >
            {STOERUNG_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
          >
            Sichern
          </button>
        </form>
      </div>
    </article>
  );
}

/**
 * Eine Meldung des Shops.
 *
 * Wichtig ist hier nicht eine Telefonnummer, sondern der Termin: Mit dem
 * geht Julian in Ditix und sieht nach, warum nichts zu verkaufen war.
 */
function TechnikKarte({ stoerung }: { stoerung: TechnikStoerung }) {
  const erledigt = Boolean(stoerung.erledigtAm);
  const farbe = erledigt ? "var(--text-leise)" : "var(--blocker)";
  // Der Weg zur Behebung führt immer über Ditix, also gleich dorthin verlinken:
  // auf die Ticketseite des Termins, wo Preise und Verkaufszeiten stehen.
  const ditix = ditixTicketsLink(stoerung.eventId);
  const ditixUebersicht = ditixTerminLink(stoerung.eventId);

  return (
    <article
      className="rounded-lg border p-5"
      style={{
        borderColor: erledigt ? "var(--linie)" : "var(--blocker)",
        background: "var(--flaeche)",
        opacity: erledigt ? 0.65 : 1,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border px-2 py-px text-xs font-medium"
              style={{ color: farbe, borderColor: farbe }}
            >
              {stoerung.art === "warteliste" ? "Warteliste statt Saalplan" : stoerung.art}
            </span>
            <span className="text-sm text-leise">
              {stoerung.anzahl === 1
                ? `einmal, ${vorZeit(stoerung.zuletztAm)}`
                : `${stoerung.anzahl} mal, zuletzt ${vorZeit(stoerung.zuletztAm)}`}
            </span>
          </div>

          <div className="mt-2 text-xl font-semibold tracking-tight">
            {stoerung.showName ?? "Unbekannte Show"}
          </div>
          <div className="text-sm">{stoerung.eventZeit ?? "Termin unbekannt"}</div>

          <p className="mt-3 max-w-prose rounded border border-linie bg-white/40 px-3 py-2 text-sm text-leise">
            {grundText(stoerung.grund)}
          </p>

          {ditix && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={ditix}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
              >
                Preise und Verkaufszeiten in Ditix
              </a>
              {ditixUebersicht && (
                <a href={ditixUebersicht} target="_blank" rel="noreferrer" className="text-sm underline hover:text-gold-dunkel">
                  Übersicht zum Termin
                </a>
              )}
            </div>
          )}

          <div className="mt-2 text-xs text-leise">
            {stoerung.eventId && <>Ditix-Termin-Nr. {stoerung.eventId} · </>}
            zuerst {vorZeit(stoerung.erstmalsAm)}
            {stoerung.mailAm ? " · Mail ist raus" : " · Mail steht noch aus"}
          </div>

          {erledigt && (
            <div className="mt-2 text-xs text-leise">
              Abgehakt von {stoerung.erledigtVon}, {vorZeit(stoerung.erledigtAm!)}
              {stoerung.notiz ? `: ${stoerung.notiz}` : ""}
            </div>
          )}
        </div>

        {!erledigt && (
          <form
            action={stoerungAbhaken.bind(null, stoerung.id)}
            className="flex shrink-0 flex-col items-end gap-2"
          >
            <input
              type="text"
              name="notiz"
              placeholder="Was war die Ursache?"
              className="w-56 rounded-md border border-linie px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
            >
              Behoben
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
