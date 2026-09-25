import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth/sitzung";
import { herkunftsbericht, verlauf } from "@/lib/marketing/herkunft";

export const metadata = { title: "Marketing | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const ZEITRAEUME = [
  { tage: 7, name: "7 Tage" },
  { tage: 30, name: "30 Tage" },
  { tage: 90, name: "90 Tage" },
  { tage: 365, name: "12 Monate" },
];

const euro = (cent: number) => (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const prozent = (anteil: number) => `${Math.round(anteil * 100)} %`;

/**
 * Woher die Verkäufe kommen.
 *
 * Gedacht für die Agenturen: Sie sollen ohne Nachfragen sehen, was ihre
 * Kampagnen einbringen. Deshalb steht hier nur, was zählt: Anteil, Karten,
 * Umsatz je Kanal, darunter die einzelnen Kampagnen.
 *
 * Bewusst keine Gästedaten. Wer gebucht hat, geht eine Agentur nichts an,
 * und für ihre Arbeit braucht sie es auch nicht (Florian, 23.09.2026).
 */
export default async function MarketingSeite({
  searchParams,
}: {
  searchParams: Promise<{ tage?: string; vergleich?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");

  const { tage: tageWahl, vergleich: vergleichWahl } = await searchParams;
  const tage = ZEITRAEUME.some((z) => String(z.tage) === tageWahl) ? Number(tageWahl) : 30;

  /*
    Der Vergleich stellt denselben Zeitraum davor daneben.

    Eine Zahl allein sagt wenig: 12.000 Euro in 30 Tagen sind gut oder
    schlecht, je nachdem, was die 30 Tage davor gebracht haben. Genau
    das beantwortet der Vergleich (Florian, 25.09.2026).
  */
  const vergleichen = vergleichWahl === "ja";

  const [bericht, tagesReihe, davor] = await Promise.all([
    herkunftsbericht(tage),
    verlauf(tage),
    vergleichen ? herkunftsbericht(tage, tage) : Promise.resolve(null),
  ]);

  /** Wie viel mehr oder weniger, in Prozent. */
  const unterschied = (jetzt: number, vorher: number): string | null => {
    if (!vergleichen || davor === null) return null;
    if (vorher === 0) return jetzt > 0 ? "neu" : null;
    const anteil = (jetzt - vorher) / vorher;
    const zeichen = anteil > 0 ? "+" : "";
    return `${zeichen}${Math.round(anteil * 100)} %`;
  };
  const bester = Math.max(1, ...tagesReihe.map((t) => t.umsatzCent));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Woher die Verkäufe kommen</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Alle bezahlten Buchungen aus dem Ticketshop, zugeordnet zu dem Weg, über den der Gast zuletzt
          gekommen ist. Gezählt wird der Tag der Bestellung, nicht der Showtag: Eine Anzeige im September
          verkauft auch Karten für den Dezember.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 text-sm">
        {ZEITRAEUME.map((z) => (
          <Link
            key={z.tage}
            href={`/marketing?tage=${z.tage}`}
            className={`rounded-md px-3 py-1.5 ${z.tage === tage ? "bg-text text-flaeche" : "border border-linie"}`}
          >
            {z.name}
          </Link>
        ))}
        {/*
          Der Vergleich ist ein Schalter, kein eigener Bereich: Man will
          dieselbe Seite sehen, nur mit dem Zeitraum davor daneben.
        */}
        <Link
          href={`/marketing?tage=${tage}${vergleichen ? "" : "&vergleich=ja"}`}
          className={`ml-auto rounded-md px-3 py-1.5 ${vergleichen ? "bg-text text-flaeche" : "border border-linie"}`}
        >
          {vergleichen ? "Vergleich aus" : "Mit Zeitraum davor vergleichen"}
        </Link>
      </nav>

      {vergleichen && davor && (
        <p className="text-sm text-leise">
          Verglichen mit {davor.von} bis {davor.bis}: damals {euro(davor.umsatzCent)} aus{" "}
          {davor.buchungen} Buchungen und {davor.karten} Karten.
        </p>
      )}

      <section className="flex flex-wrap gap-4">
        <Kachel
          zahl={euro(bericht.umsatzCent)}
          was="Umsatz im Shop"
          hinweis={
            unterschied(bericht.umsatzCent, davor?.umsatzCent ?? 0)
              ? `${unterschied(bericht.umsatzCent, davor?.umsatzCent ?? 0)} gegenüber davor`
              : `${bericht.buchungen} Buchungen`
          }
        />
        <Kachel
          zahl={String(bericht.karten)}
          was="Karten verkauft"
          hinweis={
            unterschied(bericht.karten, davor?.karten ?? 0)
              ? `${unterschied(bericht.karten, davor?.karten ?? 0)} gegenüber davor`
              : "in diesem Zeitraum"
          }
        />
        <Kachel
          zahl={bericht.kanaele[0] ? prozent(bericht.kanaele[0].anteil) : "-"}
          was="stärkster Kanal"
          hinweis={bericht.kanaele[0]?.name ?? "noch keine Daten"}
        />
      </section>

      {bericht.buchungen === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Für diesen Zeitraum liegt noch keine bezahlte Buchung mit Herkunft vor. Die Zuordnung läuft seit
          dem 23.09.2026 mit, davor wurde sie nicht gespeichert.
        </p>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Nach Kanal</h2>
          <div className="overflow-hidden rounded-lg border border-linie bg-flaeche">
            {bericht.kanaele.map((k) => (
              <div key={k.quelle} className="border-b border-linie px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>
                    {k.name}
                    {vergleichen && davor && (
                      <span className="ml-2 text-xs font-normal text-leise">
                        {(() => {
                          const alt = davor.kanaele.find((a) => a.quelle === k.quelle);
                          const d = unterschied(k.umsatzCent, alt?.umsatzCent ?? 0);
                          return d ? `${d} · davor ${euro(alt?.umsatzCent ?? 0)}` : "davor nichts";
                        })()}
                      </span>
                    )}
                  </strong>
                  <span className="tabular-nums">
                    <span className="text-lg font-semibold">{prozent(k.anteil)}</span>
                    <span className="ml-3 text-leise">
                      {euro(k.umsatzCent)} · {k.buchungen} {k.buchungen === 1 ? "Buchung" : "Buchungen"} ·{" "}
                      {k.karten} Karten
                    </span>
                  </span>
                </div>
                {/* Ein Balken sagt schneller als eine Zahl, wie die Kanäle zueinander stehen. */}
                <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--linie)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(2, k.anteil * 100)}%`, background: "var(--gold)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          {bericht.ohneHerkunft > 0 && (
            <p className="text-xs text-leise">
              „Direkt und unbekannt“ sind Gäste, die die Seite ohne Kampagnenkennung aufgerufen haben: Lesezeichen,
              Empfehlung, Plakat ohne Link, oder ein Besucher, der Werbung im Browser blockiert.
            </p>
          )}
        </section>
      )}

      {bericht.waren.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Was gekauft wurde</h2>
          <div className="overflow-hidden rounded-lg border border-linie bg-flaeche">
            {bericht.waren.map((w) => (
              <div key={w.gruppe} className="border-b border-linie px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>{w.name}</strong>
                  <span className="tabular-nums">
                    <span className="text-lg font-semibold">{prozent(w.anteil)}</span>
                    <span className="ml-3 text-leise">
                      {euro(w.umsatzCent)} · {w.anzahl} {w.anzahl === 1 ? "Stück" : "Stück"}
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--linie)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(2, w.anteil * 100)}%`, background: "var(--info)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-leise">
            Anteil am Umsatz. Eine Werbung, die Gäste bringt, die auch ein Menü dazubuchen, ist mehr wert als
            eine, die nur Tickets verkauft.
          </p>
        </section>
      )}

      {bericht.kampagnen.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Einzelne Kampagnen</h2>
          <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
            <table className="w-full text-sm">
              <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
                <tr>
                  <th className="px-4 py-2 font-medium">Kampagne</th>
                  <th className="px-4 py-2 font-medium">Kanal</th>
                  <th className="px-4 py-2 text-right font-medium">Buchungen</th>
                  <th className="px-4 py-2 text-right font-medium">Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {bericht.kampagnen.map((k) => (
                  <tr key={`${k.quelle}-${k.kampagne}`} className="border-b border-linie last:border-0">
                    <td className="px-4 py-2">{k.kampagne}</td>
                    <td className="px-4 py-2 text-leise">{k.quelle || "unbekannt"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{k.buchungen}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{euro(k.umsatzCent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tagesReihe.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Verlauf</h2>
          <div className="flex h-28 items-end gap-0.5 rounded-lg border border-linie bg-flaeche p-3">
            {tagesReihe.map((t) => (
              <div
                key={t.tag}
                title={`${t.tag.split("-").reverse().join(".")}: ${euro(t.umsatzCent)}, ${t.buchungen} Buchungen`}
                className="flex-1 rounded-sm"
                style={{ height: `${Math.max(3, (t.umsatzCent / bester) * 100)}%`, background: "var(--gold)" }}
              />
            ))}
          </div>
          <p className="text-xs text-leise">
            Umsatz je Tag, {bericht.von.split("-").reverse().join(".")} bis {bericht.bis.split("-").reverse().join(".")}.
          </p>
        </section>
      )}

      <p className="text-xs text-leise">
        Zur Einordnung: Gezählt wird, was im Ticketshop bezahlt wurde. Karten, die direkt über Ditix, an der
        Abendkasse oder über eine Firmenanfrage verkauft werden, stehen hier nicht. Die Zuordnung ist der letzte
        Kontakt vor dem Kauf.
      </p>
    </div>
  );
}

function Kachel({ zahl, was, hinweis }: { zahl: string; was: string; hinweis: string }) {
  return (
    <div className="min-w-48 flex-1 rounded-lg border border-linie bg-flaeche px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      <div className="text-xs text-leise">{hinweis}</div>
    </div>
  );
}
