import Link from "next/link";
import { listeVorgaenge, type VorgangZeile } from "@/lib/db/vorgaenge";
import { fehlertext } from "@/lib/db/client";
import { StatusBadge, datumKurz, vorZeit } from "@/components/Status";
import { eur } from "@/lib/domain/pricing";

export const metadata = { title: "Vorgänge | FZT Eventmanager" };

// Immer frisch laden: hier arbeiten mehrere Leute gleichzeitig.
export const dynamic = "force-dynamic";

export default async function VorgaengeSeite() {
  let vorgaenge: VorgangZeile[];
  let fehler: string | null = null;

  try {
    vorgaenge = await listeVorgaenge();
  } catch (e) {
    fehler = fehlertext(e);
    vorgaenge = [];
  }

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

      {fehler && (
        <div className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Datenbank nicht erreichbar.</strong>
          <div className="mt-1 text-leise">{fehler}</div>
        </div>
      )}

      {!fehler && vorgaenge.length === 0 && (
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

      {vorgaenge.length > 0 && (
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
              </tr>
            </thead>
            <tbody>
              {vorgaenge.map((v) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
