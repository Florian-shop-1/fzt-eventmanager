import Link from "next/link";
import { redirect } from "next/navigation";
import { ABGEHAKT, holeLeads, istStoerung, lageDesLeads, LEAD_STATUS, type Lead } from "@/lib/shop/leads";
import { altbestandAbhaken, leadSpeichern, leadStaende, leadZuVorgang, type LeadStand } from "@/lib/db/buero";
import { anfragenStand } from "@/lib/db/anfragen";
import { Absendeknopf } from "@/components/Absendeknopf";
import { vorZeit } from "@/components/Status";
import { leitfadenFuer } from "@/lib/shop/anfrage-leitfaden";

export const metadata = { title: "Anfragen | FZT Eventmanager" };
export const dynamic = "force-dynamic";
/*
  Aus einer Anfrage einen Vorgang zu machen schlägt nebenbei die
  Firmenanschrift im Netz nach. Das darf dauern. Ohne diese Zeile
  schneidet Vercel die Funktion nach der Voreinstellung ab, und beim
  Klick auf "Vorgang anlegen" passiert sichtbar nichts (Florian,
  28.10.2026). Die Suche selbst hat zusätzlich eine eigene Frist.
*/
export const maxDuration = 60;

/**
 * Anfragen aus Meta und dem Webshop.
 *
 * Bisher landete jede Anfrage in einer Google-Tabelle, und die Mail an
 * Kevin verlinkte dorthin. Hier steht dieselbe Liste, aber mit dem, was
 * danach passieren muss: Stand setzen, Notiz schreiben, und aus einer
 * ernsthaften Anfrage einen Vorgang machen.
 *
 * Der Stand wird in unserer Datenbank geführt, nicht in der Tabelle: Dort
 * hat das Programm keinen Schreibzugriff. Wo hier etwas geändert wurde,
 * gilt unser Wert, sonst der aus der Tabelle.
 *
 * Eine einzelne Anfrage lässt sich verlinken: /leads?lead=<Schlüssel>.
 * Genau dorthin kann die Benachrichtigungsmail künftig zeigen.
 */
