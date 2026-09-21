import type { Kuechenblatt } from "@/lib/kueche/blatt";
import { VARIANTEN } from "@/lib/db/firmenmenue";
import { firmaAendern, firmaEintragen } from "@/app/funktionsheet/aktionen";
import { Absendeknopf } from "@/components/Absendeknopf";

/**
 * Woraus sich die Menüs zusammensetzen, und wie man Firmenmenüs einträgt.
 *
 * Zwei Quellen, wie im Küchenblatt: der Ticketshop für Einzelgäste, und
 * die Firmen, die direkt bei uns buchen. Die Küche sieht die Gesamtzahl,
 * daneben steht, woher sie kommt. Kevin trägt Firmen hier in einem Zug ein,
 * ohne den Umweg über einen vollständigen Vorgang.
 */
export function Firmenmenues({
  blatt,
  shows,
  darfBuchen,
  zurueckZu,
}: {
  blatt: Kuechenblatt;
  shows: Array<{ ditixEventId: string; uhrzeit: string; name: string }>;
  darfBuchen: boolean;
  zurueckZu: string;
}) {
  const shopMenues = blatt.shop?.menuesGesamt ?? 0;
  const firmenMenues = blatt.firmen.reduce((n, f) => n + f.menuesGesamt, 0);

  return (
    <div id="menues" className="mt-6 scroll-mt-24 space-y-3">
      <h3 className="text-sm font-semibold">Zusammensetzung</h3>

      <table className="w-full max-w-2xl text-sm">
        <tbody>
          <tr className="border-b border-linie">
            <td className="py-1.5">Ticketshop (einzelne Gäste)</td>
            <td className="py-1.5 text-right tabular-nums">{shopMenues}</td>
          </tr>
          {blatt.firmen.map((f) => (
            <tr key={f.gruppeId} className="border-b border-linie">
              <td className="py-1.5">
                {f.gruppe}
                <span className="text-leise">
                  {" "}
                  · {f.personen} {f.personen === 1 ? "Person" : "Personen"}
                  {["anfrage", "reserviert"].includes(f.status) && ", noch nicht fest gebucht"}
                  {f.showUhrzeit && ` · ${f.showUhrzeit} Uhr`}
                </span>
                {f.menuesGesamt > 0 && (
                  <span className="block text-xs text-leise">
                    {VARIANTEN.filter((v) => (f.menues[v.wert] ?? 0) > 0)
                      .map((v) => `${f.menues[v.wert]} × ${v.label}`)
                      .join(", ")}
                  </span>
                )}
                {f.menuesGesamt === 0 && (
                  <span className="block text-xs" style={{ color: "var(--warnung)" }}>
                    Menüs noch nicht gemeldet
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums">{f.menuesGesamt}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1.5 font-semibold">
              Zusammen
              <span className="font-normal text-leise">
                {" "}
                ({shopMenues} Ticketshop + {firmenMenues} Firmen)
              </span>
            </td>
            <td className="py-1.5 text-right text-lg font-semibold tabular-nums">{blatt.gesamtMenues}</td>
          </tr>
        </tbody>
      </table>

      {darfBuchen && (
        <div className="space-y-3 print:hidden">
          {blatt.firmen.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer underline">Gemeldete Menüzahlen einer Firma ändern</summary>
              <div className="mt-2 space-y-4">
                {blatt.firmen.map((f) => (
                  <form key={f.gruppeId} action={firmaAendern} className="rounded-lg border border-linie bg-flaeche p-3">
                    <input type="hidden" name="gruppeId" value={f.gruppeId} />
                    <input type="hidden" name="zurueckZu" value={zurueckZu} />
                    <input type="hidden" name="anker" value="menues" />
                    <div className="mb-2 font-medium">{f.gruppe}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {VARIANTEN.map((v) => (
                        <label key={v.wert} className="block">
                          <span className="mb-1 block text-xs text-leise">{v.label}</span>
                          <input
                            name={`menue_${v.wert}`}
                            type="number"
                            min={0}
                            max={300}
                            defaultValue={f.menues[v.wert] ?? 0}
                            inputMode="numeric"
                          />
                        </label>
                      ))}
                      <label className="block">
                        <span className="mb-1 block text-xs text-leise">Personen</span>
                        <input name="personen" type="number" min={1} max={300} defaultValue={f.personen} inputMode="numeric" />
                      </label>
                    </div>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-xs text-leise">Unverträglichkeiten</span>
                      <input name="unvertraeglichkeiten" defaultValue={f.unvertraeglichkeiten ?? ""} maxLength={500} />
                    </label>
                    <div className="mt-2">
                      <Absendeknopf text="Speichern" laeuftText="..." />
                    </div>
                  </form>
                ))}
              </div>
            </details>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer underline">Firma mit Menüs eintragen</summary>
            <form action={firmaEintragen} className="mt-2 max-w-2xl space-y-3 rounded-lg border border-linie bg-flaeche p-3">
              <input type="hidden" name="zurueckZu" value={zurueckZu} />
              <input type="hidden" name="anker" value="menues" />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Firma</span>
                  <input name="firma" required maxLength={120} placeholder="zum Beispiel Noerpel" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Personen</span>
                  <input name="personen" type="number" min={1} max={300} defaultValue={10} inputMode="numeric" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-leise">Vorstellung</span>
                  <select name="vorstellung" defaultValue={shows[0]?.ditixEventId}>
                    {shows.map((s) => (
                      <option key={s.ditixEventId} value={s.ditixEventId}>
                        {s.uhrzeit} Uhr, {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VARIANTEN.map((v) => (
                  <label key={v.wert} className="block">
                    <span className="mb-1 block text-xs text-leise">{v.label}</span>
                    <input name={`menue_${v.wert}`} type="number" min={0} max={300} defaultValue={0} inputMode="numeric" />
                  </label>
                ))}
              </div>
              <p className="text-xs text-leise">
                Menüs können auch später nachgetragen werden, etwa wenn die Firma sie erst meldet.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Platzierung</span>
                  <select name="bereich" defaultValue="">
                    <option value="">Programm entscheiden lassen</option>
                    <option value="logen">Loge gebucht</option>
                    <option value="eventgalerie">Eventgalerie</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-leise">Stand</span>
                  <select name="status" defaultValue="gebucht">
                    <option value="gebucht">fest gebucht</option>
                    <option value="reserviert">nur reserviert</option>
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-leise">Unverträglichkeiten</span>
                  <input name="unvertraeglichkeiten" maxLength={500} placeholder="zum Beispiel ein Mal Fructose" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-leise">Notiz zur Gruppe (freiwillig)</span>
                  <input name="notiz" maxLength={500} placeholder="zum Beispiel Getränkeflat vereinbart" />
                </label>
              </div>

              <Absendeknopf text="Firma eintragen" laeuftText="Wird eingetragen..." />
              <p className="text-xs text-leise">
                Daraus entsteht ein Vorgang. Angebot, Rechnung und Zahlungen laufen wie gewohnt unter „Vorgänge“.
              </p>
            </form>
          </details>
        </div>
      )}
    </div>
  );
}
