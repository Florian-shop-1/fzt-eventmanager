import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfKaufmaennisches } from "@/lib/auth/sitzung";
import { TelefonProbe } from "@/components/TelefonProbe";
import { offeneNotizen } from "@/lib/telefon/werkzeuge";
import { Absendeknopf } from "@/components/Absendeknopf";
import { notizErledigt } from "./aktionen";
import { zeitpunkt } from "@/lib/zeit";

export const metadata = { title: "Telefonassistent | FZT Eventmanager" };
export const dynamic = "force-dynamic";

const ART: Record<string, string> = {
  firma: "Firma oder Event",
  gruppe: "Gruppe",
  rueckruf: "Rückruf",
};

/**
 * Der digitale Assistent am Telefon, zum Ausprobieren.
 *
 * Oben redest du mit ihm, unten steht, was dabei herauskommt: die
 * Rückrufe, die er notiert hat. Beides auf einer Seite, weil das eine
 * ohne das andere nichts aussagt (Florian, 09.10.2026).
 */
export default async function TelefonSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const b = await angemeldeterBenutzer();
  if (!b) redirect("/anmelden");
  if (!darfKaufmaennisches(b.rolle)) redirect("/");
  const { meldung } = await searchParams;

  const notizen = await offeneNotizen().catch(() => []);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Telefonassistent</h1>
        <p className="mt-1 max-w-prose text-sm text-leise">
          So würde ein Anruf laufen. Du tippst, was der Gast sagt, der Assistent antwortet. Unter
          jeder Antwort steht, was er dabei getan hat: nachgeschlagen, SMS geschickt, Rückruf
          notiert. Er bucht nichts und nimmt keine Zahlungen entgegen.
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

      <TelefonProbe />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-leise">
          Rückrufe{notizen.length > 0 && ` (${notizen.length})`}
        </h2>
        {notizen.length === 0 ? (
          <p className="rounded-lg border border-linie bg-flaeche px-4 py-3 text-sm text-leise">
            Nichts offen. Was der Assistent aufnimmt, landet hier.
          </p>
        ) : (
          <ul className="space-y-2">
            {notizen.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border p-4 text-sm"
                style={{
                  borderColor: n.art === "firma" ? "var(--warnung)" : "var(--linie)",
                  background: n.art === "firma" ? "var(--warnung-hell)" : "var(--flaeche)",
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>
                    {ART[n.art] ?? n.art}: {n.name || "ohne Namen"}
                  </strong>
                  <span className="text-xs text-leise">{zeitpunkt(new Date(n.erstelltAm))}</span>
                </div>
                <p className="mt-1">{n.anliegen}</p>
                <div className="mt-1 text-xs text-leise">
                  {n.nummer && <span>Rückruf an {n.nummer}</span>}
                  {n.email && <span> · {n.email}</span>}
                  {n.wunschtermin && <span> · Wunsch: {n.wunschtermin}</span>}
                  {n.personen ? <span> · {n.personen} Personen</span> : null}
                </div>
                <form action={notizErledigt} className="mt-3">
                  <input type="hidden" name="id" value={n.id} />
                  <Absendeknopf text="Erledigt" laeuftText="..." />
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-linie bg-flaeche p-4 text-sm">
        <h2 className="font-medium">Was noch fehlt, bis er ans echte Telefon darf</h2>
        <ul className="mt-2 space-y-1 text-leise">
          <li>Eine Stimme und eine Telefonnummer, etwa über ElevenLabs und einen Anbieter für die Leitung.</li>
          <li>Ein SMS-Anbieter. Heute merkt sich die Probe nur, was in der SMS stünde.</li>
          <li>Der Hinweis auf die Aufzeichnung, falls wir mitschneiden wollen.</li>
          <li>Ein Weg zum Menschen für alle, die keinen Assistenten wollen.</li>
        </ul>
      </section>
    </div>
  );
}
