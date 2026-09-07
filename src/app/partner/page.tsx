import { Druckkopf } from "@/components/Druckkopf";
import { alleParnter, partnerAnlegen, ablesungErfassen } from "@/lib/db/partner";
import { eur } from "@/lib/domain/pricing";

export const metadata = { title: "Partner | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Partner mit Freiticket-Kontingent.
 *
 * Ein Hotel verkauft ein Paket und legt einen unserer Ditix-Freiticket-Codes
 * bei. Der Gast bucht bei uns Termin und Platz und setzt das Ticket an der
 * Kasse mit dem Code auf null. Wir stellen dem Partner monatlich in Rechnung,
 * was tatsaechlich eingeloest wurde.
 *
 * Ditix zaehlt je Code-Satz kumulativ hoch. Fuer die Monatsrechnung zaehlt
 * deshalb nicht der Stand, sondern die Differenz zum letzten Ablesen. Diese
 * Seite rechnet das aus, damit niemand versehentlich denselben Monat zweimal
 * berechnet.
 *
 * Solange Ditix die Einlösungen nicht über eine Schnittstelle herausgibt, wird
 * der Stand von Hand eingetragen. Kommt die Schnittstelle, füllt sich dieselbe
 * Tabelle automatisch und an dieser Seite ändert sich nichts.
 */
export default async function PartnerSeite() {
  const partner = await alleParnter();
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

  return (
    <div className="space-y-8">
      <Druckkopf titel="Partner & Freitickets" />

      {partner.length === 0 && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Noch kein Partner angelegt. Trag unten den ersten ein, zum Beispiel das me and all hotel ulm.
        </p>
      )}

      {partner.map((p) => (
        <section key={p.id} className="rounded-lg border border-linie p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p className="text-xs text-leise">
                Ditix-Code-Satz: {p.ditixAktion || "nicht hinterlegt"}
                {p.codesAusgegeben ? ` · ${p.codesAusgegeben} Codes ausgegeben` : ""}
                {p.preisJeCodeCent ? ` · ${eur(p.preisJeCodeCent)} je eingelöstem Code` : ""}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold">{p.offenerZuwachs}</div>
              <div className="text-xs text-leise">
                neu seit der vorletzten Ablesung
                {p.preisJeCodeCent ? ` · ${eur(p.offenerBetragCent)}` : ""}
              </div>
            </div>
          </div>

          {p.ablesungen.length > 0 ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-leise">
                  <th className="py-1">Stichtag</th>
                  <th className="py-1 text-right">Stand in Ditix</th>
                  <th className="py-1 text-right">Neu</th>
                  <th className="py-1 text-right">Zu berechnen</th>
                  <th className="py-1">Notiz</th>
                </tr>
              </thead>
              <tbody>
                {p.ablesungen.map((a) => (
                  <tr key={a.id} className="border-t border-linie">
                    <td className="py-1.5">{a.stichtag}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.standGesamt}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{a.zuwachs}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {p.preisJeCodeCent ? eur(a.zuwachs * p.preisJeCodeCent) : "—"}
                    </td>
                    <td className="py-1.5 text-leise">{a.notiz ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-leise">
              Noch keine Ablesung. Trag den Stand aus Ditix ein, dann rechnet der Manager ab dem
              nächsten Mal die Differenz aus.
            </p>
          )}

          <form action={ablesungErfassen} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="partner_id" value={p.id} />
            <label className="text-xs">
              <span className="block text-leise">Stichtag</span>
              <input
                type="date"
                name="stichtag"
                defaultValue={heute}
                required
                className="mt-1 rounded border border-linie bg-transparent px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="block text-leise">Stand in Ditix (eingelöste Codes gesamt)</span>
              <input
                type="number"
                name="stand_gesamt"
                min={0}
                required
                className="mt-1 w-56 rounded border border-linie bg-transparent px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex-1 text-xs">
              <span className="block text-leise">Notiz (optional)</span>
              <input
                type="text"
                name="notiz"
                className="mt-1 w-full rounded border border-linie bg-transparent px-2 py-1.5 text-sm"
              />
            </label>
            <button type="submit" className="rounded border border-linie px-3 py-1.5 text-sm font-medium">
              Ablesung speichern
            </button>
          </form>
        </section>
      ))}

      <section className="rounded-lg border border-dashed border-linie p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Partner anlegen</h2>
        <form action={partnerAnlegen} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="block text-leise">Name</span>
            <input
              type="text"
              name="name"
              required
              placeholder="me and all hotel ulm"
              className="mt-1 w-56 rounded border border-linie bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-leise">Code-Satz in Ditix</span>
            <input
              type="text"
              name="ditix_aktion"
              placeholder="Tickets für me and all Hotel"
              className="mt-1 w-64 rounded border border-linie bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-leise">Preis je Code (€)</span>
            <input
              type="text"
              name="preis_je_code"
              placeholder="139"
              className="mt-1 w-28 rounded border border-linie bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-leise">Codes ausgegeben</span>
            <input
              type="number"
              name="codes_ausgegeben"
              min={0}
              placeholder="100"
              className="mt-1 w-28 rounded border border-linie bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
          <button type="submit" className="rounded border border-linie px-3 py-1.5 text-sm font-medium">
            Anlegen
          </button>
        </form>
      </section>

      <p className="text-xs text-leise">
        Die Zahl steht in Ditix unter Aktionen, Freiticket-Codes, im Feld „Anzahl eingelöster Codes“.
        Sie läuft kumulativ hoch, deshalb rechnet diese Seite die Differenz zur letzten Ablesung aus.
        Berechne immer die Spalte „Neu“, nicht den Stand.
      </p>
    </div>
  );
}