export default async function LeadsSeite({
  searchParams,
}: {
  searchParams: Promise<{ lage?: string; lead?: string; abgehakt?: string }>;
}) {
  const { lage, lead: gesuchterLead, abgehakt } = await searchParams;

  let leads: Lead[] = [];
  let fehler: string | null = null;
  try {
    // Störungsmeldungen laufen über denselben Weg herein, gehören aber
    // nicht in den Vertrieb. Sie haben eine eigene Seite.
    leads = (await holeLeads()).filter((l) => !istStoerung(l));
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const staende = await leadStaende();
  /*
    Wie viele Anfragen niemand angefasst hat, und wie viele davon von vor
    heute sind. Letztere kann der Knopf unten in einem Rutsch abhaken
    (Florian, 28.10.2026).
  */
  const stand = await anfragenStand().catch(() => ({ neu: 0, altbestand: 0, neueste: null }));

  // Unser Stand hat Vorrang vor dem aus der Tabelle.
  const angereichert = leads.map((l) => {
    const stand = staende.get(l.schluessel);
    return {
      ...l,
      status: stand?.status ?? l.status,
      kommentar: stand?.kommentar ?? l.kommentar,
      ablehnungsgrund: stand?.ablehnungsgrund ?? l.ablehnungsgrund,
      stand,
    };
  });

  const offen = angereichert.filter((l) => lageDesLeads(l.status) === "offen");
  const gewonnen = angereichert.filter((l) => lageDesLeads(l.status) === "gewonnen");

  const gewaehlteLage = lage ?? "offen";
  const sichtbar =
    gesuchterLead !== undefined
      ? angereichert.filter((l) => l.schluessel === gesuchterLead)
      : gewaehlteLage === "alle"
        ? angereichert
        : angereichert.filter((l) => lageDesLeads(l.status) === gewaehlteLage);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anfragen</h1>
          <p className="mt-1 text-sm text-leise">
            Was über Meta und den Webshop hereinkommt. Stand setzen, Notiz schreiben, und aus einer
            ernsthaften Anfrage einen Vorgang machen.
          </p>
        </div>
        <Link
          href="/leads/brevo"
          className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
        >
          Zu Brevo übertragen
        </Link>
      </header>

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Liste nicht lesbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      {gesuchterLead !== undefined ? (
        <div className="flex items-center gap-3 rounded-lg border border-gold bg-gold-hell px-4 py-3 text-sm">
          <span>Es wird eine einzelne Anfrage gezeigt.</span>
          <Link href="/leads" className="underline">
            Ganze Liste öffnen
          </Link>
        </div>
      ) : (
        <>
          {abgehakt !== undefined && (
            <p
              className="rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
            >
              {abgehakt === "1"
                ? "Eine Altanfrage wurde abgehakt."
                : `${abgehakt} Altanfragen wurden abgehakt.`}{" "}
              Sie stehen jetzt unter „Erledigt“ und sind nicht gelöscht. Wer eine davon doch noch
              bearbeiten will, setzt den Stand an ihrer Karte wieder um.
            </p>
          )}

          {/*
            Der Knopf für den Altbestand.

            Er erscheint nur, solange es etwas abzuhaken gibt, und er
            steht hinter einem Aufklapper: Das ist eine Massenänderung,
            die soll niemand im Vorbeigehen anklicken.
          */}
          {stand.altbestand > 0 && (
            <details className="rounded-lg border border-linie px-4 py-3 text-sm">
              <summary className="cursor-pointer">
                <strong>{stand.altbestand}</strong>{" "}
                {stand.altbestand === 1 ? "Anfrage von früher hat" : "Anfragen von früher haben"} noch
                keinen Stand. In einem Rutsch abhaken?
              </summary>
              <p className="mt-3 max-w-prose text-leise">
                Abgehakt wird nur, was noch auf „Anfrage eingegangen“ steht und vor heute
                hereingekommen ist. Was heute kommt, bleibt stehen. Die Anfragen bekommen den Stand
                „{ABGEHAKT}“, rutschen damit unter „Erledigt“ und verschwinden aus der roten
                Zahl am Menü. Gelöscht wird nichts.
              </p>
              <form
                action={async () => {
                  "use server";
                  const anzahl = await altbestandAbhaken();
                  redirect(`/leads?abgehakt=${anzahl}`);
                }}
              >
                <button
                  type="submit"
                  className="mt-3 rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell"
                >
                  {stand.altbestand} {stand.altbestand === 1 ? "Anfrage" : "Anfragen"} abhaken
                </button>
              </form>
            </details>
          )}

          <section className="flex flex-wrap gap-4">
            <Kachel zahl={offen.length} was="offen" hinweis="warten auf Antwort" betont />
            <Kachel zahl={gewonnen.length} was="gewonnen" hinweis="daraus wurde ein Event" />
            <Kachel zahl={angereichert.length} was="insgesamt" hinweis="seit Beginn der Liste" />
          </section>

          <nav className="flex flex-wrap gap-2 text-sm">
            {[
              { wert: "offen", text: `Offen (${offen.length})` },
              { wert: "gewonnen", text: `Gewonnen (${gewonnen.length})` },
              { wert: "erledigt", text: "Erledigt" },
              { wert: "alle", text: `Alle (${angereichert.length})` },
            ].map((f) => (
              <Link
                key={f.wert}
                href={`/leads?lage=${f.wert}`}
                className={`rounded-md border px-3 py-1.5 ${
                  gewaehlteLage === f.wert ? "border-gold bg-gold-hell" : "border-linie"
                }`}
              >
                {f.text}
              </Link>
            ))}
          </nav>
        </>
      )}

      {sichtbar.length === 0 ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
          <div className="font-medium">Keine Anfragen in dieser Ansicht</div>
          <p className="mt-1 text-leise">
            {gewaehlteLage === "offen"
              ? "Alles beantwortet."
              : "Wechsle oben die Ansicht, um andere Anfragen zu sehen."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sichtbar.map((l) => (
            <Karte key={l.schluessel} lead={l} stand={l.stand} />
          ))}
        </div>
      )}
    </div>
  );
}

