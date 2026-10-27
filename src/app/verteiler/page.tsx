import { redirect } from "next/navigation";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { brevoBereit, entschiedene, verdaechtige } from "@/lib/verteiler/aufraeumen";
import { datumKurz } from "@/components/Status";
import { adresseBehalten, adresseEntfernen, adresseNachsehen } from "./aktionen";

export const metadata = { title: "Verteiler aufräumen | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Der Magic-News-Verteiler, Adresse für Adresse.
 *
 * Vorgeschlagen wird, entschieden wird von Hand: "diese gehen wir einzeln
 * durch zusammen und löschen sie aus unserem verteiler raus" (Florian,
 * 25.10.2026). Wer einmal behalten wurde, kommt nicht wieder.
 */
export default async function VerteilerSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b || !darfKaufmaennisches(b.rolle)) redirect("/");
  const { meldung } = await searchParams;

  let gesamt = 0;
  let treffer: Awaited<ReturnType<typeof verdaechtige>>["treffer"] = [];
  let fehler: string | null = null;

  if (brevoBereit()) {
    try {
      const d = await verdaechtige();
      gesamt = d.gesamt;
      treffer = d.treffer;
    } catch (f) {
      fehler = f instanceof Error ? f.message : "Brevo antwortet gerade nicht.";
    }
  }

  const erledigt = await entschiedene(40);
  const gesperrt = treffer.filter((t) => t.art === "gesperrt");
  const vermutet = treffer.filter((t) => t.art === "vermutung");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Verteiler aufräumen</h1>
        <p className="mt-1 text-sm text-leise">
          Adressen in den Magic News, hinter denen vermutlich kein Gast sitzt. Eine nach der anderen,
          du entscheidest.
        </p>
      </header>

      {meldung && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}
        >
          {meldung}
        </p>
      )}

      {!brevoBereit() && (
        <p className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          Für Brevo fehlt der Schlüssel. Ohne ihn kommen wir an den Verteiler nicht heran.
        </p>
      )}

      {fehler && (
        <p className="rounded-lg border border-blocker bg-blocker-hell px-4 py-3 text-sm">
          <strong style={{ color: "var(--blocker)" }}>Liste nicht lesbar.</strong> {fehler}
        </p>
      )}

      {gesamt > 0 && (
        <div className="space-y-2 rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          <p>
            <strong>{gesamt.toLocaleString("de-DE")} Adressen</strong> stehen in den Magic News.
            Wirklich zu entscheiden sind <strong>{vermutet.length}</strong>: Adressen, hinter denen
            ein Sammelpostfach oder ein Automat zu vermuten ist.
          </p>
          <p className="text-leise">
            Dazu kommen {gesperrt.length.toLocaleString("de-DE")} Adressen, an die Brevo schon
            heute nichts mehr schickt. Das ist keine Aufgabe und vor allem kein Schrott: In dieser
            Zahl stecken vor allem Menschen, die sich abgemeldet haben. Sie kosten uns keine
            Zustellrate, weil gar nichts an sie hinausgeht.
          </p>
          <p className="text-leise">
            Entfernen heißt immer: Der Kontakt bleibt in Brevo samt seiner Sperre, er steht nur
            nicht mehr in den Magic News.
          </p>
        </div>
      )}

      {gesperrt.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-leise">
            Von Brevo gesperrt ({gesperrt.length})
          </h2>
          <p className="mb-3 text-sm text-leise">
            An diese Adressen geht ohnehin nichts mehr hinaus. Brevo sperrt aus drei Gründen, und
            die Liste verrät nicht, welcher es war: Die Mail ist abgeprallt, jemand hat uns
            gemeldet, oder jemand hat sich abgemeldet. Der letzte Fall ist der häufigste, und da
            gehört die Adresse genau dorthin, wo sie ist. Mit „Grund nachsehen“ fragst du für eine
            einzelne Adresse nach.
          </p>
          <details>
            <summary className="cursor-pointer text-sm text-leise">
              Die {gesperrt.length} gesperrten Adressen anzeigen
            </summary>
            <div className="mt-3">
              <Liste eintraege={gesperrt} />
            </div>
          </details>
        </section>
      )}

      {vermutet.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-leise">
            Sieht nach keinem Gast aus ({vermutet.length})
          </h2>
          <p className="mb-3 text-sm text-leise">
            Vermutung, keine Tatsache. Bei kleinen Betrieben ist so eine Adresse manchmal doch ein
            Mensch, der gern zu uns kommt. Im Zweifel behalten.
          </p>
          <Liste eintraege={vermutet} />
        </section>
      )}

      {brevoBereit() && !fehler && treffer.length === 0 && (
        <p className="rounded-lg border border-dashed border-linie px-6 py-10 text-center text-sm text-leise">
          Nichts aufzuräumen. Entweder ist der Verteiler sauber, oder alles Auffällige ist schon
          entschieden.
        </p>
      )}

      {erledigt.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-leise">
            Schon entschieden
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {erledigt.map((e) => (
                <tr key={e.email} className="border-b border-linie last:border-0">
                  <td className="py-2">{e.email}</td>
                  <td className="w-40 py-2 text-xs">
                    {e.entscheidung === "entfernt" ? (
                      <span style={{ color: "var(--blocker)" }}>aus dem Verteiler</span>
                    ) : (
                      <span style={{ color: "var(--gut)" }}>behalten</span>
                    )}
                  </td>
                  <td className="w-48 py-2 text-xs text-leise">
                    {e.von}, {datumKurz(e.am.slice(0, 10))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Liste({
  eintraege,
}: {
  eintraege: Awaited<ReturnType<typeof verdaechtige>>["treffer"];
}) {
  return (
    <ul className="space-y-2">
      {eintraege.map((t) => (
        <li
          key={t.email}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linie bg-flaeche px-4 py-3"
        >
          <div className="min-w-0">
            <div className="font-medium">
              {t.email}
              {(t.vorname || t.nachname) && (
                <span className="text-leise"> · {[t.vorname, t.nachname].filter(Boolean).join(" ")}</span>
              )}
            </div>
            <div className="text-xs text-leise">{t.grund}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {t.art === "gesperrt" && (
              <form action={adresseNachsehen}>
                <input type="hidden" name="email" value={t.email} />
                <button
                  type="submit"
                  className="rounded-md border border-linie px-3 py-1.5 text-sm"
                  title="In Brevo nachsehen: abgeprallt, beschwert oder abgemeldet?"
                >
                  Grund nachsehen
                </button>
              </form>
            )}
            <form action={adresseEntfernen}>
              <input type="hidden" name="email" value={t.email} />
              <input type="hidden" name="grund" value={t.grund} />
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ background: "var(--blocker)" }}
              >
                Aus dem Verteiler
              </button>
            </form>
            <form action={adresseBehalten}>
              <input type="hidden" name="email" value={t.email} />
              <input type="hidden" name="grund" value={t.grund} />
              <button type="submit" className="rounded-md border border-linie px-3 py-1.5 text-sm">
                Behalten
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
