import Link from "next/link";
import { holeLeads, lageDesLeads, LEAD_STATUS, type Lead } from "@/lib/shop/leads";
import { leadSpeichern, leadStaende, leadZuVorgang, type LeadStand } from "@/lib/db/buero";
import { vorZeit } from "@/components/Status";

export const metadata = { title: "Anfragen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ lage?: string; lead?: string }>;
}) {
  const { lage, lead: gesuchterLead } = await searchParams;

  let leads: Lead[] = [];
  let fehler: string | null = null;
  try {
    leads = await holeLeads();
  } catch (e) {
    fehler = e instanceof Error ? e.message : "Unbekannter Fehler";
  }

  const staende = await leadStaende();

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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Anfragen</h1>
        <p className="mt-1 text-sm text-leise">
          Was über Meta und den Webshop hereinkommt. Stand setzen, Notiz schreiben, und aus einer
          ernsthaften Anfrage einen Vorgang machen.
        </p>
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
              <button
                type="submit"
                className="rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
              >
                Vorgang anlegen
              </button>
            </form>
          )}
        </div>
      </div>

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
