import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen } from "@/lib/auth/sitzung";
import { kommendeTermine, holeSpielplan } from "@/lib/ditix/spielplan";
import { ditixVerkaufLink } from "@/lib/ditix/link";
import { absagenListe } from "@/lib/absage/db";
import { datumMitWochentag } from "@/lib/zeit";
import { Absendeknopf } from "@/components/Absendeknopf";
import { showAbsagen } from "./aktionen";

export const metadata = { title: "Show absagen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Eine Show absagen, wenn sie aus produktionstechnischen oder anderen
 * Gründen nicht stattfinden kann. Nur Florian und Kevin (Florian,
 * 29.09.2026).
 */
export default async function AbsagenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/anmelden");
  if (benutzer.rolle !== "chef" && !darfEinladen(benutzer)) redirect("/");
  const { meldung } = await searchParams;

  const [termine, absagen, imShop] = await Promise.all([
    kommendeTermine(60),
    absagenListe(),
    holeSpielplan().catch(() => []),
  ]);
  const abgesagteIds = new Set(absagen.map((a) => a.ditixEventId));
  const wahl = termine.filter((t) => !abgesagteIds.has(t.ditixEventId));

  /*
    Eine Absage im Eventmanager nimmt die Show nicht aus dem Verkauf.

    Der Eventmanager liest Ditix nur, er schreibt dort nichts (siehe
    lib/ditix/spielplan.ts). Eine abgesagte Vorstellung steht deshalb
    weiter im Shop, und ein Gast kann Karten dafuer kaufen: genau so
    passiert mit der Vorstellung am 10.10. (Florian, 05.10.2026).

    Hier steht deshalb, welche Absage im Shop noch zu haben ist, mit dem
    Link in die Ditix-Verwaltung. Schliessen muss es weiter ein Mensch.
  */
  const nochImVerkauf = new Set(
    imShop
      .filter((v) => abgesagteIds.has(v.id) && v.ticketSaleState !== "CLOSED")
      .map((v) => v.id),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Show absagen</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Alle bezahlten Gäste dieser Show bekommen einen Mailentwurf mit Ausweichterminen und einer
          Entschädigung (Upgrade oder Souvenirglas). Nichts wird sofort verschickt, du siehst und prüfst jeden
          Entwurf zuerst.
        </p>
      </header>

      {meldung && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}>
          {meldung}
        </div>
      )}

      {nochImVerkauf.size > 0 && (
        <div
          className="rounded-lg border-2 px-4 py-3 text-sm"
          style={{ borderColor: "var(--blocker)", background: "var(--blocker-hell)" }}
        >
          <strong>
            {nochImVerkauf.size === 1
              ? "Eine abgesagte Vorstellung steht im Shop noch zum Verkauf."
              : `${nochImVerkauf.size} abgesagte Vorstellungen stehen im Shop noch zum Verkauf.`}
          </strong>{" "}
          Die Absage hier nimmt sie dort nicht heraus, das muss in Ditix passieren. Sonst kauft jemand
          Karten für einen Abend, den es nicht gibt. Die betroffenen stehen unten mit einem Link dorthin.
        </div>
      )}

      <details className="rounded-lg border border-linie bg-flaeche p-4">
        <summary className="cursor-pointer font-medium">Show auswählen und absagen</summary>
        <form action={showAbsagen} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Welche Show fällt aus</span>
            <select name="ditixEventId" required className="w-full">
              {wahl.map((t) => (
                <option key={t.ditixEventId} value={t.ditixEventId}>
                  {datumMitWochentag(t.datum)}, {t.uhrzeit} Uhr – {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-leise">Grund (steht so in der Mail an die Gäste)</span>
            <input name="grund" defaultValue="aus produktionstechnischen Gründen" maxLength={300} className="w-full" />
          </label>
          <details className="rounded border px-3 py-2" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
            <summary className="cursor-pointer text-sm font-medium">Wirklich absagen</summary>
            <p className="mt-2 text-sm text-leise">
              Das legt für jeden bezahlten Gast dieser Show einen Mailentwurf an und pausiert die
              Vorfreude-Mail für sie. Rückgängig machen lässt es sich nicht, aber verschickt wird noch nichts.
            </p>
            <div className="mt-2">
              <Absendeknopf text="Show jetzt absagen" laeuftText="Wird angelegt..." />
            </div>
          </details>
        </form>
      </details>

      {absagen.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">Bisherige Absagen</h2>
          <ul className="divide-y divide-linie rounded-lg border border-linie bg-flaeche text-sm">
            {absagen.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Link href={`/absagen/${a.id}`} className="flex-1 underline">
                  {datumMitWochentag(a.datum)}, {a.uhrzeit} Uhr – {a.show}
                </Link>
                {nochImVerkauf.has(a.ditixEventId) ? (
                  <a
                    href={ditixVerkaufLink(a.ditixEventId) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded px-2 py-0.5 text-xs font-semibold"
                    style={{ background: "var(--blocker-hell)", color: "var(--blocker)" }}
                  >
                    noch im Verkauf: in Ditix schließen
                  </a>
                ) : (
                  <span className="text-xs" style={{ color: "var(--gut)" }}>
                    nicht mehr im Verkauf
                  </span>
                )}
                <span className="text-xs text-leise">abgesagt von {a.abgesagtVon}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
