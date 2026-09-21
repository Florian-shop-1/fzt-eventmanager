import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer, darfEinladen } from "@/lib/auth/sitzung";
import { LinkKopieren } from "@/components/LinkKopieren";
import { Absendeknopf } from "@/components/Absendeknopf";
import { BEREICHE, einladungsLink, offeneEinladungen } from "@/lib/dienstplan/einladung";
import { linkAbschalten, linkErneuern } from "./aktionen";

export const metadata = { title: "Einladungslinks | FZT Eventmanager" };
export const dynamic = "force-dynamic";

/**
 * Einladungslinks je Bereich, für Florian und Kevin.
 *
 * Ein Link je Bereich, beliebig oft verwendbar: Wer ihn bekommt, legt sich
 * selbst einen Zugang an und ist sofort drin. Deshalb steht bei jedem
 * Bereich, was diese Rolle zu sehen bekommt.
 */
export default async function EinladungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ meldung?: string }>;
}) {
  const ich = await angemeldeterBenutzer();
  if (!ich) redirect("/anmelden");
  if (!darfEinladen(ich)) redirect("/");
  const { meldung } = await searchParams;
  const offen = await offeneEinladungen();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Einladungslinks</h1>
          <p className="mt-1 text-sm text-leise">
            Für jeden Bereich ein Link. Wer ihn bekommt, trägt sich selbst ein: Name, E-Mail, eigenes
            Passwort. Danach ist er angemeldet und sieht genau das, was zu seinem Bereich gehört.
          </p>
        </div>
        <Link href="/einstellungen/benutzer" className="rounded-md border border-linie px-3 py-1.5 text-sm hover:bg-gold-hell">
          Zu den Zugängen
        </Link>
      </header>

      {meldung && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--gut)", background: "var(--gut-hell)" }}>
          {meldung}
        </p>
      )}

      <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--warnung)", background: "var(--warnung-hell)" }}>
        Ein Link ist wie ein Schlüssel: Jeder, der ihn hat, kann sich damit einen Zugang anlegen. Gib
        ihn nur im jeweiligen Team weiter. Wenn ein Link irgendwo gelandet ist, wo er nicht hingehört,
        erzeug einfach einen neuen, dann gilt der alte nicht mehr.
      </p>

      <ul className="space-y-4">
        {BEREICHE.map((b) => {
          const e = offen.find((o) => o.rolle === b.rolle);
          const link = e ? einladungsLink(e.token) : null;
          return (
            <li key={b.rolle} id={`b-${b.rolle}`} className="scroll-mt-24 space-y-3 rounded-lg border border-linie bg-flaeche p-5">
              <div>
                <h2 className="text-lg font-semibold">{b.titel}</h2>
                <p className="text-sm text-leise">{b.text}</p>
                {b.achtung && (
                  <p className="mt-1 text-sm" style={{ color: "var(--warnung)" }}>
                    {b.achtung}
                  </p>
                )}
              </div>

              {link ? (
                <>
                  <LinkKopieren link={link} />
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Hallo! Hier ist dein Zugang zum Eventmanager des Florian Zimmer Theaters. Einmal eintragen, fertig: ${link}`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md px-3 py-1.5 font-medium text-white"
                      style={{ background: "#25D366" }}
                    >
                      Per WhatsApp teilen
                    </a>
                    <a
                      href={`mailto:?subject=${encodeURIComponent("Dein Zugang zum Eventmanager")}&body=${encodeURIComponent(
                        `Hallo!\n\nHier ist dein Zugang zum Eventmanager des Florian Zimmer Theaters. Einmal eintragen, fertig:\n${link}\n\nViele Grüße`,
                      )}`}
                      className="rounded-md border border-linie px-3 py-1.5 hover:bg-gold-hell"
                    >
                      Per E-Mail teilen
                    </a>
                    <span className="text-leise">
                      {e!.benutzt === 0
                        ? "Noch niemand hat sich eingetragen."
                        : `${e!.benutzt} ${e!.benutzt === 1 ? "Person hat" : "Personen haben"} sich eingetragen.`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <form action={linkErneuern}>
                      <input type="hidden" name="rolle" value={b.rolle} />
                      <button type="submit" className="text-leise underline">
                        neuen Link erzeugen (alter gilt dann nicht mehr)
                      </button>
                    </form>
                    <form action={linkAbschalten}>
                      <input type="hidden" name="rolle" value={b.rolle} />
                      <button type="submit" className="text-leise underline">
                        Link abschalten
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <form action={linkErneuern}>
                  <input type="hidden" name="rolle" value={b.rolle} />
                  <Absendeknopf text="Link erstellen" laeuftText="..." />
                </form>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-leise">
        Für eine einzelne Person mit fester E-Mail gibt es weiter den persönlichen Link bei den
        Zugängen. Der gilt nur einmal und hakt Personalbogen und Geheimhaltung gleich ab, wenn sie
        schon vorliegen.
      </p>
    </div>
  );
}
