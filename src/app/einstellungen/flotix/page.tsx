import {
  flotixBestellungen,
  flotixProbe,
  flotixQuelle,
  flotixVorstellungen,
} from "@/lib/flotix/tuer";
import { ausFlotix, holeShopGruppenRoh } from "@/lib/shop/rohdaten";
import { showtageAbHeute } from "@/lib/ditix/spielplan";

export const metadata = { title: "FloTix | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Was FloTix hergibt, und ob es schon gilt.
 *
 * "sicher, dass FloTix bereits mit dem Eventmanager spricht? wo ist
 * Bestellnummer FZT-261019-339261, finde diese Buchung nicht im
 * Eventmanager" (Florian, 20.10.2026).
 *
 * Die Frage war berechtigt und die Antwort war nein: FloTix meldet
 * seit heute Nacht jede Buchung hierher, aber gelesen werden die Gäste
 * weiterhin aus Ditix und den Google-Tabellen. Eine Buchung aus FloTix
 * steht deshalb in keiner Liste im Haus, solange die Weiche aus ist.
 *
 * Diese Seite macht genau diesen Unterschied sichtbar: oben, ob die
 * Weiche steht, darunter, was durch die Tür hereinkommt. So kann man eine
 * Bestellnummer nachschlagen, ohne eine einzige Liste im Haus
 * umzustellen.
 *
 * Nur für den Inhaber: /einstellungen gehört ihm (siehe auth/sitzung.ts).
 */
export default async function FlotixSeite({
  searchParams,
}: {
  searchParams: Promise<{ suche?: string }>;
}) {
  const { suche = "" } = await searchParams;
  const weiche = flotixQuelle();
  const schluessel = (process.env.FLOTIX_KEY ?? "").trim().length > 15;

  const probe = schluessel ? await flotixProbe().catch((f: Error) => ({ fehler: f.message })) : null;
  const alle = schluessel ? await flotixBestellungen().catch(() => []) : [];

  /*
    Die Gegenüberstellung je Vorstellung.

    "es darf nichts verloren gehen, was in Ditix gebucht wurde" (Florian,
    20.10.2026). Genau das steht hier nachprüfbar: je Abend die Gäste aus
    FloTix und die aus Ditix, nebeneinander.

    Verglichen wird nach Termin und nicht nach Kennung, denn dieselbe
    Vorstellung hat in beiden Systemen eine eigene. Die Brücke dafür sind
    die Vorstellungen aus FloTix: Dort steht neben der eigenen Kennung
    auch die alte aus Ditix.
  */
  const [gruppen, vorstellungen, spielplan] = await Promise.all([
    holeShopGruppenRoh().catch(() => []),
    schluessel ? flotixVorstellungen().catch(() => []) : Promise.resolve([]),
    showtageAbHeute(400).catch(() => []),
  ]);

  // Welcher Termin gehört zu welcher Kennung, egal aus welchem System.
  const terminVon = new Map<string, { wann: string; name: string }>();
  for (const t of spielplan) {
    terminVon.set(t.ditixEventId, { wann: `${t.datum} ${t.uhrzeit}`, name: t.name });
  }
  for (const v of vorstellungen) {
    const d = new Date(v.beginn);
    const wann =
      d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) +
      " " +
      d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
    const eintrag = { wann, name: v.showTitel };
    if (!terminVon.has(v.id)) terminVon.set(v.id, eintrag);
    if (v.ditixEventId && !terminVon.has(v.ditixEventId)) terminVon.set(v.ditixEventId, eintrag);
  }

  /*
    Steht die Weiche noch auf Ditix, liefert holeShopGruppenRoh nur die
    Tabelle. Damit die Spalte trotzdem etwas zeigt, kommt FloTix dann
    direkt von der Tür.
  */
  const flotixGruppen = weiche
    ? gruppen.filter((g) => g.quelle === "flotix")
    : ausFlotix(alle);
  const ditixGruppen = gruppen.filter((g) => g.quelle === "ditix");

  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const abende = new Map<
    string,
    { wann: string; name: string; flotix: number; ditix: number; fGaeste: number; dGaeste: number }
  >();
  const einsortieren = (
    liste: typeof ditixGruppen,
    welche: "flotix" | "ditix",
  ) => {
    for (const g of liste) {
      const t = terminVon.get(g.ditixEventId);
      if (!t || t.wann.slice(0, 10) < heute) continue;
      const e =
        abende.get(t.wann) ??
        { wann: t.wann, name: t.name, flotix: 0, ditix: 0, fGaeste: 0, dGaeste: 0 };
      if (welche === "flotix") {
        e.flotix += 1;
        e.fGaeste += g.tickets;
      } else {
        e.ditix += 1;
        e.dGaeste += g.tickets;
      }
      abende.set(t.wann, e);
    }
  };
  einsortieren(flotixGruppen, "flotix");
  einsortieren(ditixGruppen, "ditix");
  const reihen = [...abende.values()].sort((a, b) => a.wann.localeCompare(b.wann));

  const gesucht = suche.trim().toLowerCase();
  const liste = (
    gesucht
      ? alle.filter(
          (b) =>
            b.bestellnummer.toLowerCase().includes(gesucht) ||
            `${b.vorname ?? ""} ${b.nachname ?? ""}`.toLowerCase().includes(gesucht) ||
            (b.email ?? "").toLowerCase().includes(gesucht),
        )
      : alle
  )
    .slice()
    .sort((a, b) => (a.bezahltAm ?? a.eingegangen) < (b.bezahltAm ?? b.eingegangen) ? 1 : -1);

  const wann = (iso: string) =>
    iso
      ? new Date(iso).toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">FloTix</h1>
        <p className="mt-1 text-sm text-leise">
          Was unser eigenes Ticketing hergibt, und ob der Eventmanager es schon benutzt.
        </p>
      </header>

      <section
        className="rounded-lg border px-5 py-4"
        style={
          weiche
            ? { borderColor: "var(--linie)", background: "var(--flaeche)" }
            : { borderColor: "var(--warnung)", background: "var(--warnung-hell)" }
        }
      >
        <h2 className="font-semibold">
          {weiche ? "Der Eventmanager liest aus FloTix" : "Der Eventmanager liest noch nicht aus FloTix"}
        </h2>
        <p className="mt-1 text-sm">
          {weiche ? (
            <>
              Gäste, Menüs, Parkplätze und der Gutscheinversand kommen aus FloTix. Spielplan,
              Saalplan und Preise kommen über den Shop, der dafür ebenfalls auf FloTix stehen muss.
            </>
          ) : (
            <>
              Gäste, Menüs, Parkplätze und der Gutscheinversand kommen weiterhin aus Ditix und den
              Google-Tabellen. Eine Bestellung, die unten steht, erscheint deshalb in <b>keiner</b>{" "}
              Liste im Haus: nicht im Funktionsheet, nicht in der Küche, nicht im Sitzplan.
              Umgeschaltet wird mit der Variablen <code>QUELLE=flotix</code> bei Vercel, und zwar am
              Umschalttag, nicht vorher: Heute stehen in FloTix nur Testkäufe.
            </>
          )}
        </p>
        <ul className="mt-3 space-y-1 text-sm text-leise">
          <li>Schlüssel für die Tür: {schluessel ? "liegt bereit" : "fehlt"}</li>
          <li>
            Sofortmeldung neuer Buchungen: {schluessel ? "eingerichtet" : "ohne Schlüssel nicht möglich"}
            {". "}
            FloTix meldet jede Buchung sofort hierher, damit sie ohne Wartezeit erscheint, sobald die
            Weiche steht.
          </li>
          {probe && "stand" in probe ? (
            <li>
              In FloTix: {String((probe.stand as Record<string, unknown>).bestellungen ?? "?")} bezahlte
              Bestellungen, {String((probe.stand as Record<string, unknown>).gutscheine ?? "?")} Gutscheine,{" "}
              {String((probe.stand as Record<string, unknown>).kommende_vorstellungen ?? "?")} kommende
              Vorstellungen.
            </li>
          ) : null}
          {probe && "fehler" in probe ? (
            <li style={{ color: "var(--blocker)" }}>FloTix antwortet nicht: {String(probe.fehler)}</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">Gäste je Abend, nach Quelle</h2>
        <p className="mt-1 mb-2 text-sm text-leise">
          Nur kommende Abende. Was in Ditix gebucht wurde, bleibt in der rechten Spalte stehen,
          bis die Show gespielt ist.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-linie text-left text-xs text-leise">
                <th className="py-2 pr-3">Abend</th>
                <th className="py-2 pr-3">Show</th>
                <th className="py-2 pr-3">aus FloTix</th>
                <th className="py-2">aus Ditix</th>
              </tr>
            </thead>
            <tbody>
              {reihen.map((r) => (
                <tr key={r.wann} className="border-b border-linie">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {r.wann.slice(8, 10)}.{r.wann.slice(5, 7)}.{r.wann.slice(0, 4)}
                    <span className="text-leise"> {r.wann.slice(11)}</span>
                  </td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">
                    {r.flotix === 0 ? <span className="text-leise">0</span> : `${r.fGaeste} Gäste, ${r.flotix} Bestellungen`}
                  </td>
                  <td className="py-2">
                    {r.ditix === 0 ? <span className="text-leise">0</span> : `${r.dGaeste} Gäste, ${r.ditix} Bestellungen`}
                  </td>
                </tr>
              ))}
              {reihen.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-sm text-leise">
                    Für die kommenden Abende liegt in keiner der beiden Quellen eine Buchung.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="font-semibold">Einzelne Bestellungen in FloTix</h2>
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs">
          <span className="mb-1 block text-leise">Bestellnummer, Name oder E-Mail</span>
          <input name="suche" defaultValue={suche} placeholder="zum Beispiel FZT-261019-339261" />
        </label>
        <button
          type="submit"
          className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
        >
          Suchen
        </button>
        {suche ? (
          <a
            href="/einstellungen/flotix"
            className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
          >
            Alle
          </a>
        ) : null}
      </form>

      <section className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linie text-left text-xs text-leise">
              <th className="py-2 pr-3">Bestellung</th>
              <th className="py-2 pr-3">Gast</th>
              <th className="py-2 pr-3">Vorstellung</th>
              <th className="py-2 pr-3">Positionen</th>
              <th className="py-2">Stand</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((b) => (
              <tr key={b.id} className="border-b border-linie align-top">
                <td className="py-2 pr-3 font-medium whitespace-nowrap">
                  {b.bestellnummer}
                  <div className="text-xs text-leise">{wann(b.bezahltAm ?? b.eingegangen)}</div>
                </td>
                <td className="py-2 pr-3">
                  {`${b.vorname ?? ""} ${b.nachname ?? ""}`.trim() || "ohne Namen"}
                  {b.firma ? <div className="text-xs text-leise">{b.firma}</div> : null}
                </td>
                <td className="py-2 pr-3">
                  {b.showTitel}
                  <div className="text-xs text-leise">{wann(b.beginn)}</div>
                </td>
                <td className="py-2 pr-3">
                  {b.positionen.map((p, i) => (
                    <div key={i}>
                      {p.menge} × {p.bezeichnung}
                    </div>
                  ))}
                </td>
                <td className="py-2 whitespace-nowrap">
                  {b.storniertAm ? (
                    <span style={{ color: "var(--blocker)" }}>storniert</span>
                  ) : (
                    "bezahlt"
                  )}
                  {b.freikarte ? <div className="text-xs text-leise">Freikarte</div> : null}
                </td>
              </tr>
            ))}
            {liste.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-sm text-leise">
                  {schluessel
                    ? suche
                      ? "Dazu findet FloTix nichts. Vielleicht ist die Bestellung nicht bezahlt: Die Tür gibt nur bezahlte Bestellungen heraus."
                      : "FloTix hat noch keine bezahlte Bestellung."
                    : "Ohne Schlüssel kann hier nichts stehen."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
