import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches, darfBuchhaltung } from "@/lib/auth/sitzung";
import { Absendeknopf } from "@/components/Absendeknopf";
import { alleRechnungen, monatsname, rechnungsEinstellung, type WeinRechnung } from "@/lib/wein/rechnung";
import { zahlungZuRechnung, type Zahlungstreffer } from "@/lib/wein/zahlung";
import { jetztPruefen } from "./aktionen";

export const metadata = { title: "Rechnungen an die Gastro | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const euro = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const datumDe = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "";

/**
 * Die Rechnungen an die Gastro und ihr Zahlstand.
 *
 * Bisher stand der Stand nur beim jeweiligen Monat und kam aus Lexware
 * Office. Jetzt gibt es eine Liste über alle Monate, und ob bezahlt wurde,
 * beantwortet das eigene Konto: Wir lesen die Umsätze ohnehin täglich
 * (Florian, 30.09.2026).
 */
export default async function GastroRechnungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle) && !darfBuchhaltung(b)) redirect("/");
  const { meldung } = await searchParams;

  const [liste, e] = await Promise.all([alleRechnungen(), rechnungsEinstellung()]);

  // Zu jeder offenen Rechnung nachsehen, ob am Konto etwas dazu passt.
  const treffer = new Map<string, Zahlungstreffer | null>();
  for (const r of liste) {
    if (r.bezahltAm) continue;
    treffer.set(r.id, await zahlungZuRechnung(r).catch(() => null));
  }

  const offen = liste.filter((r) => !r.bezahltAm && r.versendetAm);
  const offenCent = offen.reduce((n, r) => n + r.bruttoCent, 0);
  const bezahlt = liste.filter((r) => r.bezahltAm);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rechnungen an die Gastro</h1>
          <p className="mt-1 max-w-prose text-sm text-leise">
            Was {e.empfaenger.name} für die Magicuvée-Lieferungen schuldet, und was schon auf unserem
            Konto eingegangen ist. Erkannt wird eine Zahlung an der Rechnungsnummer im Verwendungszweck,
            sonst am Betrag zusammen mit dem Namen.
          </p>
        </div>
        <span className="flex flex-wrap gap-3 text-sm">
          <Link href="/bestellungen" className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell">
            Zu den Bestellungen
          </Link>
          <form action={jetztPruefen}>
            <Absendeknopf text="Konto jetzt prüfen" laeuftText="Wird geprüft..." />
          </form>
        </span>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      <section className="flex flex-wrap gap-4">
        <Kachel zahl={String(offen.length)} was="offen" hinweis={euro(offenCent)} betont={offen.length > 0} />
        <Kachel
          zahl={String(bezahlt.length)}
          was="bezahlt"
          hinweis={euro(bezahlt.reduce((n, r) => n + r.bruttoCent, 0))}
        />
        <Kachel zahl={String(liste.length)} was="Rechnungen insgesamt" hinweis="seit Beginn" />
      </section>

      {liste.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Es gibt noch keine Rechnung an die Gastro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linie bg-flaeche">
          <table className="w-full text-sm">
            <thead className="border-b border-linie text-left text-xs uppercase tracking-wide text-leise">
              <tr>
                <th className="px-4 py-2 font-medium">Monat</th>
                <th className="px-4 py-2 font-medium">Nummer</th>
                <th className="px-4 py-2 text-right font-medium">Betrag</th>
                <th className="px-4 py-2 font-medium">Versendet</th>
                <th className="px-4 py-2 font-medium">Bezahlt</th>
                <th className="px-4 py-2 font-medium">PDF</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                <Zeile key={r.id} r={r} treffer={treffer.get(r.id) ?? null} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-leise">
        Der Stand wird beim täglichen Lauf mitgeprüft. Wer nicht warten will, drückt oben auf „Konto jetzt
        prüfen". Solange Lexware Office noch läuft, wird dessen Stand zusätzlich abgefragt; verlässlich ist
        das eigene Konto.
      </p>
    </div>
  );
}

function Zeile({ r, treffer }: { r: WeinRechnung; treffer: Zahlungstreffer | null }) {
  const offenTage = r.versendetAm && !r.bezahltAm
    ? Math.round((Date.now() - Date.parse(r.versendetAm)) / 86400000)
    : 0;

  return (
    <tr className="border-b border-linie last:border-0 align-top">
      <td className="px-4 py-3 whitespace-nowrap">{monatsname(r.monat)}</td>
      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{r.nummer ?? "ohne"}</td>
      <td className="px-4 py-3 text-right tabular-nums">{euro(r.bruttoCent)}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        {r.versendetAm ? (
          datumDe(r.versendetAm)
        ) : (
          <span style={{ color: "var(--warnung)" }}>noch nicht</span>
        )}
      </td>
      <td className="px-4 py-3">
        {r.bezahltAm ? (
          <span style={{ color: "var(--gut)" }}>{datumDe(r.bezahltAm)}</span>
        ) : treffer ? (
          <>
            <span style={{ color: "var(--gut)" }}>
              {treffer.buchungstag.split("-").reverse().join(".")} gefunden
            </span>
            <div className="text-xs text-leise">
              {treffer.grund === "nummer" ? "Nummer im Verwendungszweck" : "Betrag und Name passen"} ·{" "}
              {euro(treffer.betragCent)}
            </div>
          </>
        ) : (
          <>
            <span style={{ color: offenTage > 14 ? "var(--blocker)" : "var(--warnung)" }}>offen</span>
            {offenTage > 0 && (
              <div className="text-xs text-leise">seit {offenTage} Tagen verschickt</div>
            )}
          </>
        )}
      </td>
      <td className="px-4 py-3">
        {r.hatPdf ? (
          <a
            href={`/bestellungen/rechnung/${r.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline"
          >
            ansehen
          </a>
        ) : (
          <span className="text-xs text-leise">keines</span>
        )}
      </td>
    </tr>
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
      style={{ borderColor: betont ? "var(--warnung)" : "var(--linie)", background: "var(--flaeche)" }}
    >
      <div className="text-2xl font-semibold tabular-nums">{zahl}</div>
      <div className="text-sm">{was}</div>
      <div className="text-xs text-leise">{hinweis}</div>
    </div>
  );
}
