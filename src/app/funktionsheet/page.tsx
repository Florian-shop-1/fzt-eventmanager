import Link from "next/link";
import { alleShowtage } from "@/lib/seating/abendliste";
import { waehleAbend } from "@/lib/seating/abendwahl";
import { planeAbend } from "@/lib/seating/abend";
import { holeKuechenblatt } from "@/lib/kueche/blatt";
import { artikel } from "@/lib/domain/artikel";
import { eur } from "@/lib/domain/pricing";
import { vorOrtKassiert } from "@/lib/db/aktionen";
import { kapazitaet, LOGEN, EVENTGALERIE_TISCHE } from "@/lib/domain/venue";
import { datumKurz } from "@/components/Status";
import { AbendAuswahl } from "@/components/AbendAuswahl";
import { Logo } from "@/components/Logo";
import { DruckKnopf } from "@/components/DruckKnopf";
import { ShowSchild, Tagesablauf } from "@/components/Tagesablauf";
import { zeitpunkt } from "@/lib/zeit";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import type { MenueVariante } from "@/lib/domain/types";
import type { Plan } from "@/lib/seating/types";

export const metadata = { title: "Funktionsheet | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const VARIANTEN: Array<{ wert: MenueVariante; label: string }> = [
  { wert: "classic", label: "Classic" },
  { wert: "sea", label: "Sea" },
  { wert: "veggy", label: "Veggy" },
  { wert: "kids", label: "Kids" },
];

