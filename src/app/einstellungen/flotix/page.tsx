import { flotixBestellungen, flotixProbe, flotixQuelle } from "@/lib/flotix/tuer";

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
