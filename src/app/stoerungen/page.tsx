import Link from "next/link";
import { holeLeads, istStoerung, STOERUNG_STATUS, type Lead } from "@/lib/shop/leads";
import { leadSpeichern, leadStaende, type LeadStand } from "@/lib/db/buero";
import { vorZeit } from "@/components/Status";
import {
  stoerungEinstellung,
  technikStoerungen,
  type StoerungEinstellung,
  type TechnikStoerung,
} from "@/lib/db/technik-stoerung";
import { grundText, wasDerGastSah } from "@/lib/stoerung/meldung";
import { ditixTicketsLink, ditixVerkaufLink } from "@/lib/ditix/link";
import { kommendeTermine, type Vorstellungstermin } from "@/lib/ditix/spielplan";
import { datumMitWochentag } from "@/lib/zeit";
import { mailSchalten, stoerungAbhaken } from "./aktionen";

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

  /*
    Der Shop meldet den Termin so, wie er ihn kennt. Bei "Termin nicht in
    der Ditix-Liste" kennt er ihn aber gerade nicht, dann stand auf der
    Karte nur die Show ohne Datum, und man musste raten, welcher Abend
    gemeint ist (Florian, 23.09.2026). Deshalb hier gegen den Spielplan
    nachschlagen und Datum und Uhrzeit ergänzen.
  */
  const spielplan = new Map<string, Vorstellungstermin>();
  try {
    for (const t of await kommendeTermine(400)) spielplan.set(t.ditixEventId, t);
  } catch {
    // Ohne Spielplan bleibt es bei dem, was der Shop gemeldet hat.
  }

  let einstellung: StoerungEinstellung = {
    mailAn: false,
    geaendertAm: new Date().toISOString(),
    geaendertVon: null,
    grund: null,
  };
  try {
    einstellung = await stoerungEinstellung();
  } catch {
    // Ohne Einstellung bleibt die Seite lesbar, der Schalter zeigt dann "aus".
  }

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
            der Termin hier. Die Ursache liegt meistens in Ditix: Verkaufszeitraum, Preise auf
            den Kategorien, Ticketarten.
          </p>
        </div>

        <form
          action={mailSchalten}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm"
        >
          <div className="max-w-prose">
            <strong>Warnmails: {einstellung.mailAn ? "an" : "aus"}</strong>
            <div className="text-leise">
              {einstellung.mailAn
                ? "Eine Mail geht nur hinaus, wenn ein Gast den Bildschirm wirklich gesehen hat und der Shop ihn auch beim stillen zweiten Anlauf nicht wegbekommen hat. Je Termin einmal."
                : "Es wird weiter jede Meldung aufgezeichnet und hier angezeigt, aber keine Mail verschickt."}
              {einstellung.grund && <div className="mt-1">{einstellung.grund}</div>}
              <div className="mt-1 text-xs">
                Zuletzt geändert {vorZeit(einstellung.geaendertAm)}
                {einstellung.geaendertVon ? ` von ${einstellung.geaendertVon}` : ""}
              </div>
            </div>
          </div>
          <input type="hidden" name="an" value={einstellung.mailAn ? "aus" : "an"} />
          <button type="submit" className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell">
            {einstellung.mailAn ? "Warnmails abschalten" : "Warnmails wieder einschalten"}
          </button>
        </form>

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
          technik.map((t) => (
            <TechnikKarte key={t.id} stoerung={t} termin={t.eventId ? (spielplan.get(t.eventId) ?? null) : null} />
          ))
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
function TechnikKarte({
  stoerung,
  termin,
}: {
  stoerung: TechnikStoerung;
  /** Aus dem Spielplan nachgeschlagen, falls es den Termin dort gibt. */
  termin: Vorstellungstermin | null;
}) {
  const erledigt = Boolean(stoerung.erledigtAm);
  const farbe = erledigt ? "var(--text-leise)" : "var(--blocker)";
  // Der Weg zur Behebung führt immer über Ditix, also gleich dorthin verlinken:
  // auf die Ticketseite des Termins, wo Preise und Verkaufszeiten stehen.
  const ditix = ditixVerkaufLink(stoerung.eventId);
  const ditixTickets = ditixTicketsLink(stoerung.eventId);

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
            {/* Das Entscheidende zuerst: Hat ein Gast das wirklich gesehen? */}
            <span
              className="rounded-full border px-2 py-px text-xs"
              style={{
                color: stoerung.gesehenAnzahl > 0 ? "var(--blocker)" : "var(--text-leise)",
                borderColor: stoerung.gesehenAnzahl > 0 ? "var(--blocker)" : "var(--linie)",
              }}
            >
              {stoerung.gesehenAnzahl === 0
                ? "kein Gast hat es gesehen"
                : stoerung.gesehenAnzahl === 1
                  ? "ein Gast hat es gesehen"
                  : `${stoerung.gesehenAnzahl} Gäste haben es gesehen`}
            </span>
            {stoerung.behobenAm && (
              <span className="rounded-full border px-2 py-px text-xs" style={{ color: "var(--gut)", borderColor: "var(--gut)" }}>
                ging danach wieder{stoerung.behobenWie ? `, ${stoerung.behobenWie}` : ""}
              </span>
            )}
          </div>

          <div className="mt-2 text-xl font-semibold tracking-tight">
            {termin
              ? `${datumMitWochentag(termin.datum)}, ${termin.uhrzeit} Uhr`
              : (stoerung.showName ?? "Unbekannte Show")}
          </div>
          <div className="text-sm">
            {termin ? termin.name : (stoerung.eventZeit ?? "Termin unbekannt")}
            {termin && stoerung.eventZeit && !stoerung.eventZeit.includes(termin.uhrzeit) && (
              <span className="text-leise"> · gemeldet als: {stoerung.eventZeit}</span>
            )}
          </div>

          <p className="mt-3 max-w-prose rounded border border-linie bg-white/40 px-3 py-2 text-sm text-leise">
            {stoerung.gesehenAnzahl > 0 && (
              <span className="mb-1 block text-text">{wasDerGastSah(stoerung)}</span>
            )}
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
                Verkaufszeitraum in Ditix
              </a>
              {ditixTickets && (
                <a href={ditixTickets} target="_blank" rel="noreferrer" className="text-sm underline hover:text-gold-dunkel">
                  Ticketarten und Preise
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
