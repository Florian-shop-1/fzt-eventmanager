import { buchungenFuerTag } from "@/lib/db/shop-buchungen";
import { widersprochene } from "@/lib/db/werbewiderspruch";
import { abgesagteEventIds } from "@/lib/absage/db";
import { baueRegioTvInfo, hatMenue, REGIOTV_TAG } from "@/lib/mail/regiotv-info";
import { Absendeknopf } from "@/components/Absendeknopf";
import { anAlleSchicken, bereitsGeschrieben, testmailSchicken, ueberspringen } from "./aktionen";

export const metadata = { title: "RegioTV-Info-Mail | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Die Info-Mail an alle Gaeste mit RegioTV-Tickets (Florian, 22.10.2026): Aufzeichnung ab 19:30 Uhr, und die Menues,
 * die beim Kauf noch nicht buchbar waren, lassen sich jetzt dazubuchen.
 *
 * Erst die Testmail an dich, dann der Versand. Jede Adresse bekommt die Mail hoechstens einmal.
 */
export default async function RegioTvInfoSeite({ searchParams }: { searchParams: Promise<{ meldung?: string }> }) {
  const { meldung } = await searchParams;
  const buchungen = await buchungenFuerTag(REGIOTV_TAG);
  const abgemeldet = await widersprochene(buchungen.map((b) => b.email));
  const abgesagt = await abgesagteEventIds();
  const schonDa = await bereitsGeschrieben();

  const zeilen = await Promise.all(
    buchungen.map(async (b) => ({ b, grund: await ueberspringen(b, abgemeldet, abgesagt, schonDa) })),
  );
  const anstehend = zeilen.filter((z) => !z.grund);
  const mitMenue = anstehend.filter((z) => hatMenue(z.b)).length;
  const beispiel = anstehend.find((z) => !hatMenue(z.b))?.b ?? anstehend[0]?.b ?? null;
  const mail = beispiel ? baueRegioTvInfo(beispiel) : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">RegioTV-Info-Mail</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          Aufzeichnung ab 19:30 Uhr, und die Menüs, die beim Kauf noch nicht buchbar waren, lassen sich jetzt zum Ticket dazubuchen.
          Erst die Testmail an dich, dann der Versand. Jede Adresse bekommt die Mail höchstens einmal.
        </p>
      </header>

      {meldung && (
        <div className="rounded-md border border-gold bg-gold-hell px-4 py-3 text-sm text-gold-dunkel">{meldung}</div>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Wer die Mail bekommt</h2>
        <p className="text-sm">
          <strong>{anstehend.length}</strong> Gast/Gäste stehen an, davon {mitMenue} mit Menü (nur Hinweis auf 19:30 Uhr, ohne Knopf).
          {zeilen.length - anstehend.length > 0 ? ` ${zeilen.length - anstehend.length} werden übersprungen.` : ""}
        </p>
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="text-left text-leise">
              <th className="py-1 pr-4">Name</th>
              <th className="py-1 pr-4">E-Mail</th>
              <th className="py-1 pr-4">Menü</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(({ b, grund }) => (
              <tr key={b.id} className="border-t border-linie">
                <td className="py-1 pr-4">{b.name || "-"}</td>
                <td className="py-1 pr-4">{b.email || "-"}</td>
                <td className="py-1 pr-4">{hatMenue(b) ? "ja" : "nein"}</td>
                <td className="py-1">{grund ? `übersprungen: ${grund}` : "steht an"}</td>
              </tr>
            ))}
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-leise">Für den 1. Dezember gibt es keine Buchungen.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {mail && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Der Wortlaut</h2>
          <p className="text-sm text-leise">Betreff: {mail.betreff}</p>
          <pre className="max-w-3xl whitespace-pre-wrap rounded-md border border-linie bg-flaeche p-4 text-sm">{mail.text}</pre>
          <form action={testmailSchicken}>
            <Absendeknopf text="Testmail an mich schicken" laeuftText="Wird geschickt..." />
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">An alle schicken</h2>
        <form action={anAlleSchicken} className="flex flex-wrap items-center gap-3">
          <Absendeknopf
            text={`${anstehend.length} Mail(s) jetzt verschicken`}
            laeuftText="Wird verschickt..."
            deaktiviert={anstehend.length === 0}
          />
          <span className="text-sm text-leise">Erst die Testmail ansehen. Danach lässt sich der Versand nicht zurückholen.</span>
        </form>
      </section>
    </div>
  );
}
