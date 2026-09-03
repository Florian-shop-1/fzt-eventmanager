import Link from "next/link";
import { planbareAbende } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { planeAbend } from "@/lib/seating/abend";
import {
  gruppenZusammenlegen,
  plaetzeFreigeben,
  sitzplanAufheben,
  sitzplanFestlegen,
  zusammenlegungAufheben,
} from "@/lib/db/aktionen";
import { AbendSitzplan } from "@/components/AbendSitzplan";
import { datumKurz, vorZeit } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { planOhnePreise } from "@/lib/seating/ohnePreise";
import { DruckKnopf } from "@/components/DruckKnopf";
import { Druckkopf } from "@/components/Druckkopf";
import type { Buchungsgruppe } from "@/lib/domain/types";

export const metadata = { title: "Sitzplan | FZT Eventmanager" };
export const dynamic = "force-dynamic";

export default async function SitzplanSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string }>;
}) {
  const { abend, monat } = await searchParams;
  // Osman plant die Plätze, sieht aber keine Beträge. Entfernt wird das
  // auf dem Server, nicht per Gestaltung: sonst gingen die Zahlen trotzdem
  // mit an den Browser.
  const benutzer = await angemeldeterBenutzer();
  const kaufmaennisch = benutzer ? darfKaufmaennisches(benutzer.rolle) : false;
  const termine = await planbareAbende();
  // Welcher Abend gezeigt wird, entscheidet an einer Stelle für alle
  // Seiten: Adresse, dann der zuletzt angesehene Abend, dann heute.
  const { gewaehlt, monat: aufgeschlagenerMonat, heute } = await waehleAbend(termine, {
    abend,
    monat,
  });

  const gewaehlterAbend = termine.find((t) => t.ditixEventId === gewaehlt);

  return (
    <div className="space-y-6">
      <Druckkopf
        titel="Sitzplan Magicuisine"
        untertitel={
          gewaehlterAbend
            ? `${datumKurz(gewaehlterAbend.datum)}, ${gewaehlterAbend.uhrzeit} Uhr · ${gewaehlterAbend.name}`
            : undefined
        }
      />

      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sitzplan Magicuisine</h1>
          <p className="mt-1 text-sm text-leise">
            Firmengruppen in die Logen, Buchungen aus dem Webshop auf die Eventgalerie. Das
            Programm schlägt vor, entschieden wird von Hand.
          </p>
        </div>
        <DruckKnopf text="Sitzplan drucken" hinweis="Für den Service am Abend." />
      </header>

      {termine.length === 0 ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
          <div className="font-medium">Noch keine Abende mit Gästen</div>
          <p className="mx-auto mt-1 max-w-md text-leise">
            Sobald ein Vorgang mit Termin angelegt ist, kann hier geplant werden.
          </p>
          <Link
            href="/vorgaenge/neu"
            className="mt-4 inline-block rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
          >
            Anfrage aufnehmen
          </Link>
        </div>
      ) : (
        <>
          <AbendAuswahl
            basisPfad="/sitzplan"
            gewaehlt={gewaehlt}
            monat={aufgeschlagenerMonat}
        heute={heute}
            abende={termine.map((t) => ({
              ditixEventId: t.ditixEventId,
              datum: t.datum,
              uhrzeit: t.uhrzeit,
              uhrzeiten: t.uhrzeiten,
              name: t.name,
              betont: t.ausVorgaengen > 0,
              hinweis:
                `${t.gaeste} ${t.gaeste === 1 ? "Gast" : "Gäste"}` +
                (t.planFestgelegt ? " · festgelegt" : ""),
            }))}
          />

          {gewaehlt && (
            <AbendAnsicht ditixEventId={gewaehlt} kaufmaennisch={kaufmaennisch} />
          )}
        </>
      )}
    </div>
  );
}