function Leitfaden({ lead }: { lead: Lead }) {
  const l = leitfadenFuer(lead);

  return (
    <details className="mt-4 rounded-lg border px-4 py-3" open style={{ borderColor: "var(--gold)", background: "var(--gold-hell)" }}>
      <summary className="cursor-pointer text-sm font-semibold">Vor dem Anruf</summary>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-leise">Das steht schon da</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {l.bekannt.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-leise">
            Spiegle es im Gespräch zurück, statt es noch einmal abzufragen.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-leise">Das fehlt fürs Angebot</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {l.fragen.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-linie pt-2 text-xs text-leise">
        {l.merken.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
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
      className="rounded-lg border px-5 py-4"
      style={{
        borderColor: betont ? "var(--gold)" : "var(--linie)",
        background: betont ? "var(--gold-hell)" : "var(--flaeche)",
      }}
    >
      <div className="text-4xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm font-medium">{was}</div>
      <div className="mt-0.5 text-xs text-leise">{hinweis}</div>
    </div>
  );
}

function Karte({ lead, stand }: { lead: Lead; stand: LeadStand | undefined }) {
  const lage = lageDesLeads(lead.status);
  const farbe =
    lage === "gewonnen" ? "var(--gut)" : lage === "erledigt" ? "var(--text-leise)" : "var(--gold-dunkel)";

  return (
    <article className="rounded-lg border border-linie bg-flaeche p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{lead.name || "Ohne Namen"}</h2>
            {lead.firma && <span className="text-sm text-leise">{lead.firma}</span>}
            <span
              className="rounded-full border px-2 py-px text-xs font-medium"
              style={{ color: farbe, borderColor: farbe }}
            >
              {lead.status || "ohne Stand"}
            </span>
            {lead.anfragetyp && (
              <span className="rounded-full border border-linie px-2 py-px text-xs text-leise">
                {lead.anfragetyp}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-leise">
            {lead.eingang && <span>Eingang {lead.eingang}</span>}
            {lead.teilnehmer && lead.teilnehmer !== "-" && <span>{lead.teilnehmer} Personen</span>}
            {lead.wunschdatum && lead.wunschdatum !== "-" && <span>Wunsch {lead.wunschdatum}</span>}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {lead.email && !/calendly/i.test(lead.email) ? (
              <a href={`mailto:${lead.email}`} className="underline hover:text-gold-dunkel">
                {lead.email}
              </a>
            ) : (
              lead.email && <span className="text-leise">{lead.email}</span>
            )}
            {lead.telefon && !/calendly/i.test(lead.telefon) ? (
              <a href={`tel:${lead.telefon.replace(/\s/g, "")}`} className="underline hover:text-gold-dunkel">
                {lead.telefon}
              </a>
            ) : (
              lead.telefon && <span className="text-leise">{lead.telefon}</span>
            )}
          </div>

          {lead.herkunft && <div className="mt-1 text-xs text-leise">Kam über {lead.herkunft}</div>}

          {stand?.geaendertVon && stand.geaendertAm && (
            <div className="mt-2 text-xs text-leise">
              Zuletzt bearbeitet von {stand.geaendertVon}, {vorZeit(stand.geaendertAm)}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          {stand?.vorgangId ? (
            <Link
              href={`/vorgaenge/${stand.vorgangId}`}
              className="inline-block rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel"
            >
              Zum Vorgang
            </Link>
          ) : (
            <form action={leadZuVorgang.bind(null, lead.schluessel)}>
              <input type="hidden" name="name" value={lead.name} />
              <input type="hidden" name="email" value={lead.email} />
              <input type="hidden" name="telefon" value={lead.telefon} />
              <input type="hidden" name="personen" value={lead.teilnehmer} />
              <input type="hidden" name="wunschdatum" value={lead.wunschdatum} />
              <input type="hidden" name="anfragetyp" value={lead.anfragetyp} />
              {/* Die Anmerkung des Kunden landet als Notiz im Vorgang. */}
              <input type="hidden" name="kommentar" value={lead.kommentar} />
              <Absendeknopf text="Vorgang anlegen" laeuftText="Wird angelegt..." />
            </form>
          )}
        </div>
      </div>

      {/*
        Der Leitfaden fürs erste Telefonat.

        "sobald eine Anfrage da ist, zuerst mal den Kunden anrufen"
        (Florian, 14.10.2026). Links steht, was er schon gesagt hat,
        rechts, was fürs Angebot noch fehlt. Offen aufgeklappt, denn
        gebraucht wird er genau einmal: vor dem Anruf.
      */}
      <Leitfaden lead={lead} />

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-leise">
          Stand ändern und Notiz schreiben
        </summary>
        <form
          action={leadSpeichern.bind(null, lead.schluessel)}
          className="mt-3 space-y-2 rounded border border-linie p-3"
        >
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Stand</span>
            <select name="status" defaultValue={lead.status}>
              {[...new Set([lead.status, ...LEAD_STATUS])].filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Kommentar</span>
            <input
              type="text"
              name="kommentar"
              defaultValue={lead.kommentar}
              placeholder="Was war, was ist der nächste Schritt?"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">
              Grund, falls es nichts wird
            </span>
            <input
              type="text"
              name="ablehnungsgrund"
              defaultValue={lead.ablehnungsgrund}
              placeholder="z.B. Termin ausgebucht, Budget zu klein"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-linie px-3 py-1.5 text-sm hover:border-gold"
          >
            Sichern
          </button>
        </form>
      </details>

      {(lead.kommentar || lead.ablehnungsgrund) && (
        <div className="mt-3 space-y-1 text-sm">
          {lead.kommentar && (
            <p className="border-l-4 border-linie pl-3 whitespace-pre-line">{lead.kommentar}</p>
          )}
          {lead.ablehnungsgrund && (
            <p className="text-leise">Grund: {lead.ablehnungsgrund}</p>
          )}
        </div>
      )}
    </article>
  );
}
