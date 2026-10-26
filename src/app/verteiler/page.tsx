import { redirect } from "next/navigation";

import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { brevoBereit, entschiedene, verdaechtige } from "@/lib/verteiler/aufraeumen";
import { datumKurz } from "@/components/Status";
import { adresseBehalten, adresseEntfernen } from "./aktionen";

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
  const sicher = treffer.filter((t) => t.art === "sicher");
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
        <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm">
          <strong>{gesamt.toLocaleString("de-DE")} Adressen</strong> stehen in den Magic News. Davon
          fallen <strong>{treffer.length}</strong> auf: {sicher.length} hat Brevo selbst gesperrt,{" "}
          {vermutet.length} sehen nach einem Sammelpostfach oder einem Automaten aus. Entfernen
          heißt: Der Kontakt bleibt in Brevo, bekommt aber keine Magic News mehr.
        </p>
      )}

      {sicher.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-leise">
            Von Brevo gesperrt ({sicher.length})
          </h2>
          <p className="mb-3 text-sm text-leise">
            Hier gibt es nichts zu überlegen: Diese Mails kamen zurück oder wurden als Werbung
            gemeldet. Sie kosten uns Zustellrate, solange sie im Verteiler stehen.
          </p>
          <Liste eintraege={sicher} />
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