async function AbendAnsicht({
  ditixEventId,
  kaufmaennisch,
}: {
  ditixEventId: string;
  kaufmaennisch: boolean;
}) {
  const { kopf, gruppen, varianten } = await planeAbend(ditixEventId);
  if (!kopf) return null;

  const zeigVarianten = kaufmaennisch ? varianten : varianten.map(planOhnePreise);
  const zeigFestgelegt = kopf.festgelegt
    ? kaufmaennisch
      ? kopf.festgelegt.plan
      : planOhnePreise(kopf.festgelegt.plan)
    : null;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-linie bg-flaeche p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {datumKurz(kopf.datum)}, {kopf.uhrzeit} Uhr · {kopf.show}
            </h2>
            <p className="mt-0.5 text-sm text-leise">
              {gruppen.ausVorgaengen} {gruppen.ausVorgaengen === 1 ? "Gruppe" : "Gruppen"} aus
              Vorgängen, {gruppen.ausShop} aus dem Webshop
            </p>
          </div>

          {kopf.festgelegt && (
            <div className="text-right text-xs">
              <div style={{ color: "var(--gut)" }} className="font-medium">
                Plan festgelegt
              </div>
              <div className="text-leise">
                {kopf.festgelegt.von}, {vorZeit(kopf.festgelegt.am)}
              </div>
              <form action={sitzplanAufheben.bind(null, ditixEventId)}>
                <button type="submit" className="text-leise underline hover:text-text">
                  wieder öffnen
                </button>
              </form>
            </div>
          )}
        </div>

        {gruppen.shopFehler && (
          <p className="mt-3 rounded border border-warnung bg-warnung-hell px-3 py-2 text-xs">
            Die Buchungen aus dem Webshop konnten nicht geladen werden, es fehlen also Gäste.
            <br />
            {gruppen.shopFehler}
          </p>
        )}
      </section>

      {(gruppen.vorschlaege.length > 0 || gruppen.zusammenlegungen.length > 0) && (
        <section className="rounded-lg border border-linie bg-flaeche p-5">
          <h3 className="mb-1 text-sm font-semibold">Gruppen zusammenlegen</h3>
          <p className="mb-3 text-xs text-leise">
            Bestellt jemand zweimal, sind das für den Shop zwei Bestellungen, am Tisch aber eine
            Gruppe.
          </p>

          {gruppen.vorschlaege.map((v) => (
            <form
              key={v.gruppenIds.join()}
              action={gruppenZusammenlegen.bind(null, ditixEventId, v.gruppenIds, v.name)}
              className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded border border-warnung bg-warnung-hell px-3 py-2 text-sm"
            >
              <span>
                <strong>{v.name}</strong> hat {v.gruppenIds.length} Bestellungen mit zusammen{" "}
                {v.personen} Menüs. Dieselbe Gruppe?
              </span>
              <button
                type="submit"
                className="shrink-0 rounded-md border border-gold bg-gold-hell px-3 py-1.5 text-xs font-medium text-gold-dunkel hover:bg-gold hover:text-white"
              >
                An einen Tisch setzen
              </button>
            </form>
          ))}

          {gruppen.zusammenlegungen.map((z) => (
            <form
              key={z.id}
              action={zusammenlegungAufheben.bind(null, z.id)}
              className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded border border-linie px-3 py-2 text-sm"
            >
              <span>
                <strong>{z.name}</strong>: {z.gruppenIds.length} Bestellungen zusammengelegt,{" "}
                {z.personen} Personen
              </span>
              <button type="submit" className="shrink-0 text-xs text-leise underline hover:text-text">
                wieder trennen
              </button>
            </form>
          ))}
        </section>
      )}

      {kaufmaennisch && <Reservierungen gruppen={gruppen.gruppen} />}

      {gruppen.gruppen.length === 0 ? (
        <div className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Für diesen Abend sind noch keine Gäste mit Menü erfasst.
        </div>
      ) : (
        <AbendSitzplan
          ditixEventId={ditixEventId}
          varianten={zeigVarianten}
          festgelegt={zeigFestgelegt}
          festlegen={sitzplanFestlegen}
        />
      )}
    </div>
  );
}

/**
 * Zeigt, welche Gruppen des Abends nur reserviert sind, und lässt ihre
 * Plätze wieder freigeben. Nur Gruppen aus Vorgängen erscheinen hier:
 * Webshop-Buchungen sind bezahlt und werden über Ditix storniert.
 */
function Reservierungen({ gruppen }: { gruppen: Buchungsgruppe[] }) {
  const offen = gruppen.filter((g) => g.sicherheit === "reserviert" && g.vorgangId);
  if (offen.length === 0) return null;

  const personen = offen.reduce((s, g) => s + g.personen, 0);

  // Ein Vorgang kann mehrere Gruppen haben. Freigegeben wird der ganze
  // Vorgang, deshalb hier nach Vorgang zusammenfassen.
  const jeVorgang = new Map<string, { nummer: string; namen: string[]; personen: number }>();
  for (const g of offen) {
    const vorhanden = jeVorgang.get(g.vorgangId!) ?? {
      nummer: g.vorgangNummer ?? "",
      namen: [],
      personen: 0,
    };
    vorhanden.namen.push(g.name);
    vorhanden.personen += g.personen;
    jeVorgang.set(g.vorgangId!, vorhanden);
  }

  return (
    <section className="rounded-lg border border-warnung bg-warnung-hell p-5">
      <h3 className="text-sm font-semibold" style={{ color: "var(--warnung)" }}>
        Reserviert, noch nicht bezahlt
      </h3>
      <p className="mb-3 mt-1 text-xs text-leise">
        {personen} {personen === 1 ? "Platz ist" : "Plätze sind"} vorgemerkt, aber noch nicht fest
        gebucht. Entscheidet sich die Firma gegen uns, hier freigeben. Der Vorgang bleibt mit seiner
        Geschichte erhalten.
      </p>

      {[...jeVorgang.entries()].map(([vorgangId, v]) => (
        <form
          key={vorgangId}
          action={plaetzeFreigeben.bind(null, vorgangId)}
          className="mb-2 flex flex-wrap items-center gap-3 rounded border border-linie bg-flaeche px-3 py-2 text-sm last:mb-0"
        >
          <span className="grow">
            <Link href={`/vorgaenge/${vorgangId}`} className="font-medium hover:text-gold-dunkel">
              {v.namen.join(", ")}
            </Link>{" "}
            <span className="text-leise">
              · {v.personen} {v.personen === 1 ? "Person" : "Personen"} · {v.nummer}
            </span>
          </span>
          <input
            name="grund"
            placeholder="Grund, etwa: Firma hat abgesagt"
            className="w-64 rounded border border-linie bg-hintergrund px-2 py-1 text-xs"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--warnung)", color: "var(--warnung)" }}
          >
            Plätze freigeben
          </button>
        </form>
      ))}
    </section>
  );
}
