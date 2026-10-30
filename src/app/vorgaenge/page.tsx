import Link from "next/link";
import {
  ERLEDIGT,
  listeVorgaenge,
  vorgangsfilter,
  type Vorgangsfilter,
  type VorgangZeile,
} from "@/lib/db/vorgaenge";
import {
  alsVerlorenMarkieren,
  erledigteArchivieren,
  vorgangArchivieren,
  vorgangHervorholen,
  vorgangInPapierkorb,
  vorgangLoeschen,
} from "@/lib/db/aktionen";
import { fehlertext } from "@/lib/db/client";
import { StatusBadge, datumKurz, vorZeit } from "@/components/Status";
import { eur } from "@/lib/domain/pricing";

export const metadata = { title: "Vorgänge | FZT Eventmanager" };

/*
  Die Reiter über der Liste.

  "bei dieser ewig langen liste von vorgängen muss es die möglichkeit
  geben zu archivieren. bzw. als verloren zu markieren oder zu löschen,
  dass es verschwindet" (Florian, 30.10.2026).

  Voreingestellt ist "Offen": alles, woran noch gearbeitet wird. Was
  durch ist, steht unter "Erledigt", was aus dem Weg soll, im Archiv.
  Nichts geht dabei verloren, es steht nur woanders.
*/
const REITER: Array<{ wert: Vorgangsfilter; text: string }> = [
  { wert: "offen", text: "Offen" },
  { wert: "erledigt", text: "Erledigt" },
  { wert: "archiv", text: "Archiv" },
  { wert: "papierkorb", text: "Papierkorb" },
  { wert: "alle", text: "Alle" },
];

// Immer frisch laden: hier arbeiten mehrere Leute gleichzeitig.
export const dynamic = "force-dynamic";

/*
  Suchen statt scrollen (Florian, 29.10.2026: "hier bei vorgängen muss
  man auch suchen können").

  Gesucht wird ueber alles, was auf der Zeile steht: Vorgangsnummer,
  Firma, Ansprechpartner, Show und Datum. Das Datum in beiden
  Schreibweisen, denn im Kopf hat man "20.11." und in der Datenbank
  steht "2026-11-20".

  Gefiltert wird hier und nicht in der Datenbank. Die Liste umfasst
  einige hundert Zeilen, die sind ohnehin schon geladen, und eine
  Suche ueber mehrere Spalten in SQL waere mehr Aufwand als Nutzen.
  Wenn es einmal Tausende sind, gehoert es nach unten.
*/
function passt(v: VorgangZeile, suche: string): boolean {
  const felder = [
    v.nummer,
    v.kundeName,
    v.ansprechpartner ?? "",
    v.show ?? "",
    v.datum ?? "",
    v.datum ? v.datum.split("-").reverse().join(".") : "",
    v.wunschzeitraum ?? "",
  ];
  return felder.join(" ").toLowerCase().includes(suche);
}