export default async function FunktionsheetSeite({
  searchParams,
}: {
  searchParams: Promise<{ abend?: string; monat?: string }>;
}) {
  const { abend, monat } = await searchParams;
  // Wie viele Karten verkauft sind, geht die Gastronomie nichts an.
  // Sie braucht Menüs, Getränke und Tische, sonst nichts.
  const benutzer = await angemeldeterBenutzer();
  const kaufmaennisch = benutzer ? darfKaufmaennisches(benutzer.rolle) : false;
  // Jeder Spieltag bekommt ein Funktionsheet, auch ohne Menügäste:
  // Bar, Foyer und Service laufen trotzdem.
  const termine = await alleShowtage();
  // Ohne Abend in der Adresse: der erste des gewaehlten Monats.
  // Welcher Abend gezeigt wird, entscheidet an einer Stelle für alle
  // Seiten: Adresse, dann der zuletzt angesehene Abend, dann heute.
  const { gewaehlt, monat: aufgeschlagenerMonat, heute } = await waehleAbend(termine, {
    abend,
    monat,
  });

  if (!gewaehlt) {
    return (
      <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center text-sm">
        <div className="font-medium">Keine Vorstellungen gefunden</div>
        <p className="mt-1 text-leise">
          Der Spielplan aus dem Ticketshop ist gerade nicht erreichbar. Ohne ihn weiß das
          Programm nicht, an welchen Tagen gespielt wird.
        </p>
      </div>
    );
  }

  const [blatt, { kopf, varianten }] = await Promise.all([
    holeKuechenblatt(gewaehlt),
    planeAbend(gewaehlt),
  ]);
  if (!blatt || !kopf) return null;

  const plan = kopf.festgelegt?.plan ?? varianten[0] ?? null;

  // Die Abschnitte werden fortlaufend nummeriert. Manche fallen weg,
  // deshalb zählt ein Zähler mit, statt die Nummern von Hand zu rechnen.
  let nr = 0;
  const nummer = () => `${++nr}.`;

  const vorOrt = blatt.firmen.filter((f) => f.vorOrtKassieren);

  return (
    <div className="space-y-6">
      <AbendAuswahl
        basisPfad="/funktionsheet"
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
            t.gaeste > 0
              ? `${t.gaeste} am Tisch`
              : t.showgaeste > 0
                ? "nur Show"
                : "noch nichts gebucht",
        }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <DruckKnopf
          text="Funktionsheet drucken"
          hinweis="Eine Seite, Hochformat. Zum Aushängen in der Küche."
        />
        <div className="flex gap-4">
          <Link
            href={`/einlassliste?abend=${gewaehlt}`}
            className="text-sm text-leise underline hover:text-text"
          >
            Einlassliste
          </Link>
          <Link
            href={`/sitzplan?abend=${gewaehlt}`}
            className="text-sm text-leise underline hover:text-text"
          >
            Sitzplan ändern
          </Link>
        </div>
      </div>

      <article className="rounded-lg border border-linie bg-flaeche p-8 print:border-0 print:p-0">
        <header className="mb-6 border-b-2 border-text pb-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Logo hoehe={42} />
            <div className="text-right">
              <h1 className="text-2xl font-semibold tracking-tight">Funktionsheet</h1>
              <div className="text-xs text-leise">Stand: {zeitpunkt(new Date())}</div>
            </div>
          </div>
          <div className="mt-1 text-lg">
            {datumKurz(blatt.datum)} ·{" "}
            {blatt.shows.map((s) => `${s.uhrzeit} ${s.name}`).join("  ·  ")}
          </div>
          {blatt.shopFehler && (
            <div
              className="mt-3 border-2 px-3 py-2 text-sm"
              style={{ borderColor: "var(--blocker)", color: "var(--blocker)" }}
            >
              <strong>Achtung, dieses Blatt ist unvollständig.</strong> Die Buchungen aus dem
              Webshop konnten nicht gelesen werden. Alles, was hier steht, kommt nur aus den
              Firmenvorgängen. Nicht als Grundlage für den Einkauf verwenden, bevor das behoben
              ist.
              <div className="mt-1 text-xs">{blatt.shopFehler}</div>
            </div>
          )}
          <div className="mt-1 text-sm text-leise">
            {kaufmaennisch
              ? blatt.showgaeste > 0
                ? `${blatt.showgaeste} verkaufte Showtickets, davon ${blatt.gesamtMenues} mit Menü`
                : "Noch keine Tickets über den Webshop verkauft"
              : `${blatt.gesamtMenues} ${blatt.gesamtMenues === 1 ? "Gast isst" : "Gäste essen"} bei uns`}
          </div>
          {!kopf.festgelegt && blatt.gesamtMenues > 0 && (
            <div className="mt-2 text-sm" style={{ color: "var(--warnung)" }}>
              Sitzplan noch nicht festgelegt. Die Verteilung unten ist ein Vorschlag und kann sich
              noch ändern.
            </div>
          )}
        </header>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
            {nummer()} Menüs
          </h2>
          {blatt.gesamtMenues === 0 && (
            <p
              className="mb-3 border-l-4 pl-3 py-1 text-sm"
              style={{ borderColor: "var(--warnung)" }}
            >
              An diesem Abend hat niemand ein Menü gebucht. Für die Küche ist nichts zu kochen,
              Bar und Foyer laufen aber wie immer.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="text-5xl font-semibold tabular-nums">{blatt.gesamtMenues}</div>
              <div className="text-sm text-leise">Menüs insgesamt</div>
              {blatt.reservierteMenues > 0 && (
                <div
                  className="mt-2 max-w-64 border-l-4 pl-3 text-sm"
                  style={{ borderColor: "var(--warnung)" }}
                >
                  Davon <strong>{blatt.reservierteMenues}</strong> nur reserviert und noch nicht
                  bezahlt. Diese Gäste können noch wegfallen.
                </div>
              )}
            </div>
            <table className="text-sm">
              <tbody>
                {VARIANTEN.map(({ wert, label }) => (
                  <tr key={wert}>
                    <td className="pr-6 py-0.5">{label}</td>
                    <td className="py-0.5 text-right text-lg font-semibold tabular-nums">
                      {blatt.gesamt[wert]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {blatt.menuesJeShow.filter((m) => m.menues > 0).length > 1 && (
            <div className="mt-6">
              <Tagesablauf anteile={blatt.menuesJeShow} gesamtMenues={blatt.gesamtMenues} />
            </div>
          )}
        </section>

        {blatt.unvertraeglichkeiten.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-leise">
              {nummer()} Unverträglichkeiten und Sonderwünsche
            </h2>
            <ul className="space-y-1.5 text-sm">
              {blatt.unvertraeglichkeiten.map((u) => (
                <li
                  key={u.gruppe}
                  className="border-l-4 pl-3 py-1"
                  style={{ borderColor: "var(--warnung)" }}
                >
                  <strong>{u.gruppe}</strong>: {u.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
            {nummer()} Wer sitzt wo
          </h2>
          {blatt.gesamtMenues === 0 ? (
            <p className="text-sm text-leise">
              Kein Gedeck nötig. Logen und Eventgalerie bleiben an diesem Abend frei.
            </p>
          ) : plan ? (
            <Sitzverteilung
              plan={plan}
              mehrereShows={blatt.menuesJeShow.filter((m) => m.menues > 0).length > 1}
            />
          ) : (
            <p className="text-sm text-leise">Für diesen Abend liegt noch keine Verteilung vor.</p>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
            {nummer()} Getränke
          </h2>
          <Getraenke blatt={blatt} />
        </section>

        {vorOrt.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
              {nummer()} Vor Ort kassieren
            </h2>
            <div
              className="border-2 p-4"
              style={{ borderColor: "var(--warnung)" }}
            >
              <p className="mb-3 text-sm">
                Diese Gruppen haben noch nicht bezahlt. Bitte am Tisch kassieren.
              </p>
              <table className="w-full text-sm">
                <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
                  <tr>
                    <th className="pb-1 font-medium">Gruppe</th>
                    <th className="w-24 pb-1 text-right font-medium">Gäste</th>
                    <th className="w-32 pb-1 text-right font-medium">Betrag</th>
                    <th className="w-40 pb-1 font-medium">Kassiert</th>
                  </tr>
                </thead>
                <tbody>
                  {vorOrt.map((f) => (
                    <tr key={f.vorgangId + f.gruppe} className="border-b border-linie last:border-0">
                      <td className="py-2">
                        <div className="font-medium">{f.gruppe}</div>
                        {f.vorOrtHinweis && (
                          <div className="text-xs text-leise">{f.vorOrtHinweis}</div>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{f.personen}</td>
                      <td className="py-2 text-right text-base font-semibold tabular-nums">
                        {eur(f.vorOrtBetragCent)}
                      </td>
                      <td className="py-2">
                        {f.vorOrtKassiertAm ? (
                          <span className="text-xs" style={{ color: "var(--gut)" }}>
                            am {zeitpunkt(new Date(f.vorOrtKassiertAm))}
                            <br />
                            von {f.vorOrtKassiertVon}
                          </span>
                        ) : (
                          <span className="inline-block h-4 w-4 border border-text align-middle" />
                        )}
                        <KassiertKnopf
                          ditixEventId={gewaehlt}
                          gruppeId={f.gruppeId}
                          erledigt={Boolean(f.vorOrtKassiertAm)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm font-semibold">
                Summe: {eur(vorOrt.reduce((s, f) => s + f.vorOrtBetragCent, 0))}
              </p>
            </div>
          </section>
        )}

        {blatt.luecken.length > 0 && (
          <section
            className="mb-6 border-2 p-4"
            style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}
          >
            <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--warnung)" }}>
              Achtung: Menüzahl noch nicht vollständig
            </h2>
            <ul className="text-sm">
              {blatt.luecken.map((l) => (
                <li key={l.gruppe}>
                  <strong>{l.gruppe}</strong>: {l.personen} Gäste, aber {l.menues} Menüs erfasst
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-linie pt-3 text-xs text-leise">
          Florian Zimmer Theater GmbH, Neu-Ulm. Fragen zur Verteilung: im Programm unter Sitzplan
          änderbar.
        </footer>
      </article>
    </div>
  );
}

/** Zeigt Loge für Loge und die Eventgalerie, inklusive freier Plätze. */
function Sitzverteilung({
  plan,
  mehrereShows,
}: {
  plan: Plan;
  /** Nur an Tagen mit zwei Shows lohnt die Kennzeichnung. */
  mehrereShows: boolean;
}) {
  const belegung = new Map<
    number,
    {
      name: string;
      anteil: number;
      notstuhl: number;
      reserviert: boolean;
      show?: Plan["logen"][number]["show"];
    }
  >();
  for (const z of plan.logen) {
    let rest = z.personen;
    let restNotstuehle = z.notstuehle;

    for (const nummer of z.logenNummern) {
      const loge = LOGEN.find((l) => l.nummer === nummer)!;
      // Erst die regulären Gedecke füllen. Ein Zusatzstuhl kommt nur dort
      // dazu, wo sonst jemand stehen müsste.
      const hier = Math.min(rest, loge.plaetze);
      rest -= hier;

      const notstuhl = rest > 0 && restNotstuehle > 0 ? 1 : 0;
      restNotstuehle -= notstuhl;
      rest -= notstuhl;

      belegung.set(nummer, {
        show: z.show,
        name: z.gruppeName,
        anteil: hier + notstuhl,
        notstuhl,
        reserviert: z.sicherheit === "reserviert",
      });
    }
  }

  const galerieBelegt = plan.galerie.reduce((s, g) => s + g.personen, 0);
  const galerieFrei = kapazitaet("eventgalerie") - galerieBelegt;
  const tischeBelegt = new Set(plan.galerie.flatMap((g) => g.tischIds));

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
          <tr>
            <th className="w-24 pb-1 font-medium">Loge</th>
            <th className="pb-1 font-medium">Wer</th>
            <th className="w-28 pb-1 text-right font-medium">Gedecke</th>
          </tr>
        </thead>
        <tbody>
          {LOGEN.map((loge) => {
            const b = belegung.get(loge.nummer);
            return (
              <tr key={loge.id} className="border-b border-linie last:border-0">
                <td className="py-1.5 font-medium">Loge {loge.nummer}</td>
                <td className="py-1.5">
                  {b ? (
                    <>
                      {b.name}
                      {b.show && mehrereShows && (
                        <span className="ml-1.5 align-middle">
                          <ShowSchild uhrzeit={b.show.uhrzeit} vorDerShow={b.show.vorDerShow} />
                        </span>
                      )}
                      {b.reserviert && (
                        <span className="ml-1.5 text-xs" style={{ color: "var(--warnung)" }}>
                          (reserviert)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-leise">frei</span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {b ? (
                    <>
                      {b.anteil} von {loge.plaetze}
                      {b.notstuhl > 0 && " (mit Zusatzstuhl)"}
                      {b.notstuhl === 0 && b.anteil < loge.plaetze && (
                        <span className="text-leise"> ({loge.plaetze - b.anteil} frei)</span>
                      )}
                    </>
                  ) : (
                    <span className="text-leise">{loge.plaetze} frei</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div>
        <div className="mb-1 flex items-baseline justify-between border-b border-linie pb-1">
          <span className="text-sm font-medium">Eventgalerie</span>
          <span className="text-sm text-leise">
            {galerieBelegt} belegt, {galerieFrei} frei ·{" "}
            {EVENTGALERIE_TISCHE.length - tischeBelegt.size} Tische unbesetzt
          </span>
        </div>
        {plan.galerie.length === 0 ? (
          <p className="py-1 text-sm text-leise">Keine Gäste auf der Eventgalerie.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {plan.galerie.map((g) => (
                <tr key={g.gruppeId} className="border-b border-linie last:border-0">
                  <td className="py-1.5">
                    {g.gruppeName}
                    {g.show && mehrereShows && (
                      <span className="ml-1.5 align-middle">
                        <ShowSchild uhrzeit={g.show.uhrzeit} vorDerShow={g.show.vorDerShow} />
                      </span>
                    )}
                    {g.sicherheit === "reserviert" && (
                      <span className="ml-1.5 text-xs" style={{ color: "var(--warnung)" }}>
                        (reserviert)
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-leise">{g.tischBeschreibung}</td>
                  <td className="w-24 py-1.5 text-right tabular-nums">{g.personen} Pers.</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function sicherArtikelname(nummer: string): string {
  try {
    return artikel(nummer).bezeichnung;
  } catch {
    return nummer;
  }
}

/**
 * Der Getränketeil des Funktionsheets.
 *
 * Es gibt drei Sorten, und sie gelten an unterschiedlichen Orten zu
 * unterschiedlichen Zeiten. Genau daran hakt es im Betrieb, wenn jemand
 * mit einem Bändchen an der Bar im Saal steht, das nur fürs Foyer gilt.
 * Deshalb steht der Geltungsbereich hier bei jeder Sorte dabei.
 */
function Getraenke({
  blatt,
}: {
  blatt: NonNullable<Awaited<ReturnType<typeof holeKuechenblatt>>>;
}) {
  const flats = blatt.firmen.filter((f) => f.getraenkepauschalen.length > 0);
  const sonderabsprachen = blatt.firmen.filter((f) => f.sondervereinbarung?.trim());
  const armbaender = blatt.shop?.getraenkeArmbaender ?? 0;
  const goldArmbaender = blatt.shop?.vipArmbandGold ?? 0;
  const stehtische = blatt.shop?.stehtische ?? 0;

  const nichts =
    flats.length === 0 &&
    sonderabsprachen.length === 0 &&
    armbaender === 0 &&
    goldArmbaender === 0 &&
    stehtische === 0;

  if (nichts) {
    return <p className="text-sm text-leise">Keine Getränkepauschalen gebucht.</p>;
  }

  return (
    <div className="space-y-5 text-sm">
      {flats.length > 0 && (
        <div>
          <h3 className="mb-1 font-semibold">Getränkeflats der Firmengruppen</h3>
          <p className="mb-2 text-xs text-leise">
            Gelten am Tisch im Saal. Der Umfang steht in der Bezeichnung: die meisten Flats bis
            einschließlich Pause, nur die All-inklusive-Flat auch nach der Show.
          </p>
          <ul className="space-y-1">
            {flats.map((f) => (
              <li key={f.vorgangId + f.gruppe} className="border-l-4 border-text pl-3">
                <strong>{f.gruppe}</strong>:{" "}
                {f.getraenkepauschalen.map(sicherArtikelname).join(" + ")}
                <br />
                <strong>{f.personen} Armbänder</strong> ausgeben
              </li>
            ))}
          </ul>
        </div>
      )}

      {sonderabsprachen.length > 0 && (
        <div>
          <h3 className="mb-1 font-semibold">Individuell vereinbart</h3>
          <p className="mb-2 text-xs text-leise">
            Zusätzlich zum Angebot abgesprochen. Bitte so ausgeben und für die Abrechnung
            festhalten.
          </p>
          <ul className="space-y-1">
            {sonderabsprachen.map((f) => (
              <li
                key={f.vorgangId + f.gruppe}
                className="border-l-4 pl-3"
                style={{ borderColor: "var(--gold)" }}
              >
                <strong>{f.gruppe}</strong>: {f.sondervereinbarung}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(armbaender > 0 || goldArmbaender > 0) && (
        <div>
          <h3 className="mb-1 font-semibold">VIP-Bändchen aus dem Webshop</h3>
          <p className="mb-2 text-xs text-leise">
            Achtung, anderer Geltungsbereich: <strong>nur im Foyer</strong>, eine Stunde vor der
            Show und in der Pause. Nicht am Tisch im Saal.
          </p>
          <ul className="space-y-1">
            {armbaender > 0 && (
              <li>
                <strong>{armbaender} Bändchen</strong> insgesamt
              </li>
            )}
            {goldArmbaender > 0 && (
              <li>
                davon <strong>{goldArmbaender} in Gold</strong>
              </li>
            )}
          </ul>
        </div>
      )}

      {stehtische > 0 && (
        <div>
          <h3 className="mb-1 font-semibold">Stehtische im Foyer</h3>
          <p className="mb-2 text-xs text-leise">
            Reserviert für die Pause, jeweils mit Getränk und Zauberschnitte.
          </p>
          <p>
            <strong>{stehtische} Stehtische</strong> vorbereiten
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Hakt eine Zahlung als kassiert ab.
 *
 * Bewusst auch für die Gastronomie freigegeben: Sie kassiert am Tisch und
 * weiß als Einzige, ob gezahlt wurde. Verändert wird dabei kein Betrag,
 * nur festgehalten, dass das Geld da ist.
 */
function KassiertKnopf({
  ditixEventId,
  gruppeId,
  erledigt,
}: {
  ditixEventId: string;
  gruppeId: string;
  erledigt: boolean;
}) {
  return (
    <form
      action={vorOrtKassiert.bind(null, ditixEventId, gruppeId, erledigt)}
      className="mt-1 print:hidden"
    >
      <button type="submit" className="text-xs text-leise underline hover:text-text">
        {erledigt ? "doch nicht kassiert" : "als kassiert eintragen"}
      </button>
    </form>
  );
}
