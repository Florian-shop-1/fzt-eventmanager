import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfBuchhaltung, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { alleRechnungen, einstellung } from "@/lib/rechnung/db";
import { StatusSchild, euro, faelligText, tagKurz } from "@/components/RechnungStatus";
import { Absendeknopf } from "@/components/Absendeknopf";
import { zahlungszielSpeichern } from "./aktionen";

export const metadata = { title: "Rechnungen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Alle Rechnungen mit ihrem Stand.
 *
 * Eine Zeile je Rechnung, und in der Zeile steht alles, was man im Alltag
 * wissen will: Wer, wie viel, ob die Mail raus ist, wann sie fällig ist
 * und was davon bezahlt wurde. Der Rest steht auf der Detailseite.
 */
export default async function RechnungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string; nur?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle) && !darfBuchhaltung(b)) redirect("/");
  const { meldung, nur } = await searchParams;

  const [alle, e] = await Promise.all([alleRechnungen(), einstellung()]);
  const liste =
    nur === "offen"
      ? alle.filter((r) => !["PAID", "CANCELLED"].includes(r.status))
      : nur === "bezahlt"
        ? alle.filter((r) => r.status === "PAID")
        : alle;

  const offen = alle.filter((r) => !["PAID", "CANCELLED"].includes(r.status));
  const offenSumme = offen.reduce((n, r) => n + r.offenCent, 0);
  const ueberfaellig = offen.filter((r) => r.status === "OVERDUE");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rechnungen</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Was gestellt, versendet, fällig und bezahlt ist. Zahlungen vom Konto ordnet das Programm selbst zu,
            sobald die Rechnungsnummer im Verwendungszweck steht und der Betrag passt.
          </p>
        </div>
        <Link
          href="/zahlungseingaenge"
          className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell"
        >
          Zahlungseingänge
        </Link>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <Kachel zahl={String(offen.length)} was="offene Rechnungen" hinweis={euro(offenSumme)} />
        <Kachel
          zahl={String(ueberfaellig.length)}
          was="überfällig"
          hinweis={ueberfaellig.length > 0 ? euro(ueberfaellig.reduce((n, r) => n + r.offenCent, 0)) : "nichts offen"}
          betont={ueberfaellig.length > 0}
        />
        <Kachel
          zahl={String(alle.filter((r) => r.status === "PAID").length)}
          was="bezahlt"
          hinweis={`von ${alle.length} insgesamt`}
        />
        <Kachel
          zahl={e.zuletztAm ? tagKurz(e.zuletztAm) : "nie"}
          was="Bank zuletzt abgeglichen"
          hinweis={e.zuletztAm ? `${e.zuletztUmsaetze} neue Umsätze` : "noch kein Abgleich"}
        />
      </div>

      <nav className="flex flex-wrap gap-1 text-sm">
        {[
          ["", "Alle"],
          ["offen", "Offen"],
          ["bezahlt", "Bezahlt"],
        ].map(([wert, titel]) => (
          <Link
            key={wert}
            href={wert ? `/rechnungen?nur=${wert}` : "/rechnungen"}
            className={`rounded-md px-3 py-1.5 ${
              (nur ?? "") === wert ? "bg-text text-flaeche" : "border border-linie"
            }`}
          >
            {titel}
          </Link>
        ))}
      </nav>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Hier steht noch keine Rechnung. Sobald eine erstellt wird, erscheint sie mit ihrem Stand.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Rechnung</th>
                <th className="px-4 py-2 font-medium">Kunde</th>
                <th className="px-4 py-2 text-right font-medium">Betrag</th>
                <th className="px-4 py-2 font-medium">Versand</th>
                <th className="px-4 py-2 font-medium">Fällig</th>
                <th className="px-4 py-2 font-medium">Zahlung</th>
                <th className="px-4 py-2 font-medium">Stand</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                <tr key={r.id} className="border-b border-linie last:border-0 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/rechnungen/${r.id}`} className="font-medium underline">
                      {r.nummer}
                    </Link>
                    <div className="text-xs text-leise">{tagKurz(r.rechnungsdatum)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.kunde}
                    {r.kundeEmail && <div className="text-xs text-leise">{r.kundeEmail}</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {euro(r.betragCent)}
                    {r.bezahltCent > 0 && r.offenCent > 0 && (
                      <div className="text-xs text-leise">offen {euro(r.offenCent)}</div>
                    )}
                    {r.ueberzahlungCent && (
                      <div className="text-xs" style={{ color: "var(--warnung)" }}>
                        Überzahlung {euro(r.ueberzahlungCent)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.mailStatus === "gesendet" ? (
                      <>
                        <span style={{ color: "var(--gut)" }}>versendet</span>
                        <div className="text-xs text-leise">
                          {r.versendetAm ? tagKurz(r.versendetAm) : ""} {r.versendetAn ? `· ${r.versendetAn}` : ""}
                        </div>
                      </>
                    ) : r.mailStatus === "fehlgeschlagen" ? (
                      <span style={{ color: "var(--blocker)" }}>Versand fehlgeschlagen</span>
                    ) : (
                      <span className="text-leise">noch nicht versendet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {tagKurz(r.faelligAm)}
                    <div
                      className="text-xs"
                      style={{ color: r.status === "OVERDUE" ? "var(--blocker)" : "var(--text-leise)" }}
                    >
                      {faelligText(r)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.zahlungen.length === 0 ? (
                      <span className="text-leise">-</span>
                    ) : (
                      r.zahlungen.map((z) => (
                        <div key={z.id} className="text-xs">
                          {tagKurz(z.datum)} · {euro(z.betragCent)}
                          <span className="text-leise">
                            {" "}
                            {z.herkunft === "automatisch" ? "(Bank)" : "(manuell)"}
                          </span>
                        </div>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusSchild status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <summary className="cursor-pointer font-medium">Einstellungen</summary>
        <form action={zahlungszielSpeichern} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Standard-Zahlungsziel in Tagen</span>
            <input name="tage" type="number" min={0} max={90} defaultValue={e.zahlungszielTage} className="w-28" />
          </label>
          <Absendeknopf text="Speichern" laeuftText="..." />
        </form>
        <p className="mt-3 text-xs text-leise">
          Konto für den Abgleich: {e.bank}, endet auf {e.kontoEndetAuf} ({e.bic}). Die vollständige IBAN und die
          Zugangsdaten stehen nicht im Programm, sondern nur auf dem Rechner, der die Umsätze abholt.
        </p>
      </details>
    </div>
  );
}

function Kachel({
  zahl,
  was,
  hinweis,
  betont,
}: {
  zahl: string;
  was: string;
  hinweis: string;
  betont?: boolean;
}) {
  return (
    <div
      className="min-w-44 rounded-lg border px-4 py-3"
      style={{
        borderColor: betont ? "var(--blocker)" : "var(--linie)",
        background: betont ? "var(--blocker-hell)" : "var(--flaeche)",
      }}
    >
      <div className="text-2xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      <div className="text-xs text-leise">{hinweis}</div>
    </div>
  );
}