export default async function VorgaengeSeite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; zeige?: string }>;
}) {
  const parameter = await searchParams;
  const suche = (parameter.q ?? "").trim().toLowerCase();
  const zeige = (REITER.find((r) => r.wert === parameter.zeige)?.wert ?? "offen") as Vorgangsfilter;

  let vorgaenge: VorgangZeile[];
  let fehler: string | null = null;

  try {
    vorgaenge = await listeVorgaenge("alle");
  } catch (e) {
    fehler = fehlertext(e);
    vorgaenge = [];
  }

  const gesamt = vorgaenge.length;
  const imReiter = vorgaenge.filter((v) => vorgangsfilter(v, zeige));
  const gefunden = suche ? imReiter.filter((v) => passt(v, suche)) : imReiter;
  const zuArchivieren = vorgaenge.filter(
    (v) => v.ablage === null && ERLEDIGT.includes(v.status),
  ).length;

  /** Den Reiter und die Suche beim Blättern behalten. */
  const mitReiter = (wert: string) =>
    `/vorgaenge?zeige=${wert}${suche ? `&q=${encodeURIComponent(suche)}` : ""}`;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vorgänge</h1>
          <p className="mt-1 text-sm text-leise">
            Alle Firmenevents von der Anfrage bis zur Durchführung.
          </p>
        </div>
        <Link
          href="/vorgaenge/neu"
          className="shrink-0 rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel transition-colors hover:bg-gold hover:text-white"
        >
          Anfrage aufnehmen
        </Link>
      </header>

      {gesamt > 0 && (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Vorgänge filtern">
          {REITER.map((r) => {
            const anzahl = vorgaenge.filter((v) => vorgangsfilter(v, r.wert)).length;
            const an = r.wert === zeige;
            return (
              <Link
                key={r.wert}
                href={mitReiter(r.wert)}
                aria-current={an ? "page" : undefined}
                className="rounded-md border px-3 py-1.5 text-sm"
                style={
                  an
                    ? {
                        borderColor: "var(--gold)",
                        background: "var(--gold-hell)",
                        color: "var(--gold-dunkel)",
                        fontWeight: 600,
                      }
                    : { borderColor: "var(--linie)", color: "var(--text-leise)" }
                }
              >
                {r.text} <span className="tabular-nums">({anzahl})</span>
              </Link>
            );
          })}

          {/*
            Der eine Knopf für den Rückstand. Einzeln wären das bei ein
            paar hundert durchgeführten Abenden eine Stunde Klickarbeit.
          */}
          {zeige !== "archiv" && zuArchivieren > 0 && (
            <form action={erledigteArchivieren} className="ml-auto">
              <button
                type="submit"
                title="Nimmt alles aus der Liste, was durchgeführt, abgesagt oder verloren ist. Im Archiv bleibt es vollständig erhalten."
                className="rounded-md border border-linie px-3 py-1.5 text-sm text-leise hover:border-gold hover:text-gold-dunkel"
              >
                {zuArchivieren} Erledigte ins Archiv
              </button>
            </form>
          )}
        </nav>
      )}

      {gesamt > 0 && (
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="zeige" value={zeige} />
          <input
            type="search"
            name="q"
            defaultValue={suche}
            placeholder="Nummer, Firma, Ansprechpartner, Show oder Datum"
            className="min-w-72 flex-1 rounded-md border border-linie bg-flaeche px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
          >
            Suchen
          </button>
          {suche && (
            <Link href={mitReiter(zeige)} className="text-sm text-leise underline">
              zurücksetzen
            </Link>
          )}
          {suche && (
            <span className="text-sm text-leise">
              {gefunden.length} von {gesamt}
            </span>
          )}
        </form>
      )}

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Datenbank nicht erreichbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      {!fehler && gesamt === 0 && (
        <div className="rounded-lg border border-dashed border-linie px-6 py-12 text-center">
          <div className="text-sm font-medium">Noch keine Vorgänge</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-leise">
            Sobald eine Firmenanfrage hereinkommt, legst du sie hier an. Danach führt dich das
            Programm durch Angebot, Zahlung und Platzierung.
          </p>
          <Link
            href="/vorgaenge/neu"
            className="mt-4 inline-block rounded-md border border-gold bg-gold-hell px-4 py-2 text-sm font-medium text-gold-dunkel hover:bg-gold hover:text-white"
          >
            Erste Anfrage aufnehmen
          </Link>
        </div>
      )}

      {gesamt > 0 && gefunden.length === 0 && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          {suche ? (
            <>
              Nichts gefunden zu &bdquo;{suche}&ldquo;. Gesucht wird in Nummer, Firma,
              Ansprechpartner, Show und Datum.
            </>
          ) : zeige === "papierkorb" ? (
            "Der Papierkorb ist leer. Was du löschst, landet hier und lässt sich zurückholen."
          ) : zeige === "archiv" ? (
            "Im Archiv liegt noch nichts. Was du hier ablegst, bleibt vollständig erhalten."
          ) : zeige === "erledigt" ? (
            "Nichts erledigt. Durchgeführte, abgesagte und verlorene Vorgänge stehen hier."
          ) : (
            "Nichts offen. Alles ist erledigt oder liegt im Archiv."
          )}
        </p>
      )}

      {gefunden.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Vorgang</th>
                <th className="px-4 py-2 font-medium">Kunde</th>
                <th className="px-4 py-2 font-medium">Vorstellung</th>
                <th className="px-4 py-2 text-right font-medium">Gäste</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Angebot</th>
                <th className="px-4 py-2 text-right font-medium">Gezahlt</th>
                <th className="px-4 py-2 font-medium"><span className="sr-only">Ablegen</span></th>
              </tr>
            </thead>
            <tbody>
              {gefunden.map((v) => (
                <tr key={v.id} className="border-b border-linie last:border-0 hover:bg-hintergrund">
                  <td className="px-4 py-3">
                    <Link href={`/vorgaenge/${v.id}`} className="font-medium hover:text-gold-dunkel">
                      {v.nummer}
                    </Link>
                    {v.offeneAufgaben > 0 && (
                      <div className="text-xs" style={{ color: "var(--warnung)" }}>
                        {v.offeneAufgaben} offene Aufgabe{v.offeneAufgaben === 1 ? "" : "n"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{v.kundeName}</div>
                    {v.ansprechpartner && (
                      <div className="text-xs text-leise">{v.ansprechpartner}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {v.datum ? (
                      <>
                        <div>{datumKurz(v.datum)}</div>
                        <div className="text-xs text-leise">{v.show}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-leise">Termin offen</div>
                        {/*
                          Der Wunschtag zuerst: Freitag oder Samstag heisst
                          voller Abend und anderer Preis (Florian, 26.10.2026).
                        */}
                        {v.wunschtag && (
                          <div className="text-xs font-medium">{v.wunschtag}</div>
                        )}
                        {v.wunschzeitraum && (
                          <div className="text-xs text-leise">{v.wunschzeitraum}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {v.personen}
                    {v.personenUngefaehr && (
                      <div className="text-xs font-normal text-leise">{v.personenUngefaehr}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                    {v.verlorenGrund && (
                      <div className="mt-1 max-w-48 text-xs text-leise">{v.verlorenGrund}</div>
                    )}
                    {v.archiviertAm && v.ablage && (
                      <div className="mt-1 text-xs text-leise">
                        {v.ablage === "papierkorb" ? "im Papierkorb" : "archiviert"}{" "}
                        {vorZeit(v.archiviertAm)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {v.angebote === 0 ? (
                      <span className="text-leise">noch keins</span>
                    ) : v.angenommenAm ? (
                      <span style={{ color: "var(--gut)" }}>
                        angenommen {vorZeit(v.angenommenAm)}
                      </span>
                    ) : v.letzteOeffnung ? (
                      <span style={{ color: "var(--gold-dunkel)" }}>
                        {v.oeffnungen}x geöffnet, zuletzt {vorZeit(v.letzteOeffnung)}
                      </span>
                    ) : v.angebotVersendetAm ? (
                      <span className="text-leise">
                        versendet {vorZeit(v.angebotVersendetAm)}, noch nicht geöffnet
                      </span>
                    ) : (
                      <span className="text-leise">erstellt, nicht versendet</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {v.gezahltCent > 0 ? eur(v.gezahltCent) : <span className="text-leise">-</span>}
                  </td>
                  {/*
                    Aus der Liste nehmen, ohne die Seite zu verlassen.

                    Eingeklappt, weil es drei Wege sind und keiner davon
                    aus Versehen passieren soll. Wer aufklappt, hat sich
                    schon entschieden, etwas abzulegen.
                  */}
                  <td className="px-4 py-3 text-right">
                    <details className="inline-block text-left">
                      <summary className="cursor-pointer list-none px-2 text-leise hover:text-gold-dunkel">
                        ablegen
                      </summary>
                      <div className="mt-2 space-y-2 rounded-md border border-linie bg-flaeche p-2 text-xs">
                        {v.ablage ? (
                          <>
                            <form action={vorgangHervorholen.bind(null, v.id)}>
                              <button type="submit" className="underline">
                                zurück in die Liste
                              </button>
                            </form>
                            {v.ablage === "papierkorb" && (
                              <form action={vorgangLoeschen.bind(null, v.id)}>
                                <button
                                  type="submit"
                                  title="Löscht den Vorgang mitsamt Gruppen, Angeboten und Notizen. Geht nicht, wenn eine Rechnung oder Zahlung daran hängt."
                                  className="underline"
                                  style={{ color: "var(--blocker)" }}
                                >
                                  endgültig löschen
                                </button>
                              </form>
                            )}
                          </>
                        ) : (
                          <>
                            {v.status !== "verloren" && (
                              <form
                                action={alsVerlorenMarkieren.bind(null, v.id)}
                                className="space-y-1"
                              >
                                <input
                                  name="grund"
                                  maxLength={300}
                                  placeholder="Warum verloren? Preis, Termin, keine Antwort"
                                  className="w-56 rounded-md border border-linie px-2 py-1 text-xs"
                                />
                                <button type="submit" className="block underline">
                                  auf verloren setzen
                                </button>
                              </form>
                            )}
                            <form action={vorgangArchivieren.bind(null, v.id)}>
                              <button type="submit" className="underline">
                                ins Archiv
                              </button>
                            </form>
                            {/*
                              "mach am besten so, dass es gleich löscht..
                              aber du speicherst es im archiv oder
                              papierkorb" (Florian, 30.10.2026). Für den,
                              der klickt, ist es weg. Tatsächlich liegt es
                              im Papierkorb.
                            */}
                            <form action={vorgangInPapierkorb.bind(null, v.id)}>
                              <button
                                type="submit"
                                title="Verschwindet aus der Liste und liegt im Papierkorb. Von dort jederzeit zurückzuholen."
                                className="underline"
                                style={{ color: "var(--blocker)" }}
                              >
                                löschen
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
